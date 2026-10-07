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
   'DCR-116 UAT correction implemented: normal Technician photos auto-compress and upload when taken/selected with no separate evidence-save step; a thumbnail is shown only after server confirmation; failed/offline uploads remain a non-authoritative local retry item and cannot satisfy a server evidence gate; stored photos retain Work Order / Attendance / Task linkage; Technician can remove an incorrect active photo through an X and Remove confirmation; removal deletes active media, excludes it from Operations active evidence after refresh, and preserves Evidence Removed audit/history. Production object/media storage remains deferred.',
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

 const ui=await call('/stage6-evidence-uat.js');
 assert(ui.status===200&&typeof ui.data==='string','DCR-116 Technician evidence UX script did not load');
 assert(!ui.data.includes('Save Evidence'),'Technician evidence UX still contains a separate Save Evidence action');
 assert(ui.data.includes('takeRequiredPhoto')&&ui.data.includes('Remove this photo?')&&ui.data.includes('Upload Failed'),'Technician evidence UX is missing auto-capture, removal confirmation or upload-failure handling');

 const stamp=Date.now(),ref=`EV-UAT002-${stamp}`,replacementRef=`EV-UAT002-R-${stamp}`;
 const tech=await login('technician@kooner.test');
 const onePixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const bodyFor=(evidenceRef,type)=>({evidenceRef,workOrder:fixture.work_order_ref,attendance:fixture.attendance_ref,task:fixture.task_ref||null,type,description:'UAT-002 deployed Technician auto-photo retest',filename:`${evidenceRef}.png`,dataUrl:onePixel,visibility:'Internal Kooner Only'});

 const upload=await call('/api/v1/evidence/media',{method:'POST',session:tech,body:bodyFor(ref,'Completion')});
 assert(upload.status===201,`Technician evidence upload failed: HTTP ${upload.status} ${JSON.stringify(upload.data)}`);
 assert(upload.data.storageStatus==='Stored - Stage 6 UAT DB','Evidence did not report stored media status');

 let ops=await login('operations@kooner.test');
 let media=await fetch(base+`/api/v1/evidence/${encodeURIComponent(ref)}/content`,{headers:{cookie:ops.cookie}}),bytes=Buffer.from(await media.arrayBuffer());
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

 const removed=await call(`/api/v1/evidence/${encodeURIComponent(ref)}`,{method:'DELETE',session:tech,body:{reason:'Automated UAT incorrect-photo removal'}});
 assert(removed.status===200&&removed.data?.removed===true,`Technician photo removal failed: HTTP ${removed.status}`);
 media=await fetch(base+`/api/v1/evidence/${encodeURIComponent(ref)}/content`,{headers:{cookie:ops.cookie}});assert(media.status===404,'Removed evidence content remains active/retrievable');
 boot=await call('/api/v1/bootstrap',{session:ops});wo=boot.data?.legacyState?.wos?.find(x=>x.id===fixture.work_order_ref);ev=wo?.evidence?.find(x=>x.id===ref);
 assert(!ev,'Removed evidence remains in Operations active Evidence view/bootstrap');
 const removalAudit=await query(`SELECT user_id,action,new_value,created_at FROM audit_events WHERE entity_type='Evidence' AND entity_ref=$1 AND action='Evidence Removed' ORDER BY created_at DESC LIMIT 1`,[ref]);
 assert(removalAudit.rowCount===1,'Evidence Removed audit/history record is missing');
 const av=removalAudit.rows[0].new_value||{};
 assert(removalAudit.rows[0].user_id&&av.workOrder===fixture.work_order_ref&&av.attendance===fixture.attendance_ref&&av.evidenceRef===ref&&(!fixture.task_ref||av.task===fixture.task_ref),'Evidence Removed audit does not retain Technician/user and Work Order/Attendance/Task/evidence linkage');

 const replacement=await call('/api/v1/evidence/media',{method:'POST',session:tech,body:bodyFor(replacementRef,'After Repair')});
 assert(replacement.status===201,'Replacement Technician photo upload failed');
 boot=await call('/api/v1/bootstrap',{session:ops});wo=boot.data?.legacyState?.wos?.find(x=>x.id===fixture.work_order_ref);ev=wo?.evidence?.find(x=>x.id===replacementRef);
 assert(ev&&ev.attendance===fixture.attendance_ref&&(!fixture.task_ref||ev.task===fixture.task_ref),'Replacement photo did not appear with correct active linkage in Operations');
 media=await fetch(base+`/api/v1/evidence/${encodeURIComponent(replacementRef)}/content`,{headers:{cookie:ops.cookie}});bytes=Buffer.from(await media.arrayBuffer());assert(media.status===200&&bytes.length>0,'Replacement photo content is not available to Operations');

 const d117=(await query("SELECT status,resolution FROM dcr_items WHERE dcr_ref='DCR-117'")).rows[0];
 assert(d117&&d117.status==='Agreed – Awaiting Build','DCR-117 is not recorded as Agreed – Awaiting Build');
 assert(/do not build|recorded only/i.test(String(d117.resolution||'')),'DCR-117 does not clearly remain unimplemented');

 // Clean up the automated replacement from the active Evidence view while retaining its audit trail.
 const replacementCleanup=await call(`/api/v1/evidence/${encodeURIComponent(replacementRef)}`,{method:'DELETE',session:tech,body:{reason:'Automated UAT fixture cleanup after replacement-photo proof'}});
 assert(replacementCleanup.status===200,'Automated replacement evidence cleanup failed');

 const note=`Automated deployed DCR-116 UX retest PASS on ${fixture.work_order_ref} / AB26 CDE: no separate evidence-save button; Technician upload stored and linked to Attendance ${fixture.attendance_ref}${fixture.task_ref?` / Task ${fixture.task_ref}`:''}; Operations retrieved it; it persisted across logout/relogin; Technician removal made it inactive and retained Evidence Removed audit/history; a replacement photo then appeared correctly. DCR-117 is recorded as Agreed – Awaiting Build and was not implemented. UAT-002 remains open for Jon's 10-step manual retest including Operations → Technician return-direction.`;
 const dcr=await promoteDcr116(note);
 const result={passed:12,failed:0,workOrder:fixture.work_order_ref,registration:'AB26 CDE',attendance:fixture.attendance_ref,task:fixture.task_ref||null,evidenceRef:ref,replacementRef,dcr:'DCR-116',dcrStatus:dcr.to,dcr117:'Agreed – Awaiting Build',note};
 console.log(JSON.stringify({level:'info',event:'stage6_uat002_evidence_retest_complete',...result}));
 return result
}
module.exports={runUat002Evidence};
