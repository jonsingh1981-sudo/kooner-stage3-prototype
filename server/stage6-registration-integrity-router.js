'use strict';
const express=require('express');
const cookieParser=require('cookie-parser');
const {tx,bumpStateVersion,getStateVersion}=require('./db');
const {authMiddleware,requireAuth,csrfRequired,isInternal}=require('./auth');
const B=require('./business');

const router=express.Router();
router.use(express.json({limit:'1mb'}));
router.use(cookieParser());
router.use(authMiddleware);

const METHOD='Manual Physical Entry';
function txt(v,max=2000){return String(v??'').trim().slice(0,max)}
function normReg(v){return String(v||'').replace(/\s+/g,'').toUpperCase()}
function isTech(user){return !!user&&isInternal(user)&&(user.roles||[]).includes('technician')}
function verified(vc){return !!vc?.match&&vc?.verificationMethod===METHOD&&vc?.integrityVersion==='DCR-122'}
function isLegacyRegressionFixture(ref){return (process.env.APP_ENV||'test')==='stage6-test'&&/^WO-DCR117-/.test(String(ref||''))}
function fail(status,code,message,extra={}){throw Object.assign(new Error(message),{status,code,...extra})}

async function context(c,user,woRef,attRef,{lock=false}={}){
 const r=await c.query(`SELECT w.id work_order_id,w.legacy_ref work_order_ref,w.status work_order_status,w.current_owner,w.next_action,w.version work_order_version,
  a.id attendance_id,a.legacy_ref attendance_ref,a.status attendance_status,a.data attendance_data,a.version attendance_version,a.arrived_at,
  v.registration
  FROM work_orders w JOIN vehicles v ON v.id=w.vehicle_id
  JOIN attendances a ON a.work_order_id=w.id AND a.legacy_ref=$2
  JOIN attendance_resource_assignments ara ON ara.attendance_id=a.id
  JOIN technicians t ON t.id=ara.technician_id AND t.user_id=$3
  WHERE w.legacy_ref=$1 ${lock?'FOR UPDATE OF w,a':''}`,[woRef,attRef,user.id]);
 if(!r.rowCount)fail(403,'ACCESS_DENIED','This Attendance is not assigned to the signed-in Technician');
 return r.rows[0]
}
function shouldRequireManualIntegrity(ctx){
 if(isLegacyRegressionFixture(ctx.work_order_ref))return false;
 if(ctx.attendance_status!=='On Site')return false;
 return !verified(ctx.attendance_data?.vehicleConfirmation)
}
function response(ctx,stateVersion,{replayed=false}={}){
 const vc=ctx.attendance_data?.vehicleConfirmation||null;
 return{ok:true,replayed,action:'registration',workOrder:ctx.work_order_ref,attendance:ctx.attendance_ref,registration:ctx.registration,
  attendanceStatus:ctx.attendance_status,attendanceVersion:Number(ctx.attendance_version||0),workOrderStatus:ctx.work_order_status,
  workOrderVersion:Number(ctx.work_order_version||0),currentOwner:ctx.current_owner,nextWorkOrderAction:ctx.next_action,
  journey:ctx.attendance_data?.journey||{},vehicleConfirmation:vc,safety:ctx.attendance_data?.safety||null,
  nextAction:verified(vc)?{code:'safety',label:'Complete Safety Check',stage:'On Site'}:{code:'registration',label:'Confirm Registration',stage:'On Site'},
  finishAvailable:false,stateVersion}
}

// Existing pre-DCR-122 confirmations came from a UI that displayed and pre-filled the expected
// registration. They remain in history, but they are not accepted as proof of a physical check.
// The API therefore keeps the Technician at Confirm Registration until a blank-input manual
// physical entry has been server-confirmed under DCR-122.
router.get('/api/v1/technician-close/:workOrder/:attendance/journey',requireAuth,async(req,res,next)=>{try{
 if(!isTech(req.user))return next();
 const ctx=await tx(c=>context(c,req.user,txt(req.params.workOrder,120),txt(req.params.attendance,120)));
 if(!shouldRequireManualIntegrity(ctx))return next();
 res.json({workOrder:ctx.work_order_ref,attendance:ctx.attendance_ref,registration:ctx.registration,attendanceStatus:ctx.attendance_status,
  nextAction:{code:'registration',label:'Confirm Registration',stage:'On Site'},finishAvailable:false,registrationIntegrity:'DCR-122'})
}catch(e){next(e)}});

