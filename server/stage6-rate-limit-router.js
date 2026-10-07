'use strict';

const express=require('express');
const {rateLimit}=require('express-rate-limit');

const router=express.Router();
function limiter({windowMs=60_000,limit=120,message}){return rateLimit({windowMs,limit,standardHeaders:true,legacyHeaders:false,message:{error:'RATE_LIMIT',message}})}

// The legacy-compatible save endpoint can contain Customer Portal Work Requests and
// other operational mutations. Rate-limit at the server boundary regardless of the
// button or interface that originated the request.
router.use('/api/v1/compat/state',limiter({limit:90,message:'Too many Kooner save requests. Please wait briefly and retry.'}));
router.use('/api/v1/portal/requests',limiter({limit:30,message:'Too many Customer Portal Work Requests. Please wait before retrying.'}));
router.use('/api/v1/search',limiter({limit:90,message:'Too many search requests. Please wait briefly and retry.'}));
router.use('/api/v1/import/vehicle-batches',limiter({windowMs:5*60_000,limit:20,message:'Too many import preview requests. Please wait before retrying.'}));
router.use('/api/v1/documents',limiter({limit:120,message:'Too many document requests. Please wait briefly and retry.'}));

module.exports=router;
