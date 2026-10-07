'use strict';

const {query}=require('./db');
const {hashPassword}=require('./security');

const TEST_EMAILS=[
  'operations@kooner.test',
  'dispatcher@kooner.test',
  'technician@kooner.test',
  'billing@kooner.test',
  'admin@kooner.test',
  'customer.admin@testtransport.test',
  'birmingham.manager@testtransport.test',
  'finance@testtransport.test',
  'customer.admin@demologistics.test'
];

async function reconcileTestUserPasswords(){
  const env=String(process.env.APP_ENV||'').toLowerCase();
  if(env==='production')return{skipped:true,reason:'Test credential reconciliation is disabled in production'};
  const password=process.env.TEST_USER_PASSWORD;
  if(!password)throw new Error('TEST_USER_PASSWORD is required in the Stage 6 test environment');
  if(String(password).length<14)throw new Error('TEST_USER_PASSWORD must be at least 14 characters');
  const hash=await hashPassword(password);
  const r=await query('UPDATE users SET password_hash=$1,failed_login_count=0,locked_until=NULL,updated_at=now() WHERE lower(email)=ANY($2::text[]) RETURNING email',[hash,TEST_EMAILS.map(x=>x.toLowerCase())]);
  return{updated:r.rowCount,users:r.rows.map(x=>x.email)};
}

module.exports={reconcileTestUserPasswords,TEST_EMAILS};
