'use strict';
const express=require('express');
const cookieParser=require('cookie-parser');
const crypto=require('crypto');
const {tx,bumpStateVersion}=require('./db');
const {authMiddleware,requireAuth,csrfRequired,isInternal}=require('./auth');
const B=require('./business');

const router=express.Router();
router.use(express.json({limit:'1mb'}));
router.use(cookieParser());
router.use(authMiddleware);

function fail(status,code,message,extra={}){throw Object.assign(new Error(message),{status,code,...extra})}
function txt(v,max=2000){return String(v??'').trim().slice(0,max)}
function activeAttendance(s){return !['Completed','Cancelled','Rejected'].includes(String(s||''))}
function terminalTask(s){return ['Completed','Cancelled','Resolved by Override'].includes(String(s||''))}
function bool(v){return v===true||String(v).toLowerCase()==='true'}
function canonicalEvidence(v){
  let s=txt(v,120).toLowerCase().replace(/component/g,'').replace(/customer-specific/g,'customer specific').replace(/[^a-z0-9]+/g,' ').trim();
  const map={
    'fault defect':'fault defect','fault':'fault defect','defect':'fault defect',
    'before repair':'before repair','after repair':'after repair',
    'parts fitted':'parts fitted','completion':'completion','registration':'registration',
    'meter diagnostic reading':'meter diagnostic reading','diagnostic reading':'meter diagnostic reading'
  };
  return map[s]||s;
}
function evidenceLabel(v){
  const c=canonicalEvidence(v);
  return ({'fault defect':'Fault / Defect','before repair':'Before Repair','after repair':'After Repair','parts fitted':'Parts Fitted','completion':'Completion','registration':'Registration','meter diagnostic reading':'Meter / Diagnostic Reading'})[c]||txt(v,120)||'Required Evidence';
}
function fallbackTaskRule(t){
  if(t.legacy_ref==='MOB-TK41')return{requires:['notes','fault','cause','measurement'],anyEvidence:['Fault / Defect','Meter / Diagnostic Reading'],requiredEvidence:[]};
  if(t.task_type==='Diagnosis')return{requires:['notes','fault','cause'],anyEvidence:['Fault / Defect'],requiredEvidence:[]};
  if(t.task_type==='Repair')return{requires:['notes'],anyEvidence:['After Repair','Parts Fitted','Completion'],requiredEvidence:[]};
  if(t.task_type==='Service')return{requires:['notes','mileage'],anyEvidence:['Completion','Meter / Diagnostic Reading'],requiredEvidence:[]};
  if(t.task_type==='Inspection')return{requires:['notes'],anyEvidence:['Fault / Defect','Completion'],requiredEvidence:[]};
  return{requires:['notes'],anyEvidence:[],requiredEvidence:[]};
}
function taskRule(t){
  const base=fallbackTaskRule(t),cr=t.completion_rules||{},er=t.evidence_rules||{};
  const requires=Array.isArray(cr.requires)?cr.requires:base.requires;
  const anyEvidence=Array.isArray(er.anyOf)?er.anyOf:Array.isArray(er.evidenceAny)?er.evidenceAny:base.anyEvidence;
  const requiredEvidence=Array.isArray(er.requiredTypes)?er.requiredTypes:Array.isArray(er.required)?er.required:base.requiredEvidence;
  return{requires,anyEvidence,requiredEvidence};
}
function answerMissing(rule,answers){
  const a=answers||{},m=[];
  for(const k of rule.requires||[]){
    if(k==='notes'&&!txt(a.notes))m.push('task notes');
    else if(k==='fault'&&!txt(a.fault))m.push('fault found');
    else if(k==='cause'&&!txt(a.cause))m.push('cause');
    else if(k==='measurement'&&!txt(a.measurement))m.push('measurement');
    else if(k==='mileage'&&!(Number(a.mileage)>0))m.push('mileage');
  }
  return m;
}
function isTechnician(user){return !!user&&isInternal(user)&&(user.roles||[]).includes('technician')}

