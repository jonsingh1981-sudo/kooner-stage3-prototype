'use strict';
const express=require('express');
const {tx,getStateVersion,bumpStateVersion}=require('./db');
const {isInternal,canAccessSite}=require('./auth');
const B=require('./business');

const router=express.Router();
function fail(status,code,message){throw Object.assign(new Error(message),{status,code})}
function text(v,max=2000){return String(v??'').trim().slice(0,max)}
function safeDate(v){if(!v)return new Date();const d=new Date(v);return Number.isNaN(d.valueOf())?new Date():d}
function has(user,p){return !!user&&(user.permissions||[]).some(x=>x==='admin.*'||x===p)}

// Compatibility clients historically generated MR-PORT/MR-CUST references. Stage 6 must
// enforce mileage rules from server scope/business data, not from a magic client prefix.
// This route accepts any new MR-* customer mileage reference that the legacy bridge would
// otherwise ignore, then lets the normal compatibility commit continue for other changes.
router.put('/api/v1/compat/state',async(req,res,next)=>{
 try{
  if(!req.user||isInternal(req.user))return next();
  if(!has(req.user,'portal.submit'))return next();
  const state=req.body?.state||{},candidates=[];
  for(const v of (state.vehicles||[]))for(const mr of (v.mileageRecords||[])){
   const id=text(mr.id,200);if(!/^MR-/i.test(id)||/^MR-(PORT|CUST)/i.test(id))continue;
   candidates.push({vehicleRef:text(v.id,100),registration:text(v.reg,50),mr,id});
  }
  if(!candidates.length)return next();
  const result=await tx(async c=>{
   const expected=Number(req.body.baseVersion),current=await getStateVersion(c);if(Number.isFinite(expected)&&expected!==current)fail(409,'CONFLICT','Server data changed. Refresh before retrying.');
   let changed=false;
   for(const x of candidates){
    const existing=await c.query("SELECT 1 FROM mileage_history WHERE data->>'legacyRef'=$1",[x.id]);if(existing.rowCount)continue;
    const vr=await c.query('SELECT id,customer_id,current_site_id,current_mileage,legacy_ref,registration FROM vehicles WHERE legacy_ref=$1 FOR UPDATE',[x.vehicleRef]);if(!vr.rowCount)fail(404,'NOT_FOUND','Vehicle not found');const v=vr.rows[0];
    if(String(v.customer_id)!==String(req.user.customer_id)||!canAccessSite(req.user,v.customer_id,v.current_site_id))fail(403,'ACCESS_DENIED','ACCESS DENIED / NOT AUTHORISED');
    const mileage=Number(x.mr.mileage);if(!Number.isFinite(mileage)||mileage<0)fail(422,'VALIDATION','Mileage must be a valid non-negative number');
    const lower=mileage<Number(v.current_mileage||0),reason=text(x.mr.notes||x.mr.reviewReason,2000);if(lower&&!reason)fail(422,'VALIDATION','Mileage is lower than the current recorded mileage. An explanation is required.');
    await c.query(`INSERT INTO mileage_history(vehicle_id,mileage,source,entered_by,captured_at,review_required,reason,data) VALUES($1,$2,'Customer Portal',$3,$4,$5,$6,$7::jsonb)`,[v.id,mileage,req.user.id,safeDate(x.mr.at),lower,reason||null,JSON.stringify({legacyRef:x.id,customerUser:req.user.legacy_ref,compatibilityRef:true})]);
    if(!lower)await c.query('UPDATE vehicles SET current_mileage=$2,version=version+1,updated_at=now() WHERE id=$1',[v.id,mileage]);
    else await c.query(`INSERT INTO portal_actions(legacy_ref,customer_id,action_type,ref_type,ref_legacy,summary,reason,priority,status,data) VALUES($1,$2,'Mileage review','Vehicle',$3,$4,$5,'High','New',$6::jsonb) ON CONFLICT(legacy_ref) DO NOTHING`,[`CPA-MILE-${x.id}`,v.customer_id,v.legacy_ref,`${v.registration||x.registration||v.legacy_ref} mileage ${mileage} is below trusted ${v.current_mileage}`,reason,JSON.stringify({site:String(v.current_site_id),user:req.user.legacy_ref,source:'Customer Portal'})]);
    await B.audit(c,req,'Vehicle',v.id,v.legacy_ref,'Customer mileage submitted',{trustedMileage:Number(v.current_mileage)},{submittedMileage:mileage,reviewRequired:lower},reason);
    changed=true;
   }
   if(!changed)return{changed:false,version:current};const version=await bumpStateVersion(c);return{changed:true,version}
  });
  if(result.changed)req.body.baseVersion=result.version;
  next();
 }catch(e){next(e)}
});

module.exports=router;
