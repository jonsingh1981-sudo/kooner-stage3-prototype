'use strict';
const fs=require('fs');
const path=require('path');
const {query}=require('./db');
function assert(ok,msg){if(!ok)throw new Error(msg)}
function read(name){return fs.readFileSync(path.join(__dirname,'..',name),'utf8')}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
async function snap(){
 const w=(await query(`SELECT w.status,w.financial_status,w.current_owner,w.next_action,w.version,w.updated_at,w.data,v.registration
  FROM work_orders w JOIN vehicles v ON v.id=w.vehicle_id WHERE w.legacy_ref='WO-10046'`)).rows[0];
 const a=(await query(`SELECT a.legacy_ref,a.status,a.arrived_at,a.departed_at,a.outcome,a.version,a.updated_at,a.data
  FROM attendances a JOIN work_orders w ON w.id=a.work_order_id WHERE w.legacy_ref='WO-10046' ORDER BY a.legacy_ref`)).rows;
 return{w,a}
}
async function runDcr122IntegrityGuard(port,dcr122){
 if((process.env.APP_ENV||'test')!=='stage6-test')return{skipped:true};
 const password=process.env.TEST_USER_PASSWORD;if(!password)throw new Error('TEST_USER_PASSWORD required');
 assert(dcr122?.failed===0&&dcr122?.passed>=32,'DCR-122 primary acceptance must pass first');
 const before=await snap();assert(before.w,'WO-10046 missing');
 const att=before.a.find(x=>x.status==='On Site')||before.a[0];assert(att,'WO-10046 Attendance missing');
 const base=`http://127.0.0.1:${port}`;
 const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'technician@kooner.test',password})});
 assert(login.status===200,`Technician login failed: ${login.status}`);const data=await login.json(),cookie=(login.headers.get('set-cookie')||'').split(';')[0];
 const journey=await fetch(base+`/api/v1/technician-close/${encodeURIComponent('WO-10046')}/${encodeURIComponent(att.legacy_ref)}/journey`,{headers:{cookie,'x-kooner-interface':'Technician Mobile'}});const j=await journey.json();
 const ui=read('stage6-registration-integrity.js'),server=read('server/stage6-registration-integrity-router.js');
 const results=[];const check=(name,ok,detail='')=>{assert(ok,`${name}: ${detail||'failed'}`);results.push({name,ok:true,detail})};
 check('Primary manual UAT job is still at an On Site Attendance',att.status==='On Site',att.legacy_ref);
 check('Server requires DCR-122 registration verification before next journey step',journey.status===200&&j.nextAction?.code==='registration'&&j.registrationIntegrity==='DCR-122',JSON.stringify(j));
 check('Client forces Confirm Registration until DCR-122 integrity marker exists',ui.includes("verificationMethod==='Manual Physical Entry'")&&ui.includes("integrityVersion==='DCR-122'")&&ui.includes("a.status!=='On Site'||verified(a)"),'client integrity gate');
 check('Server blocks Safety/Start Work without the DCR-122 integrity marker',server.includes("action!=='registration'")&&server.includes('The next required action is Confirm Registration.'),'server bypass guard');
 const after=await snap();check('Integrity guard did not alter WO-10046 / AB26 CDE',same(before,after),JSON.stringify(after));
 const result={passed:results.length,failed:0,total:results.length,dcr:'DCR-122',primaryManualWorkOrder:'WO-10046',registration:'AB26 CDE',attendance:att.legacy_ref,results};
 console.log(JSON.stringify({level:'info',event:'stage6_dcr122_integrity_guard_complete',...result}));return result
}
module.exports={runDcr122IntegrityGuard};