async function loadContext(c,user,woRef,attendanceRef,{lock=false}={}){
  const r=await c.query(`SELECT
    w.id work_order_id,w.legacy_ref work_order_ref,w.status work_order_status,w.financial_status,w.current_owner,w.next_action,w.data work_order_data,w.contract_id,
    a.id attendance_id,a.legacy_ref attendance_ref,a.attendance_type,a.status attendance_status,a.arrived_at,a.departed_at,a.outcome,a.data attendance_data,
    tech.id technician_id,tech.legacy_ref technician_ref,tech.role_name,
    v.registration,
    ct.data contract_data
    FROM work_orders w
    JOIN vehicles v ON v.id=w.vehicle_id
    JOIN attendances a ON a.work_order_id=w.id AND a.legacy_ref=$2
    JOIN attendance_resource_assignments ara ON ara.attendance_id=a.id
    JOIN technicians tech ON tech.id=ara.technician_id AND tech.user_id=$3
    LEFT JOIN contracts ct ON ct.id=w.contract_id
    WHERE w.legacy_ref=$1 ${lock?'FOR UPDATE OF w,a':''}`,[woRef,attendanceRef,user.id]);
  if(!r.rowCount)fail(403,'ACCESS_DENIED','This Attendance is not assigned to the signed-in Technician');
  return r.rows[0];
}
async function loadTasks(c,workOrderId){
  return (await c.query(`SELECT t.*,tt.completion_rules,tt.evidence_rules
    FROM tasks t LEFT JOIN task_templates tt ON tt.id=t.task_template_id
    WHERE t.work_order_id=$1 ORDER BY t.created_at,t.legacy_ref`,[workOrderId])).rows;
}
async function loadEvidence(c,workOrderId){
  return (await c.query(`SELECT e.legacy_ref,e.evidence_type,e.task_id,e.attendance_id,e.storage_status
    FROM evidence_metadata e WHERE e.work_order_id=$1 AND e.removed_at IS NULL`,[workOrderId])).rows;
}
function journeyState(ctx){
  const d=ctx.attendance_data||{},j=d.journey||{},s=ctx.attendance_status;
  return{
    accepted:!!j.acceptedAt||!['Planned','Dispatched'].includes(s),
    enRoute:!!j.enRouteAt||!!ctx.arrived_at||['On Site','In Progress','Paused','Stopped for Safety','Completed'].includes(s),
    onSite:!!j.onSiteAt||!!ctx.arrived_at||['In Progress','Paused','Stopped for Safety','Completed'].includes(s),
    registration:!!d.vehicleConfirmation?.match,
    safety:!!d.safety?.safe,
    workStarted:!!j.workStartedAt||['In Progress','Paused','Stopped for Safety','Completed'].includes(s)
  };
}
function journeyPolicy(ctx){
  const remote=/remote support/i.test(ctx.attendance_type||''),workshop=/workshop/i.test(ctx.role_name||'');
  return{remote,workshop,requiresEnRoute:!remote&&!workshop,requiresOnSite:!remote,requiresRegistration:!remote,requiresSafety:!remote};
}
function signatureRequired(ctx){
  const w=ctx.work_order_data||{},c=ctx.contract_data||{};
  return bool(w.signatureRequired)||bool(w.workflow?.signatureRequired)||bool(c.signatureRequired)||bool(c.workflow?.signatureRequired);
}
function basicMissing(ctx){
  const p=journeyPolicy(ctx),j=journeyState(ctx),m=[];
  if(!j.accepted)m.push({code:'accept',label:'Accept Job'});
  if(p.requiresEnRoute&&!j.enRoute)m.push({code:'en_route',label:'Start Travel / En Route'});
  if(p.requiresOnSite&&!j.onSite)m.push({code:'on_site',label:'Arrived On Site'});
  if(p.requiresRegistration&&!j.registration)m.push({code:'registration',label:'Confirm Registration'});
  if(p.requiresSafety&&!j.safety)m.push({code:'safety',label:'Complete Safety Check'});
  if(!j.workStarted)m.push({code:'start_work',label:p.remote?'Start Remote Support':'Start Work'});
  return m;
}
function taskAndEvidenceMissing(ctx,tasks,evidence){
  const m=[];
  const attEvidence=evidence.filter(e=>String(e.attendance_id||'')===String(ctx.attendance_id));
  for(const t of tasks.filter(x=>x.required!==false)){
    if(!terminalTask(t.status)){
      m.push({code:'task',label:`Complete: ${t.description}`,taskRef:t.legacy_ref,taskStatus:t.status});
      continue;
    }
    if(t.status!=='Completed')continue;
    const rule=taskRule(t),answers=t.data?.mobileAnswers||{},am=answerMissing(rule,answers);
    if(am.length){m.push({code:'task',label:`Finish: ${t.description}`,taskRef:t.legacy_ref,detail:`Missing ${am.join(', ')}`});continue}
    const linked=attEvidence.filter(e=>String(e.task_id||'')===String(t.id)).map(e=>canonicalEvidence(e.evidence_type));
    for(const req of rule.requiredEvidence||[]){if(!linked.includes(canonicalEvidence(req)))m.push({code:'evidence',label:`Add required photo: ${evidenceLabel(req)}`,taskRef:t.legacy_ref,evidenceType:evidenceLabel(req)})}
    if((rule.anyEvidence||[]).length&&!rule.anyEvidence.some(x=>linked.includes(canonicalEvidence(x)))){
      const first=rule.anyEvidence[0];m.push({code:'evidence',label:`Add required photo for ${t.description}`,taskRef:t.legacy_ref,evidenceType:evidenceLabel(first),evidenceChoices:rule.anyEvidence.map(evidenceLabel)});
    }
  }
  const required=(ctx.work_order_data?.requiredEvidence||ctx.work_order_data?.workflow?.requiredEvidence||[]);
  if(Array.isArray(required)){
    const all=attEvidence.map(e=>canonicalEvidence(e.evidence_type));
    for(const req of required){if(!all.includes(canonicalEvidence(req)))m.push({code:'evidence',label:`Add required photo: ${evidenceLabel(req)}`,evidenceType:evidenceLabel(req)})}
  }
  return m;
}
async function readiness(c,ctx){
  const tasks=await loadTasks(c,ctx.work_order_id),evidence=await loadEvidence(c,ctx.work_order_id);
  const missing=basicMissing(ctx).concat(taskAndEvidenceMissing(ctx,tasks,evidence));
  if(signatureRequired(ctx))missing.push({code:'signature',label:'Customer Signature'});
  return{
    workOrder:ctx.work_order_ref,attendance:ctx.attendance_ref,registration:ctx.registration,
    attendanceStatus:ctx.attendance_status,workOrderStatus:ctx.work_order_status,
    missing,ready:missing.length===0,
    taskCount:tasks.length,evidenceCount:evidence.filter(e=>String(e.attendance_id||'')===String(ctx.attendance_id)).length
  };
}