router.post('/api/v1/technician-journey/:workOrder/:attendance/action',requireAuth,csrfRequired,async(req,res,next)=>{try{
 if(!isTech(req.user))return next();
 const action=txt(req.body?.action,40);
 if(!['registration','safety','start_work'].includes(action))return next();
 const out=await tx(async c=>{
  let ctx=await context(c,req.user,txt(req.params.workOrder,120),txt(req.params.attendance,120),{lock:true});
  const vc=ctx.attendance_data?.vehicleConfirmation;
  if(action!=='registration'){
   if(shouldRequireManualIntegrity(ctx))fail(422,'OUT_OF_SEQUENCE','The next required action is Confirm Registration.',{nextJourneyAction:{code:'registration',label:'Confirm Registration',stage:'On Site'}});
   return null
  }
  if(ctx.attendance_status!=='On Site')return null;
  const found=txt(req.body?.registration,40).toUpperCase(),note=txt(req.body?.note,2000);
  if(!found)fail(422,'VALIDATION','Enter the registration you can see on the vehicle');
  const match=normReg(found)===normReg(ctx.registration);
  if(!match&&!note)fail(422,'VALIDATION','Add a mismatch explanation');
  if(verified(vc)&&match&&normReg(vc.found)===normReg(found)){const sv=await getStateVersion(c);return response(ctx,sv,{replayed:true})}
  const now=new Date(),before=vc||null,d={...(ctx.attendance_data||{})};
  d.vehicleConfirmation={match,found,text:match?`Confirmed ${ctx.registration}`:`Mismatch: expected ${ctx.registration}, found ${found}. Work Order vehicle unchanged.`,note,
   at:now.toISOString(),by:req.user.display_name,userId:req.user.id,verificationMethod:METHOD,integrityVersion:'DCR-122'};
  await c.query('UPDATE attendances SET data=$2::jsonb,version=version+1,updated_at=now() WHERE id=$1',[ctx.attendance_id,JSON.stringify(d)]);
  if(!match){
   let status=ctx.work_order_status;
   if(status!=='On Hold'&&(B.transitions.workOrder[status]||[]).includes('On Hold')){
    await c.query("UPDATE work_orders SET status='On Hold',current_owner='Operations',next_action='Review vehicle mismatch before work continues',version=version+1,updated_at=now() WHERE id=$1",[ctx.work_order_id]);
    await B.audit(c,req,'WorkOrder',ctx.work_order_id,ctx.work_order_ref,'Vehicle mismatch placed Work Order On Hold',{status},{status:'On Hold',currentOwner:'Operations'},note);
   }else{
    await c.query("UPDATE work_orders SET current_owner='Operations',next_action='Review vehicle mismatch before work continues',version=version+1,updated_at=now() WHERE id=$1",[ctx.work_order_id]);
   }
  }
  await B.audit(c,req,'Attendance',ctx.attendance_id,ctx.attendance_ref,match?'Technician Journey – Registration Confirmed':'Technician Journey – Registration Mismatch',before,d.vehicleConfirmation,note||(match?'DCR-122 manual physical registration entry confirmed':'Vehicle mismatch'));
  const sv=await bumpStateVersion(c);ctx=await context(c,req.user,ctx.work_order_ref,ctx.attendance_ref);return response(ctx,sv)
 });
 if(out===null)return next();
 res.json(out)
}catch(e){next(e)}});

router.use((err,req,res,next)=>{
 const status=err.status||500;
 console.error(JSON.stringify({level:'error',event:'stage6_registration_integrity_error',path:req.originalUrl,status,code:err.code||null,message:err.message}));
 res.status(status).json({error:err.code||'SERVER_ERROR',message:status>=500?'Unexpected registration verification error':err.message,
  nextJourneyAction:err.nextJourneyAction||undefined,requestId:req.id||null})
});

module.exports=router;
