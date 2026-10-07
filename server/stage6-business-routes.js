'use strict';
const express=require('express');
const cookieParser=require('cookie-parser');
const {query,tx,bumpStateVersion}=require('./db');
const {authMiddleware,requireAuth,requirePermission,csrfRequired,isInternal}=require('./auth');
const B=require('./business');

const router=express.Router();
router.use(express.json({limit:'2mb'}));
router.use(cookieParser());
router.use(authMiddleware);

function fail(status,code,message){throw Object.assign(new Error(message),{status,code})}
function text(v,max=4000){return String(v??'').trim().slice(0,max)}
function isoDate(v){const s=String(v||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))fail(422,'VALIDATION','Effective From must be a valid date');return s}
function previousDay(s){const d=new Date(`${s}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}

router.get('/api/v1/billing/labour-reviews',requireAuth,requirePermission('billing.read'),async(req,res,next)=>{try{
 const params=[];let where='1=1';if(req.query.workOrder){params.push(String(req.query.workOrder));where+=` AND w.legacy_ref=$${params.length}`}
 const r=await query(`SELECT lr.id,lr.actual_minutes,lr.expected_minutes,lr.proposed_billable_minutes,lr.approved_billable_minutes,lr.status,lr.override_reason,lr.reviewed_at,lr.version,lr.data,w.legacy_ref work_order_ref,a.legacy_ref attendance_ref,t.legacy_ref task_ref,tech.legacy_ref technician_ref,u.display_name reviewer,pr.legacy_ref pricing_rule_ref,prv.version_no pricing_version,prv.labour_rate FROM technician_labour_reviews lr JOIN work_orders w ON w.id=lr.work_order_id LEFT JOIN attendances a ON a.id=lr.attendance_id LEFT JOIN tasks t ON t.id=lr.task_id LEFT JOIN technicians tech ON tech.id=lr.technician_id LEFT JOIN users u ON u.id=lr.reviewer_user_id LEFT JOIN pricing_rule_versions prv ON prv.id=lr.pricing_rule_version_id LEFT JOIN pricing_rules pr ON pr.id=prv.pricing_rule_id WHERE ${where} ORDER BY w.updated_at DESC,lr.reviewed_at NULLS FIRST`,params);
 res.json({items:r.rows.map(x=>({id:String(x.id),workOrder:x.work_order_ref,attendance:x.attendance_ref,task:x.task_ref,technician:x.technician_ref,actualMinutes:x.actual_minutes,expectedMinutes:x.expected_minutes,proposedBillableMinutes:x.proposed_billable_minutes,approvedBillableMinutes:x.approved_billable_minutes,status:x.status,commercialDecision:x.data?.commercialDecision||x.status,overrideReason:x.override_reason||'',reviewer:x.reviewer||'',reviewedAt:x.reviewed_at,version:Number(x.version),pricingRuleId:x.pricing_rule_ref,pricingVersion:x.pricing_version,customerRate:Number(x.labour_rate||0),reviewReason:x.data?.reviewReason||'',activity:x.data?.activity||'Working'}))})
}catch(e){next(e)}});

router.post('/api/v1/billing/labour-reviews/:id/decision',requireAuth,requirePermission('billing.write'),csrfRequired,async(req,res,next)=>{try{
 const result=await tx(async c=>{
  const r=await c.query(`SELECT lr.*,w.legacy_ref work_order_ref,w.financial_status FROM technician_labour_reviews lr JOIN work_orders w ON w.id=lr.work_order_id WHERE lr.id=$1 FOR UPDATE OF lr,w`,[req.params.id]);
  if(!r.rowCount)fail(404,'NOT_FOUND','Technician Labour Review not found');const lr=r.rows[0];
  if(lr.financial_status==='Invoiced')fail(422,'BUSINESS_RULE','Invoiced Work Orders cannot have labour treatment changed');
  const expected=Number(req.body.version);if(Number.isFinite(expected)&&expected!==Number(lr.version))fail(409,'CONFLICT','Conflict detected');
  const mins=Math.round(Number(req.body.approvedBillableMinutes));if(!Number.isFinite(mins)||mins<0)fail(422,'VALIDATION','Approved billable minutes must be zero or greater');
  const reason=text(req.body.reason,3000),proposed=Number(lr.proposed_billable_minutes||0),needsReview=!!lr.data?.chargeabilityReviewRequired;
  if((mins!==proposed||needsReview)&&!reason)fail(422,'VALIDATION','Override / review reason is required');
  const decision=mins===proposed?'Approved by Operations':'Approved Override';
  await c.query(`UPDATE technician_labour_reviews SET approved_billable_minutes=$2,status='Approved',reviewer_user_id=$3,reviewed_at=now(),override_reason=$4,data=jsonb_set(COALESCE(data,'{}'::jsonb),'{commercialDecision}',to_jsonb($5::text),true),version=version+1 WHERE id=$1`,[lr.id,mins,req.user.id,reason||null,decision]);
  await B.audit(c,req,'TechnicianLabourReview',lr.id,null,'Technician labour commercial review',{approvedBillableMinutes:lr.approved_billable_minutes,status:lr.status},{approvedBillableMinutes:mins,status:'Approved',commercialDecision:decision,reviewer:req.user.display_name},reason||'Approved at proposed commercial treatment');
  const sv=await bumpStateVersion(c);return{id:String(lr.id),workOrder:lr.work_order_ref,approvedBillableMinutes:mins,status:'Approved',commercialDecision:decision,reviewer:req.user.display_name,version:Number(lr.version)+1,stateVersion:sv}
 });res.json(result)
}catch(e){next(e)}});

router.post('/api/v1/vehicles/:ref/move-site',requireAuth,requirePermission('workorders.write'),csrfRequired,async(req,res,next)=>{try{
 if(!isInternal(req.user))fail(403,'ACCESS_DENIED','ACCESS DENIED / NOT AUTHORISED');
 const targetRef=text(req.body.targetSite,100),reason=text(req.body.reason,2000),from=isoDate(req.body.effectiveFrom);if(!targetRef||!reason)fail(422,'VALIDATION','New Site, Effective From and Reason are required');
 const result=await tx(async c=>{
  const vr=await c.query(`SELECT v.*,s.legacy_ref current_site_ref FROM vehicles v LEFT JOIN sites s ON s.id=v.current_site_id WHERE v.legacy_ref=$1 FOR UPDATE OF v`,[req.params.ref]);if(!vr.rowCount)fail(404,'NOT_FOUND','Vehicle not found');const v=vr.rows[0];
  const sr=await c.query('SELECT id,legacy_ref FROM sites WHERE legacy_ref=$1 AND customer_id=$2 AND archived_at IS NULL',[targetRef,v.customer_id]);if(!sr.rowCount)fail(422,'VALIDATION','Selected Site does not belong to this Customer');const target=sr.rows[0];if(String(target.id)===String(v.current_site_id))fail(422,'VALIDATION','Select a different Site');
  const cur=await c.query(`SELECT vsa.*,s.legacy_ref site_ref FROM vehicle_site_assignments vsa JOIN sites s ON s.id=vsa.site_id WHERE vsa.vehicle_id=$1 AND vsa.current=true FOR UPDATE OF vsa`,[v.id]);
  if(cur.rowCount&&String(from)<String(cur.rows[0].effective_from).slice(0,10))fail(422,'VALIDATION','Effective From cannot be earlier than the current Site Assignment start date');
  if(cur.rowCount)await c.query(`UPDATE vehicle_site_assignments SET current=false,effective_to=$2,reason=CASE WHEN COALESCE(reason,'')='' THEN $3 ELSE reason || '; closed: ' || $3 END WHERE id=$1`,[cur.rows[0].id,previousDay(from),reason]);
  const ins=await c.query(`INSERT INTO vehicle_site_assignments(vehicle_id,site_id,effective_from,current,reason,changed_by) VALUES($1,$2,$3,true,$4,$5) RETURNING id`,[v.id,target.id,from,reason,req.user.id]);
  await c.query('UPDATE vehicles SET current_site_id=$2,version=version+1,updated_at=now() WHERE id=$1',[v.id,target.id]);
  await B.audit(c,req,'Vehicle',v.id,v.legacy_ref,'Home Site changed',{site:v.current_site_ref},{site:target.legacy_ref,effectiveFrom:from,assignmentId:String(ins.rows[0].id)},reason);
  const sv=await bumpStateVersion(c);return{id:v.legacy_ref,oldSite:v.current_site_ref,newSite:target.legacy_ref,effectiveFrom:from,reason,assignmentId:String(ins.rows[0].id),version:Number(v.version)+1,stateVersion:sv}
 });res.json(result)
}catch(e){next(e)}});

// Stage 5 Emergency/VOR continuity is also guarded on the Stage 6 server.
router.put('/api/v1/compat/state',requireAuth,csrfRequired,async(req,res,next)=>{try{
 if(!isInternal(req.user)||req.user.roles.includes('technician'))return next();
 const state=req.body?.state||{},incomingRequests=new Map((state.portalRequests||[]).map(x=>[String(x.id||''),x]));
 for(const a of (state.portalActions||[])){
  if(a.refType!=='Portal Request'||a.status!=='Resolved'||!a.refId)continue;
  const db=await query('SELECT legacy_ref,status,emergency,data FROM portal_requests WHERE legacy_ref=$1',[a.refId]);if(!db.rowCount||!db.rows[0].emergency)continue;
  const current=db.rows[0],incoming=incomingRequests.get(String(a.refId)),target=String(incoming?.status||current.status||'');
  const deliberatelyClosed=/Converted to Work Order|Rejected \/ Closed|Closed – No Attendance Required/i.test(target);
  if(!deliberatelyClosed)fail(422,'BUSINESS_RULE','Emergency/VOR request must remain in Operations triage until converted into operational work or deliberately closed with an authorised reason');
  if(/Closed – No Attendance Required|Rejected \/ Closed/i.test(target)){
   const why=text(incoming?.closedReason||incoming?.operationsDecision?.reason||a.reason||a.resolution,3000);if(!why)fail(422,'VALIDATION','Emergency/VOR closure reason is required');
  }
 }
 next()
}catch(e){next(e)}});

router.use((err,req,res,next)=>{const status=err.status||500;res.status(status).json({error:err.code||'SERVER_ERROR',message:status>=500?'Unexpected Stage 6 business-rule error':err.message,requestId:req.id||null,...(err.serverVersion?{serverVersion:err.serverVersion}:{})})});
module.exports=router;