async function ensureLabourReview(c,req,ctx,entry,taskId,activity,minutes,reviewRequired,reviewReason){
  const old=await c.query('SELECT 1 FROM technician_labour_reviews WHERE time_entry_id=$1',[entry.id]);if(old.rowCount)return;
  let expected=null;if(taskId){const tr=await c.query('SELECT srt_expected_hours FROM tasks WHERE id=$1',[taskId]);if(tr.rows[0]?.srt_expected_hours!=null)expected=Math.round(Number(tr.rows[0].srt_expected_hours)*60)}
  const pr=await c.query(`SELECT prv.id FROM pricing_rules pr JOIN pricing_rule_versions prv ON prv.pricing_rule_id=pr.id
    WHERE pr.contract_id=$1 AND prv.effective_from<=current_date AND (prv.effective_to IS NULL OR prv.effective_to>=current_date)
    ORDER BY prv.effective_from DESC LIMIT 1`,[ctx.contract_id]);
  const normal=['Working','Diagnosis','Repair','Service','Remote Support','Recovery Support'].includes(activity),proposed=normal?minutes:0;
  await c.query(`INSERT INTO technician_labour_reviews(time_entry_id,work_order_id,attendance_id,task_id,technician_id,actual_minutes,expected_minutes,proposed_billable_minutes,approved_billable_minutes,pricing_rule_version_id,status,reviewer_user_id,reviewed_at,data)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,[
      entry.id,ctx.work_order_id,ctx.attendance_id,taskId||null,ctx.technician_id,minutes,expected,proposed,reviewRequired?null:proposed,pr.rows[0]?.id||null,
      reviewRequired?'Pending Review':'Approved',reviewRequired?null:req.user.id,reviewRequired?null:new Date(),JSON.stringify({activity,chargeabilityReviewRequired:reviewRequired,reviewReason})
    ]);
}
async function stopActiveTime(c,req,ctx,timer){
  const now=new Date();
  const open=await c.query(`SELECT * FROM labour_time_entries WHERE technician_id=$1 AND attendance_id=$2 AND ended_at IS NULL FOR UPDATE`,[ctx.technician_id,ctx.attendance_id]);
  for(const e of open.rows){
    const mins=Math.max(1,Math.round((now-new Date(e.started_at))/60000));
    await c.query('UPDATE labour_time_entries SET ended_at=$2,duration_minutes=$3 WHERE id=$1',[e.id,now,mins]);
    await ensureLabourReview(c,req,ctx,e,e.task_id,e.activity_type,mins,!!e.chargeability_review_required,txt(e.chargeability_reason,2000));
    await B.audit(c,req,'LabourTimeEntry',e.id,e.legacy_ref,'Technician time automatically stopped',null,{endedAt:now.toISOString(),durationMinutes:mins},'Smart Technician Close');
  }
  if(!timer?.start)return{stopped:open.rowCount,created:false};
  const start=new Date(timer.start);if(Number.isNaN(start.valueOf()))fail(422,'VALIDATION','Active Technician timer start time is invalid');
  if(start>new Date(now.getTime()+60000))fail(422,'VALIDATION','Active Technician timer start time is in the future');
  const minutes=Math.max(1,Math.min(1440,Math.round((now-start)/60000))),legacy=txt(timer.id,120)||`TE-SMART-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const prior=await c.query('SELECT * FROM labour_time_entries WHERE legacy_ref=$1',[legacy]);if(prior.rowCount)return{stopped:open.rowCount,created:false,replayed:true};
  let taskId=null;if(timer.task){const tr=await c.query('SELECT id FROM tasks WHERE work_order_id=$1 AND legacy_ref=$2',[ctx.work_order_id,txt(timer.task,120)]);if(!tr.rowCount)fail(422,'VALIDATION','Active timer Task is not linked to this Work Order');taskId=tr.rows[0].id}
  const activity=txt(timer.activity,100)||'Working',reviewRequired=!!timer.chargeabilityReviewRequired,reviewReason=txt(timer.reviewReason,2000);
  if(reviewRequired&&!reviewReason)fail(422,'VALIDATION','Chargeability Review reason is required for the active timer');
  const ins=await c.query(`INSERT INTO labour_time_entries(legacy_ref,technician_id,work_order_id,attendance_id,task_id,activity_type,started_at,ended_at,duration_minutes,chargeability_review_required,chargeability_reason,source,data)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Technician Mobile',$12::jsonb) RETURNING *`,[
      legacy,ctx.technician_id,ctx.work_order_id,ctx.attendance_id,taskId,activity,start,now,minutes,reviewRequired,reviewReason||null,JSON.stringify({smartClose:true,autoStopped:true})
    ]);
  await ensureLabourReview(c,req,ctx,ins.rows[0],taskId,activity,minutes,reviewRequired,reviewReason);
  await B.audit(c,req,'LabourTimeEntry',ins.rows[0].id,legacy,'Technician time automatically stopped',null,{startedAt:start.toISOString(),endedAt:now.toISOString(),durationMinutes:minutes,activity},'Smart Technician Close');
  return{stopped:open.rowCount+1,created:true,durationMinutes:minutes};
}
function followUpMap(reason){
  return ({
    'Awaiting Parts':['Awaiting Parts','Parts','Source required parts'],
    'Estimate / Authorisation Required':['Awaiting Approval','Customer / Operations','Obtain estimate / authorisation'],
    'Return Visit Required':['On Hold','Planning','Schedule Return Visit'],
    'Further Diagnosis Required':['On Hold','Operations','Review further diagnosis / plan next action'],
    'Workshop Required':['On Hold','Operations','Arrange workshop attendance'],
    'Customer Request':['On Hold','Operations','Review customer request'],
    'Specialist / Third Party Required':['On Hold','Operations','Arrange specialist / third-party support'],
    'Other':['On Hold','Operations','Review Technician follow-up']
  })[reason]||null;
}
function unableMap(reason){
  return ({
    'No Access':['On Hold','Operations','Review no access / replan'],
    'Vehicle Not Onsite':['On Hold','Operations','Confirm vehicle availability / replan'],
    'Incorrect Vehicle':['On Hold','Operations','Review vehicle mismatch'],
    'Unsafe to Work':['On Hold','Operations','Safety escalation / decide next action'],
    'Customer Refused Work':['On Hold','Operations','Review customer refusal'],
    'Site Closed':['On Hold','Operations','Confirm site availability / replan'],
    'Technician Issue':['On Hold','Planning','Reallocate / technician support'],
    'Other':['On Hold','Operations','Review Technician unable-to-complete outcome']
  })[reason]||null;
}
async function updateWo(c,ctx,status,owner,next){
  if(status!==ctx.work_order_status)B.assertTransition('workOrder',ctx.work_order_status,status);
  await c.query('UPDATE work_orders SET status=$2,current_owner=$3,next_action=$4,version=version+1,updated_at=now() WHERE id=$1',[ctx.work_order_id,status,owner,next]);
}

router.get('/api/v1/technician-close/:workOrder/:attendance/readiness',requireAuth,async(req,res,next)=>{try{
  if(!isTechnician(req.user))fail(403,'ACCESS_DENIED','Technician role required');
  const out=await tx(async c=>{const ctx=await loadContext(c,req.user,txt(req.params.workOrder,120),txt(req.params.attendance,120));return readiness(c,ctx)});
  res.json(out);
}catch(e){next(e)}});

router.post('/api/v1/technician-close/:workOrder/:attendance/finish',requireAuth,csrfRequired,async(req,res,next)=>{try{
  if(!isTechnician(req.user))fail(403,'ACCESS_DENIED','Technician role required');
  const outcome=txt(req.body?.outcome,40),reason=txt(req.body?.reason,120),note=txt(req.body?.note,2000),signature=txt(req.body?.signature,500);
  if(!['job_complete','follow_up','unable'].includes(outcome))fail(422,'VALIDATION','Choose Job Complete, Follow-up Required or Unable to Complete');
  const result=await tx(async c=>{
    const ctx=await loadContext(c,req.user,txt(req.params.workOrder,120),txt(req.params.attendance,120),{lock:true});
    if(!activeAttendance(ctx.attendance_status))return{replayed:true,attendanceStatus:ctx.attendance_status,workOrderStatus:ctx.work_order_status,workOrder:ctx.work_order_ref,attendance:ctx.attendance_ref};
    const ready=await readiness(c,ctx);
    if(outcome==='job_complete'){
      const filtered=ready.missing.filter(x=>x.code!=='signature'||!signature);
      if(filtered.length)fail(422,'MISSING_REQUIREMENTS','Complete the required items before finishing the job',{missing:filtered});
    }else if(outcome==='follow_up'){
      const hard=basicMissing(ctx);
      if(hard.length)fail(422,'MISSING_REQUIREMENTS','Complete the required attendance steps before recording follow-up',{missing:hard});
      if(!followUpMap(reason))fail(422,'VALIDATION','Choose a valid Follow-up Required reason');
      if(reason==='Other'&&!note)fail(422,'VALIDATION','Add a short explanation for Other');
    }else{
      if(!unableMap(reason))fail(422,'VALIDATION','Choose a valid Unable to Complete reason');
      if(['Other','Unsafe to Work','Incorrect Vehicle','Customer Refused Work','Technician Issue'].includes(reason)&&!note)fail(422,'VALIDATION','Add a short explanation for this outcome');
    }
    const time=await stopActiveTime(c,req,ctx,req.body?.activeTimer||null),now=new Date();
    const route=outcome==='job_complete'?'Smart Close — Job Complete':outcome==='follow_up'?'Smart Close — Follow-up Required':'Smart Close — Unable to Complete';
    const display=outcome==='job_complete'?'Job Complete':outcome==='follow_up'?`Follow-up Required — ${reason}`:`Unable to Complete — ${reason}`;
    const data={...(ctx.attendance_data||{}),completionRoute:route,smartClose:{outcome,reason:reason||null,note:note||null,completedAt:now.toISOString(),signature:signature||null}};
    B.assertTransition('attendance',ctx.attendance_status,'Completed');
    await c.query('UPDATE attendances SET status=\'Completed\',departed_at=$2,outcome=$3,data=$4::jsonb,version=version+1,updated_at=now() WHERE id=$1',[ctx.attendance_id,now,display+(note?` — ${note}`:''),JSON.stringify(data)]);
    await B.audit(c,req,'Attendance',ctx.attendance_id,ctx.attendance_ref,'Smart Technician Close',{status:ctx.attendance_status},{status:'Completed',outcome:display,reason:reason||null,timeStopped:time},note||route);

    let woStatus=ctx.work_order_status,woOwner=ctx.current_owner,woNext=ctx.next_action,operationallyComplete=false;
    if(outcome==='job_complete'){
      const openTasks=(await c.query("SELECT count(*)::int n FROM tasks WHERE work_order_id=$1 AND required=true AND status NOT IN ('Completed','Cancelled','Resolved by Override')",[ctx.work_order_id])).rows[0].n;
      const active=(await c.query("SELECT count(*)::int n FROM attendances WHERE work_order_id=$1 AND status NOT IN ('Completed','Cancelled','Rejected')",[ctx.work_order_id])).rows[0].n;
      if(openTasks===0&&active===0){
        if(ctx.work_order_status==='Operationally Complete'){operationallyComplete=true}
        else if((B.transitions.workOrder[ctx.work_order_status]||[]).includes('Operationally Complete')){
          await c.query("UPDATE work_orders SET status='Operationally Complete',financial_status=CASE WHEN financial_status='Not Started' THEN 'Billing Review' ELSE financial_status END,current_owner='Billing',next_action='Commercial review',version=version+1,updated_at=now() WHERE id=$1",[ctx.work_order_id]);
          woStatus='Operationally Complete';woOwner='Billing';woNext='Commercial review';operationallyComplete=true;
          await B.audit(c,req,'WorkOrder',ctx.work_order_id,ctx.work_order_ref,'Work Order Operationally Complete',{status:ctx.work_order_status},{status:woStatus},'All required Tasks terminal and no active Attendances remain');
        }else{
          await c.query("UPDATE work_orders SET current_owner='Operations',next_action='Review operational completion state',version=version+1,updated_at=now() WHERE id=$1",[ctx.work_order_id]);
          woOwner='Operations';woNext='Review operational completion state';
          await B.audit(c,req,'WorkOrder',ctx.work_order_id,ctx.work_order_ref,'Operational completion held for Operations review',{status:ctx.work_order_status},{status:ctx.work_order_status},'Existing Work Order status does not permit direct Operationally Complete transition');
        }
      }
    }else if(outcome==='follow_up'){
      const m=followUpMap(reason);await updateWo(c,ctx,m[0],m[1],m[2]);woStatus=m[0];woOwner=m[1];woNext=m[2];
      if(reason==='Awaiting Parts')await c.query("UPDATE tasks SET status='Awaiting Parts',version=version+1,updated_at=now() WHERE id=(SELECT id FROM tasks WHERE work_order_id=$1 AND required=true AND status NOT IN ('Completed','Cancelled','Resolved by Override') ORDER BY created_at LIMIT 1)",[ctx.work_order_id]);
      if(reason==='Estimate / Authorisation Required')await c.query("UPDATE tasks SET status='Awaiting Approval',version=version+1,updated_at=now() WHERE id=(SELECT id FROM tasks WHERE work_order_id=$1 AND required=true AND status NOT IN ('Completed','Cancelled','Resolved by Override') ORDER BY created_at LIMIT 1)",[ctx.work_order_id]);
      await B.audit(c,req,'WorkOrder',ctx.work_order_id,ctx.work_order_ref,'Technician follow-up created',{status:ctx.work_order_status},{status:woStatus,currentOwner:woOwner,nextAction:woNext,reason},note||reason);
    }else{
      const m=unableMap(reason);await updateWo(c,ctx,m[0],m[1],m[2]);woStatus=m[0];woOwner=m[1];woNext=m[2];
      await B.audit(c,req,'WorkOrder',ctx.work_order_id,ctx.work_order_ref,'Technician unable to complete',{status:ctx.work_order_status},{status:woStatus,currentOwner:woOwner,nextAction:woNext,reason},note||reason);
    }
    await B.emitEvent(c,'Technician Attendance Completed','Attendance',ctx.attendance_id,ctx.attendance_ref,{workOrder:ctx.work_order_ref,registration:ctx.registration,outcome:display,currentOwner:woOwner,nextAction:woNext});
    const stateVersion=await bumpStateVersion(c);
    return{replayed:false,workOrder:ctx.work_order_ref,attendance:ctx.attendance_ref,registration:ctx.registration,outcome:display,attendanceStatus:'Completed',workOrderStatus:woStatus,currentOwner:woOwner,nextAction:woNext,operationallyComplete,time,stateVersion}
  });
  res.json(result);
}catch(e){next(e)}});

router.use((err,req,res,next)=>{const status=err.status||500;console.error(JSON.stringify({level:'error',event:'stage6_smart_close_error',path:req.originalUrl,status,code:err.code||null,message:err.message}));res.status(status).json({error:err.code||'SERVER_ERROR',message:status>=500?'Unexpected Smart Technician Close error':err.message,missing:err.missing||undefined,requestId:req.id||null})});
module.exports=router;
