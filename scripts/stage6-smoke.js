'use strict';

const base=String(process.env.STAGE6_BASE_URL||'').replace(/\/$/,'');
const password=process.env.STAGE6_TEST_PASSWORD;
if(!base||!password){console.error('Set STAGE6_BASE_URL and STAGE6_TEST_PASSWORD before running this script.');process.exit(2)}

async function request(path,{method='GET',cookie,csrf,body}={}){
  const headers={Accept:'application/json'};
  if(cookie)headers.Cookie=cookie;
  if(csrf)headers['X-CSRF-Token']=csrf;
  if(body!==undefined)headers['Content-Type']='application/json';
  const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  const text=await res.text();let data;try{data=JSON.parse(text)}catch{data=text}
  return{status:res.status,data,headers:res.headers};
}
async function login(email){
  const r=await request('/api/v1/auth/login',{method:'POST',body:{email,password}});
  if(r.status!==200)throw new Error(`Login failed for ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  const cookie=String(r.headers.get('set-cookie')||'').split(';')[0];
  return{email,cookie,csrf:r.data.csrfToken,user:r.data.user};
}
function expect(name,actual,allowed){
  const ok=(Array.isArray(allowed)?allowed:[allowed]).includes(actual);
  console.log(JSON.stringify({test:name,status:ok?'PASS':'FAIL',actual,expected:allowed}));
  if(!ok)process.exitCode=1;
}

(async()=>{
  const health=await request('/api/v1/health/ready');expect('database readiness',health.status,200);
  const unauth=await request('/api/v1/bootstrap');expect('unauthenticated API blocked',unauth.status,401);

  const ops=await login('operations@kooner.test');
  const tech=await login('technician@kooner.test');
  const site=await login('birmingham.manager@testtransport.test');
  const finance=await login('finance@testtransport.test');
  const customer=await login('customer.admin@testtransport.test');

  expect('site manager can read Birmingham vehicle',(await request('/api/v1/vehicles/V1',{cookie:site.cookie})).status,200);
  expect('site manager cannot read Bristol vehicle',(await request('/api/v1/vehicles/V2',{cookie:site.cookie})).status,403);
  expect('Test Transport cannot read Demo Logistics vehicle',(await request('/api/v1/vehicles/V4',{cookie:customer.cookie})).status,403);
  expect('customer cannot read Internal Only document',(await request('/api/v1/documents/DOC-TEST-INT-S1',{cookie:customer.cookie})).status,403);
  expect('finance role cannot create operational Work Order',(await request('/api/v1/work-orders',{method:'POST',cookie:finance.cookie,csrf:finance.csrf,body:{}})).status,403);
  expect('technician cannot mutate Billing',(await request('/api/v1/billing/work-orders/WO-10041/transition',{method:'POST',cookie:tech.cookie,csrf:tech.csrf,body:{version:1,status:'Validated'}})).status,403);

  const pricing=await request('/api/v1/pricing/calculate',{method:'POST',cookie:ops.cookie,csrf:ops.csrf,body:{contractRef:'CT1',effectiveDate:'2026-10-01',labourHours:1,partsCost:100,thirdPartyCost:0,miles:10,other:0}});
  expect('pricing backend authority responds',pricing.status,200);

  const sys=await request('/api/v1/admin/system',{cookie:ops.cookie});expect('authorised system information',sys.status,200);
  const dcr=await request('/api/v1/dcr?limit=50',{cookie:ops.cookie});expect('backend DCR register available',dcr.status,200);

  const me=await request('/api/v1/auth/me',{cookie:ops.cookie});expect('authenticated session remains valid',me.status,200);
  const logout=await request('/api/v1/auth/logout',{method:'POST',cookie:ops.cookie,csrf:ops.csrf});expect('logout succeeds',logout.status,200);
  const revoked=await request('/api/v1/auth/me',{cookie:ops.cookie});expect('revoked session rejected',revoked.status,401);

  if(!process.exitCode)console.log(JSON.stringify({result:'PASS',message:'Stage 6 smoke/security checks passed.'}));
})().catch(e=>{console.error(e);process.exit(1)});
