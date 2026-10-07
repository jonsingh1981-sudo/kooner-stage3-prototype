'use strict';
const express=require('express');
const cookieParser=require('cookie-parser');
const {tx,bumpStateVersion}=require('./db');
const {authMiddleware,requireAuth,csrfRequired,isInternal}=require('./auth');
const B=require('./business');

const router=express.Router();
router.use(express.json({limit:'1mb'}));
router.use(cookieParser());
router.use(authMiddleware);

const ACTIVE=new Set(['En Route','On Site','In Progress','Paused','Stopped for Safety']);
function fail(status,code,message,extra={}){throw Object.assign(new Error(message),{status,code,...extra})}
function txt(v,max=2000){return String(v??'').trim().slice(0,max)}
function bool(v){return v===true||String(v).toLowerCase()==='true'}
function isTechnician(user){return !!user&&isInternal(user)&&(user.roles||[]).includes('technician')}
function normReg(v){return String(v||'').replace(/\s+/g,'').toUpperCase()}

async function loadContext(c,user,woRef,attendanceRef,{lock=false}={}){
 const r=await c.query(`SELECT
  w.id work_order_id,w.legacy_ref work_order_ref,w.status work_order_status,w.current_owner,w.next_action,w.version work_order_version,
  a.id attendance_id,a.legacy_ref attendance_ref,a.attendance_type,a.status attendance_status,a.arrived_at,a.data attendance_data,a.version attendance_version,
  tech.id technician_id,tech.legacy_ref technician_ref,tech.role_name,
  v.registration
  FROM work_orders w
  JOIN vehicles v ON v.id=w.vehicle_id
  JOIN attendances a ON a.work_order_id=w.id AND a.legacy_ref=$2
  JOIN attendance_resource_assignments ara ON ara.attendance_id=a.id
  JOIN technicians tech ON tech.id=ara.technician_id AND tech.user_id=$3
  WHERE w.legacy_ref=$1 ${lock?'FOR UPDATE OF w,a':''}`,[woRef,attendanceRef,user.id]);
 if(!r.rowCount)fail(403,'ACCESS_DENIED','This Attendance is not assigned to the signed-in Technician');
 return r.rows[0]
}
function policy(ctx){const remote=/remote support/i.test(ctx.attendance_type||''),workshop=/workshop/i.test(ctx.role_name||'');return{remote,workshop,requiresEnRoute:!remote&&!workshop,requiresOnSite:!remote,requiresRegistration:!remote,requiresSafety:!remote}}
function state(ctx){const d=ctx.attendance_data||{},j=d.journey||{},s=ctx.attendance_status;return{accepted:!!j.acceptedAt||!['Planned','Dispatched'].includes(s),enRoute:!!j.enRouteAt||!!ctx.arrived_at||['On Site','In Progress','Paused','Stopped for Safety','Completed'].includes(s),onSite:!!j.onSiteAt||!!ctx.arrived_at||['In Progress','Paused','Stopped for Safety','Completed'].includes(s),registration:!!d.vehicleConfirmation?.match,safety:!!d.safety?.safe,workStarted:!!j.workStartedAt||['In Progress','Paused','Stopped for Safety','Completed'].includes(s)}}
function nextAction(ctx){const p=policy(ctx),j=state(ctx);if(!j.accepted)return{code:'accept',label:'Accept Job',stage:'Assigned'};if(p.requiresEnRoute&&!j.enRoute)return{code:'en_route',label:'Start Travel / En Route',stage:'Accepted'};if(p.requiresOnSite&&!j.onSite)return{code:'on_site',label:'Arrived On Site',stage:p.requiresEnRoute?'En Route':'Accepted'};if(p.requiresRegistration&&!j.registration)return{code:'registration',label:'Confirm Registration',stage:'On Site'};if(p.requiresSafety&&!j.safety)return{code:'safety',label:'Complete Safety Check',stage:'On Site'};if(!j.workStarted)return{code:'start_work',label:p.remote?'Start Remote Support':'Start Work',stage:'On Site'};return{code:'finish_job',label:'FINISH JOB',stage:'Working'}}
function satisfied(ctx,action){const j=state(ctx);return action==='accept'?j.accepted:action==='en_route'?j.enRoute:action==='on_site'?j.onSite:action==='registration'?j.registration:action==='safety'?j.safety:action==='start_work'?j.workStarted:false}
async function otherActive(c,ctx){const r=await c.query(`SELECT w.legacy_ref work_order_ref,a.legacy_ref attendance_ref,a.status FROM attendances a JOIN work_orders w ON w.id=a.work_order_id JOIN attendance_resource_assignments ara ON ara.attendance_id=a.id WHERE ara.technician_id=$1 AND a.id<>$2 AND a.status=ANY($3::text[]) ORDER BY a.updated_at DESC LIMIT 1`,[ctx.technician_id,ctx.attendance_id,[...ACTIVE]]);return r.rows[0]||null}
async function enforceSingleActive(c,ctx){const other=await otherActive(c,ctx);if(other)fail(422,'ACTIVE_ATTENDANCE_EXISTS','Finish or resolve your current job before starting another.',{activeWorkOrder:other.work_order_ref,activeAttendance:other.attendance_ref})}
async function setWo(c,req,ctx,{status=null,owner=null,next=null,reason}){
 let current=ctx.work_order_status;
 const advance=async target=>{if(current===target)return;if((B.transitions.workOrder[current]||[]).includes(target)){await c.query('UPDATE work_orders SET status=$2,version=version+1,updated_at=now() WHERE id=$1',[ctx.work_order_id,target]);await B.audit(c,req,'WorkOrder',ctx.work_order_id,ctx.work_order_ref,'Technician journey Work Order status',{status:current},{status:target},reason);current=target;return}if(target==='In Progress'&&['Pending Triage','Planned'].includes(current)){B.assertTransition('workOrder',current,'Dispatched');await c.query("UPDATE work_orders SET status='Dispatched',version=version+1,updated_at=now() WHERE id=$1",[ctx.work_order_id]);await B.audit(c,req,'WorkOrder',ctx.work_order_id,ctx.work_order_ref,'Technician journey Work Order status',{status:current},{status:'Dispatched'},reason);current='Dispatched';B.assertTransition('workOrder',current,'In Progress');await c.query("UPDATE work_orders SET status='In Progress',version=version+1,updated_at=now() WHERE id=$1",[ctx.work_order_id]);await B.audit(c,req,'WorkOrder',ctx.work_order_id,ctx.work_order_ref,'Technician journey Work Order status',{status:current},{status:'In Progress'},reason);current='In Progress';return}fail(422,'BUSINESS_RULE',`Work Order cannot advance from ${current} to ${target} for this Technician action`)};
 if(status)await advance(status);
 if(owner!==null||next!==null)await c.query('UPDATE work_orders SET current_owner=COALESCE($2,current_owner),next_action=COALESCE($3,next_action),version=version+1,updated_at=now() WHERE id=$1',[ctx.work_order_id,owner,next]);
 return current
}
async function reload(c,user,woRef,attendanceRef){return loadContext(c,user,woRef,attendanceRef)}
function response(ctx,action,replayed,stateVersion){const d=ctx.attendance_data||{},j=d.journey||{};return{ok:true,replayed:!!replayed,action,workOrder:ctx.work_order_ref,attendance:ctx.attendance_ref,registration:ctx.registration,attendanceStatus:ctx.attendance_status,attendanceVersion:Number(ctx.attendance_version||0),workOrderStatus:ctx.work_order_status,workOrderVersion:Number(ctx.work_order_version||0),currentOwner:ctx.current_owner,nextWorkOrderAction:ctx.next_action,journey:j,vehicleConfirmation:d.vehicleConfirmation||null,safety:d.safety||null,nextAction:nextAction(ctx),finishAvailable:state(ctx).workStarted&&ctx.attendance_status==='In Progress',stateVersion}}

