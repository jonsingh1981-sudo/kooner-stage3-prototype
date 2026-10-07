'use strict';
const {query,tx}=require('./db');

function assert(ok,msg){if(!ok)throw new Error(msg)}

async function promoteDcr116(note){
 return tx(async c=>{
  const r=await c.query("SELECT id,status FROM dcr_items WHERE dcr_ref='DCR-116' FOR UPDATE");
  if(!r.rowCount)throw new Error('DCR-116 is missing');
  const d=r.rows[0],target='Ready to Test';
  await c.query(`UPDATE dcr_items SET status=$2,resolution=$3,retest_result=$4,deferred=false,updated_at=now() WHERE id=$1`,[
   d.id,target,
   'Minimum UAT correction implemented: Technician image content is compressed client-side, stored in Stage 6 PostgreSQL for acceptance testing, remains linked to Work Order / Attendance / Task, is served only to authenticated internal users, and the Operations Evidence tab now renders the stored image. Production object/media storage remains deferred.',
   note
  ]);
  if(d.status!==target)await c.query('INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[d.id,d.status,target,note,'Stage 6 UAT automated retest']);
  return{from:d.status,to:target}
 })
}

async function runUat002Evidence(port){
 if((process.env.APP_ENV||'test')!=='stage6-test')return{skipped:true};
 const password=process.env.TEST_USER_PASSWORD;if(!password)throw new Error('TEST_USER_PASSWORD required');
 const base=`http://127.0.0.1:${port}`;
 async function call(path,{method='GET',session,body}={}){const headers={};if(session?.cookie)headers.cookie=session.cookie;if(session?.csrf&&!['GET','HEAD'].includes(method))headers['x-csrf-token']=session.csrf;if(body!==undefined){headers['content-type']='application/json';body=JSON.stringify(body)}const r=await fetch(base+path,{method,headers,body});const text=await r.text();let data=text;try{data=text?JSON.parse(text):null}catch{}return{status:r.status,data,headers:r.headers}}
 async function login(email){const r=await call('/api/v1/auth/login',{method:'POST',body:{email,password}});assert(r.status===200,`Login failed for ${email}: ${r.status}`);return{cookie:(r.headers.get('set-cookie')||'').split(';')[0],csrf:r.data.csrfToken,email}}

 const fixture=(await query(`SELECT w.legacy_ref work_order_ref,a.legacy_ref attendance_ref,
   (SELECT t.legacy_ref FROM tasks t WHERE t.work_order_id=w.id ORDER BY t.created_at NULLS LAST,t.legacy_ref LIMIT 1) task_ref
   FROM work_orders w JOIN vehicles v ON v.id=w.vehicle_id
   JOIN attendances a ON a.work_order_id=w.id
   JOIN attendance_resource_assignments ara ON ara.attendance_id=a.id
   JOIN technicians tech ON tech.id=ara.technician_id
   JOIN users u ON u.id=tech.user_id
   WHERE upper(v.registration)='AB26 CDE' AND lower(u.email)='technician@kooner.test'
   ORDER BY CASE WHEN w.legacy_ref='WO-S6-ACCEPTED' THEN 0 WHEN w.legacy_ref='WO-S6-ACCEPT' THEN 1 ELSE 2 END,w.updated_at DESC
   LIMIT 1`)).rows[0];
 assert(fixture,'No AB26 CDE Work Order/Attendance assigned to the Stage 6 Technician is available for UAT-002 retest');
 const ref='EV-UAT002-'+Date.now();
 const tech=await login('technician@kooner.test');
 const onePixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const upload=await call('/api/v1/evidence/media',{method:'POST',session:tech,body:{evidenceRef:ref,workOrder:fixture.work_order_ref,attendance:fixture.attendance_ref,task:fixture.task_ref||null,type:'Completion',description:'UAT-002 deployed Technician photo visibility retest',filename:'uat002-technician-photo.png',dataUrl:onePixel,visibility:'Internal Kooner Only'}});
 assert(upload.status===201,`Technician evidence upload failed: HTTP ${upload.status} ${JSON.stringify(upload.data)}`);
 assert(upload.data.storageStatus==='Stored - Stage 6 UAT DB','Evidence did not report stored media status');

 let ops=await login('operations@kooner.test');
 let media=await fetch(base+`/api/v1/evidence/${encodeURIComponent(ref)}/content`,{headers:{cookie:ops.cookie}});
 let bytes=Buffer.from(await media.arrayBuffer());
 assert(media.status===200&&bytes.length>0,`Operations could not retrieve Technician image: HTTP ${media.status}`);
 let boot=await call('/api/v1/bootstrap',{session:ops});assert(boot.status===200,'Operations bootstrap failed after evidence upload');
 let wo=boot.data?.legacyState?.wos?.find(x=>x.id===fixture.work_order_ref),ev=wo?.evidence?.find(x=>x.id===ref);
 assert(ev&&ev.attendance===fixture.attendance_ref&&(!fixture.task_ref||ev.task===fixture.task_ref),`Evidence linkage missing from Operations bootstrap: ${JSON.stringify(ev)}`);
 assert(String(ev.storageStatus||'').startsWith('Stored'),'Operations bootstrap did not show stored evidence status');

 const logout=await call('/api/v1/auth/logout',{method:'POST',session:ops,body:{}});assert(logout.status===200,'Operations logout failed during persistence retest');
 ops=await login('operations@kooner.test');
 media=await fetch(base+`/api/v1/evidence/${encodeURIComponent(ref)}/content`,{headers:{cookie:ops.cookie}});bytes=Buffer.from(await media.arrayBuffer());
 assert(media.status===200&&bytes.length>0,'Evidence media did not remain available after Operations relogin');
 boot=await call('/api/v1/bootstrap',{session:ops});wo=boot.data?.legacyState?.wos?.find(x=>x.id===fixture.work_order_ref);ev=wo?.evidence?.find(x=>x.id===ref);
 assert(ev,'Evidence linkage did not remain after Operations relogin / fresh bootstrap');
 const aud=await query("SELECT 1 FROM audit_events WHERE entity_type='Evidence' AND entity_ref=$1 AND action='Technician photo/evidence stored'",[ref]);assert(aud.rowCount===1,'Evidence server audit record missing');

 const note=`Automated deployed retest PASS on ${fixture.work_order_ref} / AB26 CDE: Technician image stored, linked to Attendance ${fixture.attendance_ref}${fixture.task_ref?` / Task ${fixture.task_ref}`:''}, retrievable by Operations, and still available after logout/relogin. UAT-002 remains open for Jon manual retest plus Operations → Technician return-direction test.`;
 const dcr=await promoteDcr116(note);
 const result={passed:6,failed:0,workOrder:fixture.work_order_ref,registration:'AB26 CDE',attendance:fixture.attendance_ref,task:fixture.task_ref||null,evidenceRef:ref,dcr:'DCR-116',dcrStatus:dcr.to,note};
 console.log(JSON.stringify({level:'info',event:'stage6_uat002_evidence_retest_complete',...result}));
 return result
}
module.exports={runUat002Evidence};
