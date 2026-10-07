'use strict';
const express=require('express');
const cookieParser=require('cookie-parser');
const {query}=require('./db');
const {authMiddleware,requireAuth,csrfRequired,isInternal}=require('./auth');

const router=express.Router();
router.use(express.json({limit:'2mb'}));
router.use(cookieParser());
router.use(authMiddleware);

const ACTIVE=new Set(['En Route','On Site','In Progress','Paused','Stopped for Safety']);
function txt(v,max=2000){return String(v??'').trim().slice(0,max)}
function isTech(user){return !!user&&isInternal(user)&&(user.roles||[]).includes('technician')}
function isOpsOverride(user){return !!user&&isInternal(user)&&(user.roles||[]).some(r=>r==='operations'||r==='administrator')}
function fail(res,req,extra={}){return res.status(422).json({
  error:'ACTIVE_ATTENDANCE_EXISTS',
  message:'Finish or resolve your current job before starting another.',
  activeWorkOrder:extra.workOrder||null,
  activeAttendance:extra.attendance||null,
  requestId:req.id||null
})}
async function techIdForUser(userId){const r=await query('SELECT id,legacy_ref FROM technicians WHERE user_id=$1',[userId]);return r.rows[0]||null}
async function assignedRows(techId){return (await query(`SELECT a.id,a.legacy_ref attendance_ref,a.status,w.legacy_ref work_order_ref
  FROM attendances a
  JOIN work_orders w ON w.id=a.work_order_id
  JOIN attendance_resource_assignments ara ON ara.attendance_id=a.id
  WHERE ara.technician_id=$1 AND a.status NOT IN ('Completed','Cancelled','Rejected')`,[techId])).rows}
function incomingAttendanceStatuses(state){const m=new Map();for(const w of (state?.wos||[]))for(const a of (w.att||[]))m.set(String(a.id),{status:String(a.status||''),workOrder:String(w.id||'')});return m}

// Technician compatibility-state writes are the normal Stage 6 mobile mutation path.
// Project the submitted state over authoritative assigned Attendance statuses and fail closed
// if the Technician would end up with more than one active Attendance.
router.put('/api/v1/compat/state',requireAuth,csrfRequired,async(req,res,next)=>{try{
  if(!isTech(req.user))return next();
  const tech=await techIdForUser(req.user.id);if(!tech)return next();
  const rows=await assignedRows(tech.id),incoming=incomingAttendanceStatuses(req.body?.state),projected=[];
  for(const row of rows){const inc=incoming.get(String(row.attendance_ref));const status=inc?.status||row.status;if(ACTIVE.has(status))projected.push({workOrder:inc?.workOrder||row.work_order_ref,attendance:row.attendance_ref,status})}
  if(projected.length>1){const current=projected.find(x=>x.status==='In Progress')||projected.find(x=>x.status==='On Site')||projected.find(x=>x.status==='En Route')||projected[0];return fail(res,req,current)}
  next();
}catch(e){next(e)}});

// Direct Attendance status API is also protected so a Technician cannot bypass the mobile
// compatibility path. Operations/Admin may make an exceptional override only with a reason;
// the normal Attendance route then retains that reason in the audit record.
router.patch('/api/v1/attendances/:ref/status',requireAuth,csrfRequired,async(req,res,next)=>{try{
  const targetStatus=txt(req.body?.status,80);if(!ACTIVE.has(targetStatus))return next();
  const target=(await query(`SELECT a.id,a.legacy_ref attendance_ref,w.legacy_ref work_order_ref,t.id technician_id,t.user_id technician_user_id
    FROM attendances a JOIN work_orders w ON w.id=a.work_order_id
    JOIN attendance_resource_assignments ara ON ara.attendance_id=a.id
    JOIN technicians t ON t.id=ara.technician_id WHERE a.legacy_ref=$1 LIMIT 1`,[req.params.ref])).rows[0];
  if(!target)return next();
  if(isTech(req.user)&&String(target.technician_user_id)!==String(req.user.id))return next();
  const rows=await assignedRows(target.technician_id);
  const other=rows.find(x=>x.attendance_ref!==target.attendance_ref&&ACTIVE.has(x.status));
  if(!other)return next();
  if(isTech(req.user))return fail(res,req,{workOrder:other.work_order_ref,attendance:other.attendance_ref});
  if(!isOpsOverride(req.user))return fail(res,req,{workOrder:other.work_order_ref,attendance:other.attendance_ref});
  const reason=txt(req.body?.reason,2000);if(!reason)return res.status(422).json({error:'OVERRIDE_REASON_REQUIRED',message:'A reason is required to override the Technician single-active-job control.',activeWorkOrder:other.work_order_ref,activeAttendance:other.attendance_ref,requestId:req.id||null});
  req.body.reason=`Active Attendance Override: ${reason}`;
  next();
}catch(e){next(e)}});

module.exports=router;
