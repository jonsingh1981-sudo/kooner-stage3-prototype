'use strict';
const express=require('express');
const cookieParser=require('cookie-parser');
const crypto=require('crypto');
const {tx,bumpStateVersion,query}=require('./db');
const {authMiddleware,requireAuth,csrfRequired,isInternal}=require('./auth');
const B=require('./business');

const router=express.Router();
router.use(express.json({limit:'3mb'}));
router.use(cookieParser());
router.use(authMiddleware);

function fail(status,code,message){throw Object.assign(new Error(message),{status,code})}
function text(v,max=2000){return String(v??'').trim().slice(0,max)}
function isTech(user){return !!user?.roles?.includes('technician')}

async function technicianContext(c,user,workOrderRef,attendanceRef,taskRef){
  const r=await c.query(`SELECT w.id work_order_id,w.legacy_ref work_order_ref,w.customer_id,w.site_id,
    a.id attendance_id,a.legacy_ref attendance_ref,t.id task_id,t.legacy_ref task_ref,tech.id technician_id
    FROM work_orders w
    JOIN attendances a ON a.work_order_id=w.id AND a.legacy_ref=$2
    JOIN technicians tech ON tech.user_id=$4
    JOIN attendance_resource_assignments ara ON ara.attendance_id=a.id AND ara.technician_id=tech.id
    LEFT JOIN tasks t ON t.work_order_id=w.id AND t.legacy_ref=$3
    WHERE w.legacy_ref=$1`,[workOrderRef,attendanceRef,taskRef||null,user.id]);
  if(!r.rowCount)fail(403,'ACCESS_DENIED','Evidence Work Order / Attendance is not assigned to this Technician');
  const ctx=r.rows[0];
  if(taskRef&&!ctx.task_id)fail(403,'ACCESS_DENIED','Evidence Task is not linked to the assigned Work Order');
  return ctx;
}

router.post('/api/v1/evidence/media',requireAuth,csrfRequired,async(req,res,next)=>{try{
  if(!isInternal(req.user)||!isTech(req.user))fail(403,'ACCESS_DENIED','Technician evidence upload is restricted to an authenticated Technician');
  const workOrder=text(req.body.workOrder,100),attendance=text(req.body.attendance,100),task=text(req.body.task,100)||null;
  const evidenceType=text(req.body.type,200),description=text(req.body.description,5000),filename=text(req.body.filename,300);
  const requestedRef=text(req.body.evidenceRef,120)||`EV-S6-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  if(!workOrder||!attendance||!evidenceType||!filename)fail(422,'VALIDATION','Work Order, Attendance, evidence type and photo filename are required');
  const dataUrl=String(req.body.dataUrl||'');
  const match=dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if(!match)fail(422,'VALIDATION','A valid JPEG, PNG or WebP photo is required');
  const mime=match[1].toLowerCase(),content=Buffer.from(match[2],'base64');
  if(!content.length)fail(422,'VALIDATION','The evidence photo is empty');
  if(content.length>1572864)fail(413,'FILE_TOO_LARGE','Evidence photo must be 1.5 MB or smaller after compression');
  const checksum=crypto.createHash('sha256').update(content).digest('hex');
  const result=await tx(async c=>{
    const ctx=await technicianContext(c,req.user,workOrder,attendance,task);
    const existing=await c.query('SELECT legacy_ref,storage_status,size_bytes,mime_type FROM evidence_metadata WHERE legacy_ref=$1',[requestedRef]);
    if(existing.rowCount){const x=existing.rows[0];return{evidenceRef:x.legacy_ref,storageStatus:x.storage_status,sizeBytes:Number(x.size_bytes||0),mimeType:x.mime_type,replayed:true,stateVersion:null}}
    const ins=await c.query(`INSERT INTO evidence_metadata(
      legacy_ref,work_order_id,attendance_id,task_id,evidence_type,filename,mime_type,size_bytes,checksum,visibility,storage_key,storage_status,captured_by,captured_at,source,data,content_data
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Stored - Stage 6 UAT DB',$12,now(),'Technician Mobile',$13::jsonb,$14)
      RETURNING id,legacy_ref,captured_at`,[
      requestedRef,ctx.work_order_id,ctx.attendance_id,ctx.task_id,evidenceType,filename,mime,content.length,checksum,
      req.body.visibility==='Customer Visible'?'Customer Visible':'Internal Kooner Only',`stage6-db:${requestedRef}`,req.user.id,
      JSON.stringify({description,uatMedia:true,originalWorkOrder:workOrder,attendance,task}),content
    ]);
    await B.audit(c,req,'Evidence',ins.rows[0].id,requestedRef,'Technician photo/evidence stored',null,{workOrder,attendance,task,evidenceType,filename,sizeBytes:content.length,checksum,storageStatus:'Stored - Stage 6 UAT DB'},description||'UAT evidence capture');
    const sv=await bumpStateVersion(c);
    return{evidenceRef:requestedRef,workOrder,attendance,task,evidenceType,filename,mimeType:mime,sizeBytes:content.length,checksum,storageStatus:'Stored - Stage 6 UAT DB',capturedAt:ins.rows[0].captured_at,stateVersion:sv,replayed:false}
  });
  res.status(result.replayed?200:201).json(result);
}catch(e){next(e)}});

router.get('/api/v1/evidence/:ref/content',requireAuth,async(req,res,next)=>{try{
  if(!isInternal(req.user))fail(403,'ACCESS_DENIED','ACCESS DENIED / NOT AUTHORISED');
  const r=await query(`SELECT e.*,w.legacy_ref work_order_ref,a.id attendance_id
    FROM evidence_metadata e JOIN work_orders w ON w.id=e.work_order_id LEFT JOIN attendances a ON a.id=e.attendance_id
    WHERE e.legacy_ref=$1`,[req.params.ref]);
  if(!r.rowCount)fail(404,'NOT_FOUND','Evidence not found');
  const e=r.rows[0];
  if(isTech(req.user)){
    const allowed=await query(`SELECT 1 FROM technicians t JOIN attendance_resource_assignments ara ON ara.technician_id=t.id WHERE t.user_id=$1 AND ara.attendance_id=$2`,[req.user.id,e.attendance_id]);
    if(!allowed.rowCount)fail(403,'ACCESS_DENIED','ACCESS DENIED / NOT AUTHORISED');
  }
  if(!e.content_data)fail(404,'NOT_FOUND','Evidence media was not persisted; metadata only');
  res.setHeader('Content-Type',e.mime_type||'application/octet-stream');
  res.setHeader('Content-Length',String(e.content_data.length));
  res.setHeader('Content-Disposition',`inline; filename="${String(e.filename||'evidence').replace(/["\r\n]/g,'_')}"`);
  res.setHeader('Cache-Control','private, no-store');
  res.send(e.content_data);
}catch(e){next(e)}});

router.use((err,req,res,next)=>{const status=err.status||500;console.error(JSON.stringify({level:'error',event:'stage6_evidence_error',path:req.originalUrl,status,code:err.code||null,message:err.message}));res.status(status).json({error:err.code||'SERVER_ERROR',message:status>=500?'Unexpected Stage 6 evidence error':err.message,requestId:req.id||null})});
module.exports=router;