router.post('/api/v1/technician-journey/:workOrder/:attendance/action',requireAuth,csrfRequired,async(req,res,next)=>{try{
 if(!isTechnician(req.user))fail(403,'ACCESS_DENIED','Technician role required');
 const action=txt(req.body?.action,40);if(!['accept','en_route','on_site','registration','safety','start_work'].includes(action))fail(422,'VALIDATION','Choose a valid Technician journey action');
 const result=await tx(async c=>{
  let ctx=await loadContext(c,req.user,txt(req.params.workOrder,120),txt(req.params.attendance,120),{lock:true});
  if(satisfied(ctx,action)){const sv=await bumpStateVersion(c);return response(ctx,action,true,sv)}
  const expected=nextAction(ctx);if(expected.code!==action)fail(422,'OUT_OF_SEQUENCE',`The next required action is ${expected.label}.`,{nextJourneyAction:expected});
  const now=new Date(),d={...(ctx.attendance_data||{})},j={...(d.journey||{})};
  if(action==='accept'){
   if(ctx.attendance_status==='Planned'){B.assertTransition('attendance','Planned','Dispatched');await c.query("UPDATE attendances SET status='Dispatched',version=version+1,updated_at=now() WHERE id=$1",[ctx.attendance_id]);ctx.attendance_status='Dispatched'}
   B.assertTransition('attendance',ctx.attendance_status,'Accepted');j.acceptedAt=j.acceptedAt||now.toISOString();j.acceptedBy=req.user.id;j.acceptedByName=req.user.display_name;d.journey=j;
   await c.query("UPDATE attendances SET status='Accepted',data=$2::jsonb,version=version+1,updated_at=now() WHERE id=$1",[ctx.attendance_id,JSON.stringify(d)]);
   await c.query("UPDATE work_orders SET current_owner='Technician',next_action='Technician travel / attend',version=version+1,updated_at=now() WHERE id=$1",[ctx.work_order_id]);
   await B.audit(c,req,'Attendance',ctx.attendance_id,ctx.attendance_ref,'Technician Journey – Accept Job',{status:ctx.attendance_status==='Dispatched'?'Planned':ctx.attendance_status},{status:'Accepted',acceptedAt:j.acceptedAt},ctx.attendance_status==='Dispatched'?'Validated compound transition Planned → Dispatched → Accepted':'Technician accepted assigned Attendance');
  }else if(action==='en_route'){
   await enforceSingleActive(c,ctx);B.assertTransition('attendance',ctx.attendance_status,'En Route');j.enRouteAt=j.enRouteAt||now.toISOString();j.enRouteBy=req.user.id;d.journey=j;
   await c.query("UPDATE attendances SET status='En Route',data=$2::jsonb,version=version+1,updated_at=now() WHERE id=$1",[ctx.attendance_id,JSON.stringify(d)]);
   await setWo(c,req,ctx,{status:'Dispatched',owner:'Technician',next:'Technician travelling to site',reason:'Technician started travel'});
   await B.audit(c,req,'Attendance',ctx.attendance_id,ctx.attendance_ref,'Technician Journey – Start Travel',{status:ctx.attendance_status},{status:'En Route',enRouteAt:j.enRouteAt},'Server-confirmed Technician journey action');
  }else if(action==='on_site'){
   await enforceSingleActive(c,ctx);B.assertTransition('attendance',ctx.attendance_status,'On Site');j.onSiteAt=j.onSiteAt||now.toISOString();j.onSiteBy=req.user.id;d.journey=j;
   await c.query("UPDATE attendances SET status='On Site',arrived_at=$2,data=$3::jsonb,version=version+1,updated_at=now() WHERE id=$1",[ctx.attendance_id,now,JSON.stringify(d)]);
   await setWo(c,req,ctx,{status:'In Progress',owner:'Technician',next:'Vehicle confirmation and safety check',reason:'Technician arrived on site'});
   await B.audit(c,req,'Attendance',ctx.attendance_id,ctx.attendance_ref,'Technician Journey – Arrived On Site',{status:ctx.attendance_status},{status:'On Site',onSiteAt:j.onSiteAt},'Server-confirmed Technician journey action');
  }else if(action==='registration'){
   const found=txt(req.body?.registration,40).toUpperCase(),note=txt(req.body?.note,2000),match=normReg(found)===normReg(ctx.registration);if(!found)fail(422,'VALIDATION','Enter the registration found onsite');if(!match&&!note)fail(422,'VALIDATION','Add a mismatch explanation');
   d.vehicleConfirmation={match,found,text:match?`Confirmed ${ctx.registration}`:`Mismatch: expected ${ctx.registration}, found ${found}. Work Order vehicle unchanged.`,note,at:now.toISOString(),by:req.user.display_name,userId:req.user.id};
   await c.query('UPDATE attendances SET data=$2::jsonb,version=version+1,updated_at=now() WHERE id=$1',[ctx.attendance_id,JSON.stringify(d)]);
   if(!match){if(ctx.work_order_status!=='On Hold'&&(B.transitions.workOrder[ctx.work_order_status]||[]).includes('On Hold'))await setWo(c,req,ctx,{status:'On Hold',owner:'Operations',next:'Review vehicle mismatch before work continues',reason:note});else await c.query("UPDATE work_orders SET current_owner='Operations',next_action='Review vehicle mismatch before work continues',version=version+1,updated_at=now() WHERE id=$1",[ctx.work_order_id])}
   await B.audit(c,req,'Attendance',ctx.attendance_id,ctx.attendance_ref,match?'Technician Journey – Registration Confirmed':'Technician Journey – Registration Mismatch',null,d.vehicleConfirmation,note||'Server-confirmed registration');
  }else if(action==='safety'){
   const safe=bool(req.body?.safe),reason=txt(req.body?.reason,2000);if(!safe&&!reason)fail(422,'VALIDATION','Reason required when Unsafe to Proceed');
   d.safety={safe,safeLoc:bool(req.body?.safeLoc),secured:bool(req.body?.secured),ppe:bool(req.body?.ppe),traffic:bool(req.body?.traffic),height:bool(req.body?.height),ev:bool(req.body?.ev),note:txt(req.body?.note,2000),reason,at:now.toISOString(),by:req.user.display_name,userId:req.user.id};
   let target=ctx.attendance_status;if(!safe){B.assertTransition('attendance',ctx.attendance_status,'Stopped for Safety');target='Stopped for Safety'}
   await c.query('UPDATE attendances SET status=$2,data=$3::jsonb,version=version+1,updated_at=now() WHERE id=$1',[ctx.attendance_id,target,JSON.stringify(d)]);
   if(!safe){if(ctx.work_order_status!=='On Hold'&&(B.transitions.workOrder[ctx.work_order_status]||[]).includes('On Hold'))await setWo(c,req,ctx,{status:'On Hold',owner:'Operations',next:'Safety escalation / decide next action',reason});else await c.query("UPDATE work_orders SET current_owner='Operations',next_action='Safety escalation / decide next action',version=version+1,updated_at=now() WHERE id=$1",[ctx.work_order_id])}
   await B.audit(c,req,'Attendance',ctx.attendance_id,ctx.attendance_ref,safe?'Technician Journey – Safety Check Passed':'Technician Journey – Stopped for Safety',null,d.safety,reason||'Safe to proceed');
  }else if(action==='start_work'){
   await enforceSingleActive(c,ctx);let from=ctx.attendance_status;
   if(from==='Accepted'&&policy(ctx).remote){B.assertTransition('attendance','Accepted','On Site');await c.query("UPDATE attendances SET status='On Site',version=version+1,updated_at=now() WHERE id=$1",[ctx.attendance_id]);from='On Site'}
   B.assertTransition('attendance',from,'In Progress');j.workStartedAt=j.workStartedAt||now.toISOString();j.workStartedBy=req.user.id;d.journey=j;
   await c.query("UPDATE attendances SET status='In Progress',data=$2::jsonb,version=version+1,updated_at=now() WHERE id=$1",[ctx.attendance_id,JSON.stringify(d)]);
   await setWo(c,req,ctx,{status:'In Progress',owner:'Technician',next:'Complete assigned Tasks',reason:'Technician started work'});
   await B.audit(c,req,'Attendance',ctx.attendance_id,ctx.attendance_ref,'Technician Journey – Start Work',{status:ctx.attendance_status},{status:'In Progress',workStartedAt:j.workStartedAt},'Server-confirmed Technician journey action');
  }
  const sv=await bumpStateVersion(c);ctx=await reload(c,req.user,txt(req.params.workOrder,120),txt(req.params.attendance,120));return response(ctx,action,false,sv)
 });
 res.json(result)
}catch(e){next(e)}});

router.use((err,req,res,next)=>{const status=err.status||500;console.error(JSON.stringify({level:'error',event:'stage6_technician_journey_error',path:req.originalUrl,status,code:err.code||null,message:err.message}));res.status(status).json({error:err.code||'SERVER_ERROR',message:status>=500?'Unexpected Technician journey error':err.message,nextJourneyAction:err.nextJourneyAction||undefined,activeWorkOrder:err.activeWorkOrder||undefined,activeAttendance:err.activeAttendance||undefined,requestId:req.id||null})});
module.exports=router;
