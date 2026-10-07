'use strict';

const {query}=require('./db');
const {promoteStage6Ready}=require('./stage6-status');

function assert(ok,msg){if(!ok)throw new Error(msg)}

async function runExtendedAcceptance(port,coreSummary){
  if((process.env.APP_ENV||'test')==='production')return {skipped:true,reason:'Never run Stage 6 acceptance in production'};
  const password=process.env.TEST_USER_PASSWORD;if(!password)throw new Error('TEST_USER_PASSWORD required');
  const base=`http://127.0.0.1:${port}`,results=[];
  async function call(path,{method='GET',session,body,headers={}}={}){const h={...headers};if(session?.cookie)h.cookie=session.cookie;if(body!==undefined){h['content-type']='application/json';body=JSON.stringify(body)}if(session?.csrf&&!['GET','HEAD'].includes(method))h['x-csrf-token']=session.csrf;const r=await fetch(base+path,{method,headers:h,body});const text=await r.text();let data=text;try{data=text?JSON.parse(text):null}catch{}return{status:r.status,data,headers:r.headers}}
  async function login(email){const r=await call('/api/v1/auth/login',{method:'POST',body:{email,password}});assert(r.status===200,`Login failed for ${email}: ${r.status}`);return{email,cookie:(r.headers.get('set-cookie')||'').split(';')[0],csrf:r.data.csrfToken}}
  function record(name,ok,detail=''){results.push({name,ok,detail});if(!ok)throw new Error(`${name}: ${detail}`)}

  const clientSource=await call('/stage6-client.js');
  record('Front ends fail closed instead of reverting to legacy localStorage authority',clientSource.status===200&&typeof clientSource.data==='string'&&clientSource.data.includes('stage6-unavailable.html')&&!clientSource.data.includes('Legacy Prototype Test Data'),'stage6-client fail-closed source check');
  for(const page of ['/', '/technician.html','/customer.html']){const html=await call(page);const text=String(html.data||'');record(`${page} loads Stage 6 authority before legacy UI scripts`,html.status===200&&text.indexOf('stage6-client.js')>=0&&text.indexOf('stage6-client.js')<text.indexOf('app1.js')||page!=='/'&&html.status===200&&text.indexOf('stage6-client.js')>=0&&text.indexOf('stage6-client.js')<Math.min(...['technician-core.js','stage5-shared.js'].map(x=>{const i=text.indexOf(x);return i<0?Number.MAX_SAFE_INTEGER:i})),`HTTP ${html.status}`)}

  const ops=await login('operations@kooner.test'),billing=await login('billing@kooner.test'),admin=await login('admin@kooner.test'),tech=await login('technician@kooner.test'),finance=await login('finance@testtransport.test'),readonly=await login('readonly@testtransport.test');

  const pricing=await call('/api/v1/pricing/calculate',{method:'POST',session:ops,body:{contractRef:'CT1',effectiveDate:'2026-10-07',labourHours:1.5,partsCost:100,thirdPartyCost:50,miles:10,other:5}});
  record('Pricing engine uses effective server rule',pricing.status===200&&pricing.data.pricingRule==='PR-CT1-V2'&&pricing.data.version===2&&pricing.data.net===323.5&&pricing.data.gross===388.2,JSON.stringify(pricing.data));

  const fixed=await call('/api/v1/maintenance/fixed/calculate',{method:'POST',session:billing,body:{period:'2026-10'}});
  record('Approved October fixed-maintenance regression remains £492.10',fixed.status===200&&fixed.data.total===492.1&&fixed.data.lines.length===3,JSON.stringify(fixed.data));
  const rateHistory=await query(`SELECT p.legacy_ref,r.version_no,r.monthly_rate FROM fixed_maintenance_plans p JOIN effective_rate_versions r ON r.plan_id=p.id WHERE p.legacy_ref IN ('FMP-C1-VEH','FMP-C1-GRP') ORDER BY p.legacy_ref,r.version_no`);
  record('Fixed-maintenance previous rate versions are retained',rateHistory.rows.some(x=>x.legacy_ref==='FMP-C1-VEH'&&Number(x.monthly_rate)===210)&&rateHistory.rows.some(x=>x.legacy_ref==='FMP-C1-VEH'&&Number(x.monthly_rate)===225)&&rateHistory.rows.some(x=>x.legacy_ref==='FMP-C1-GRP'&&Number(x.monthly_rate)===170)&&rateHistory.rows.some(x=>x.legacy_ref==='FMP-C1-GRP'&&Number(x.monthly_rate)===180),JSON.stringify(rateHistory.rows));
  const invoice=await call('/api/v1/invoices/INV-9101',{session:finance});record('Consolidated regression invoice is internally consistent',invoice.status===200&&invoice.data.net===492.1&&invoice.data.gross===590.52&&invoice.data.lines.filter(x=>x.line_type==='Fixed Maintenance').length===1,JSON.stringify(invoice.data));

  const searchCases=[['AB26 CDE','Vehicle'],['WO-10042','Work Order'],['Test Transport','Customer'],['Birmingham','Site'],['Field Technician A','Technician'],['INV-9101','Invoice'],['EST-2041','Estimate']];
  for(const [term,type] of searchCases){const r=await call('/api/v1/search?q='+encodeURIComponent(term),{session:ops});record(`Backend search returns ${type}`,r.status===200&&r.data.items.some(x=>x.type===type),`${term}: ${JSON.stringify(r.data.items)}`)}
  const paged=await call('/api/v1/work-orders?limit=1&offset=0',{session:ops});record('Backend list pagination limits records',paged.status===200&&paged.data.items.length===1&&paged.data.limit===1,JSON.stringify(paged.data));

  const system=await call('/api/v1/admin/system',{session:admin});record('Admin/System information exposes non-secret platform state',system.status===200&&system.data.database==='PostgreSQL'&&system.data.migration?.version==='004_stage6_evidence_metadata.sql'&&Array.isArray(system.data.deferredIntegrations),JSON.stringify({database:system.data?.database,migration:system.data?.migration,environment:system.data?.environment}));
  const integrations=await call('/api/v1/integrations',{session:ops});record('Integration Hub remains server-side and Not Connected',integrations.status===200&&integrations.data.items.length>=8&&integrations.data.items.every(x=>x.enabled===false&&/Not Connected/i.test(x.status)),JSON.stringify(integrations.data));
  const retention=await query('SELECT category,verified,status FROM retention_policies ORDER BY category');record('GDPR retention foundation is visible as unverified legal dependency',retention.rows.length>=4&&retention.rows.every(x=>x.verified===false&&/Verification Required/i.test(x.status)),JSON.stringify(retention.rows));

  const exported=await call('/api/v1/export/work-orders.csv',{session:ops});record('Permission-scoped Work Order CSV export works',exported.status===200&&typeof exported.data==='string'&&exported.data.includes('Work Order')&&exported.data.includes('WO-10041'),'HTTP '+exported.status);
  const batch=await call('/api/v1/import/vehicle-batches',{method:'POST',session:ops,body:{mapping:{registration:'registration'},rows:[{rowId:'S6-INVALID',registration:'',customer:'C1',site:'S1'}]}});record('Vehicle import foundation validates into preview/error rows',batch.status===201&&batch.data.status==='Preview'&&batch.data.rowCount===1,JSON.stringify(batch.data));
  const importRow=await query(`SELECT ir.status,ir.validation_errors FROM import_rows ir JOIN import_batches ib ON ib.id=ir.batch_id WHERE ib.batch_ref=$1 AND ir.row_key='S6-INVALID'`,[batch.data.batchRef]);record('Invalid import row is not auto-committed',importRow.rows[0]?.status==='Error'&&JSON.stringify(importRow.rows[0]?.validation_errors||[]).includes('Registration required'),JSON.stringify(importRow.rows[0]));

  const notificationCount=await query('SELECT count(*)::int n FROM notification_events');record('Notification event foundation records backend events',notificationCount.rows[0].n>0,'count='+notificationCount.rows[0].n);
  const background=await query("SELECT to_regclass('public.background_jobs') IS NOT NULL present");record('Background job foundation table exists',background.rows[0].present===true,JSON.stringify(background.rows[0]));
  const dcr=await call('/api/v1/dcr?limit=200',{session:ops});record('DCR register is shared backend data',dcr.status===200&&dcr.data.items.some(x=>x.dcr_ref==='DCR-001')&&dcr.data.items.some(x=>x.dcr_ref==='DCR-115'),`count=${dcr.data?.items?.length}`);
  const dcr078=await query("SELECT status,deferred FROM dcr_items WHERE dcr_ref='DCR-078'");record('Stage 5 DCR-078 remains explicit Production Security Dependency',dcr078.rows[0]?.status==='Agreed / Deferred – Production Security Dependency'&&dcr078.rows[0]?.deferred===true,JSON.stringify(dcr078.rows[0]));

  const mfa=await call('/api/v1/auth/mfa/enrol',{method:'POST',session:readonly,body:{}});const mfaDb=await query("SELECT mfa_secret_encrypted,mfa_required FROM users WHERE email='readonly@testtransport.test'");record('MFA foundation generates and stores encrypted test secret',mfa.status===200&&!!mfa.data.secret&&!!mfaDb.rows[0]?.mfa_secret_encrypted&&mfaDb.rows[0].mfa_secret_encrypted!==mfa.data.secret&&mfaDb.rows[0].mfa_required===false,'enrol HTTP '+mfa.status);await query("UPDATE users SET mfa_secret_encrypted=NULL,mfa_required=false WHERE email='readonly@testtransport.test'");

  // Billing authority / transition rules on the acceptance-only Work Order.
  let wo=await call('/api/v1/work-orders/WO-S6-ACCEPT',{session:billing});
  let b1=await call('/api/v1/billing/work-orders/WO-S6-ACCEPT/transition',{method:'POST',session:billing,body:{version:wo.data.version,status:'Billing Review'}});record('Billing transition Not Started → Billing Review is server-controlled',b1.status===200&&b1.data.financialStatus==='Billing Review',JSON.stringify(b1.data));
  const noReason=await call('/api/v1/billing/work-orders/WO-S6-ACCEPT/transition',{method:'POST',session:billing,body:{version:b1.data.version,status:'Financially Closed / No Charge'}});record('No Charge closure requires an authorised reason',noReason.status===422,`HTTP ${noReason.status}`);
  let b2=await call('/api/v1/billing/work-orders/WO-S6-ACCEPT/transition',{method:'POST',session:billing,body:{version:b1.data.version,status:'Validated'}});assert(b2.status===200,'Billing Review → Validated failed');
  let b3=await call('/api/v1/billing/work-orders/WO-S6-ACCEPT/transition',{method:'POST',session:billing,body:{version:b2.data.version,status:'Ready to Invoice'}});record('Billing progresses through Validated → Ready to Invoice',b3.status===200&&b3.data.financialStatus==='Ready to Invoice',JSON.stringify(b3.data));

  // Attendance completion stays separate from Work Order completion.
  let tw=await call('/api/v1/work-orders/WO-S6-ACCEPT',{session:tech});let a=tw.data.attendances.find(x=>x.legacy_ref==='ATT-S6-ACCEPT');
  for(const status of ['En Route','On Site','In Progress','Completed']){const rr=await call('/api/v1/attendances/ATT-S6-ACCEPT/status',{method:'PATCH',session:tech,body:{version:Number(a.version),status,reason:'Stage 6 attendance completion regression'}});assert(rr.status===200,`Attendance transition to ${status} failed HTTP ${rr.status}`);a=rr.data}
  const afterComplete=await call('/api/v1/work-orders/WO-S6-ACCEPT',{session:ops});record('Attendance Completed does not auto-complete Work Order',afterComplete.status===200&&afterComplete.data.status!=='Operationally Complete'&&afterComplete.data.attendances.find(x=>x.legacy_ref==='ATT-S6-ACCEPT')?.status==='Completed',`WO=${afterComplete.data?.status}`);

  const boot=await call('/api/v1/bootstrap',{session:ops});record('Stage 1–5 operational regression seed remains available through backend bootstrap',boot.status===200&&boot.data.mode==='Database/API Backed'&&['WO-10041','WO-10042','WO-10043','WO-10044','WO-10045','WO-10038'].every(id=>boot.data.legacyState.wos.some(x=>x.id===id)),'WO count='+boot.data?.legacyState?.wos?.length);
  const previousAcceptance=await query("SELECT value FROM system_meta WHERE key='stage6_acceptance_last'");record('Database data survived application redeploy',previousAcceptance.rows[0]?.value?.persistenceSentinelPreExisted===true,JSON.stringify({persistenceSentinelPreExisted:previousAcceptance.rows[0]?.value?.persistenceSentinelPreExisted}));

  const summary={passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,total:results.length,build:process.env.RENDER_GIT_COMMIT||process.env.APP_VERSION||'development',results,at:new Date().toISOString()};
  await query(`INSERT INTO system_meta(key,value,updated_at) VALUES('stage6_acceptance_extended_last',$1::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify(summary)]);
  const promotion=await promoteStage6Ready(coreSummary,summary);
  console.log(JSON.stringify({level:'info',event:'stage6_extended_acceptance_complete',...summary,dcrPromotion:promotion}));return {...summary,dcrPromotion:promotion};
}

module.exports={runExtendedAcceptance};
