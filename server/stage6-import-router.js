'use strict';

const express=require('express');
const cookieParser=require('cookie-parser');
const {tx}=require('./db');
const {authMiddleware,requireAuth,requirePermission,csrfRequired}=require('./auth');
const B=require('./business');

const router=express.Router();
const json=express.json({limit:'2mb'});

router.post('/api/v1/import/vehicle-batches',json,cookieParser(),authMiddleware,requireAuth,requirePermission('import.export'),csrfRequired,async(req,res,next)=>{try{
  const batchRef='IMP-'+Date.now()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();
  const rows=Array.isArray(req.body?.rows)?req.body.rows:[];
  if(rows.length>5000)return res.status(422).json({error:'VALIDATION',message:'Maximum 5,000 rows per preview batch',requestId:req.id});
  const result=await tx(async c=>{
    const inserted=await c.query(`INSERT INTO import_batches(batch_ref,import_type,status,created_by,mapping)
      VALUES($1,'Vehicle','Preview',$2,$3::jsonb) RETURNING id`,[batchRef,req.user.id,JSON.stringify(req.body?.mapping||{})]);
    const batchId=inserted.rows[0].id;
    let valid=0,errors=0;
    for(let i=0;i<rows.length;i++){
      const raw=rows[i]&&typeof rows[i]==='object'?rows[i]:{};
      const validation=[];
      if(!String(raw.registration||'').trim())validation.push('Registration required');
      if(!String(raw.customer||'').trim())validation.push('Customer required');
      if(!String(raw.site||'').trim())validation.push('Site required');
      if(raw.mileage!==undefined&&raw.mileage!==null&&raw.mileage!==''&&(!Number.isFinite(Number(raw.mileage))||Number(raw.mileage)<0))validation.push('Mileage must be a positive number');
      const rowStatus=validation.length?'Error':'Valid';if(validation.length)errors++;else valid++;
      await c.query(`INSERT INTO import_rows(batch_id,row_key,raw_data,mapped_data,validation_errors,status)
        VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6)`,[batchId,String(raw.rowId||i+1),JSON.stringify(raw),JSON.stringify(raw),JSON.stringify(validation),rowStatus]);
    }
    await B.audit(c,req,'ImportBatch',batchId,batchRef,'Vehicle import preview created',null,{rowCount:rows.length,valid,errors,status:'Preview'},'Validation/preview only — no Vehicle records committed');
    return{batchRef,id:batchId,status:'Preview',rowCount:rows.length,validRows:valid,errorRows:errors,note:'Invalid rows are not committed automatically. Preview must be confirmed through an authorised import flow.'};
  });
  res.status(201).json(result);
}catch(e){next(e)}});

module.exports=router;
