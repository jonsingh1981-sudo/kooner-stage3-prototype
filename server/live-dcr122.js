'use strict';
const fs=require('fs');
const path=require('path');
const {query,tx}=require('./db');
function assert(ok,msg){if(!ok)throw new Error(msg)}
function read(name){return fs.readFileSync(path.join(__dirname,'..',name),'utf8')}
function ref(tag){return `WO-DCR122-${tag}-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}

async function primarySnapshot(){
 const w=(await query(`SELECT w.status,w.financial_status,w.current_owner,w.next_action,w.version,w.updated_at,w.data,v.registration
   FROM work_orders w JOIN vehicles v ON v.id=w.vehicle_id WHERE w.legacy_ref='WO-10046'`)).rows[0];
 const a=(await query(`SELECT a.legacy_ref,a.status,a.arrived_at,a.departed_at,a.outcome,a.version,a.updated_at,a.data
   FROM attendances a JOIN work_orders w ON w.id=a.work_order_id WHERE w.legacy_ref='WO-10046' ORDER BY a.legacy_ref`)).rows;
 return{w,a}
}
async function cleanup(refs){
 if(!refs.length)return;const wos=refs.map(x=>x.wo),entities=refs.flatMap(x=>[x.wo,x.att,x.evLocal,x.evStored]).filter(Boolean);
 await query('DELETE FROM notification_events WHERE entity_ref=ANY($1::text[])',[entities]);
 await query('DELETE FROM audit_events WHERE entity_ref=ANY($1::text[])',[entities]);
 await query("DELETE FROM technician_labour_reviews WHERE work_order_id IN (SELECT id FROM work_orders WHERE legacy_ref=ANY($1::text[]))",[wos]);
 await query("DELETE FROM labour_time_entries WHERE work_order_id IN (SELECT id FROM work_orders WHERE legacy_ref=ANY($1::text[]))",[wos]);
 await query("DELETE FROM evidence_metadata WHERE work_order_id IN (SELECT id FROM work_orders WHERE legacy_ref=ANY($1::text[]))",[wos]);
 await query("DELETE FROM tasks WHERE work_order_id IN (SELECT id FROM work_orders WHERE legacy_ref=ANY($1::text[]))",[wos]);
 await query("DELETE FROM attendance_resource_assignments WHERE attendance_id IN (SELECT a.id FROM attendances a JOIN work_orders w ON w.id=a.work_order_id WHERE w.legacy_ref=ANY($1::text[]))",[wos]);
 await query("DELETE FROM attendances WHERE work_order_id IN (SELECT id FROM work_orders WHERE legacy_ref=ANY($1::text[]))",[wos]);
 await query('DELETE FROM work_orders WHERE legacy_ref=ANY($1::text[])',[wos]);
}
async function fixture(base,tech,tag,{working=false,registrationPhoto=false}={}){
 const wo=ref(tag),att=wo.replace('WO-','ATT-'),now=new Date().toISOString();
 const data=working
  ?{journey:{acceptedAt:now,enRouteAt:now,onSiteAt:now,workStartedAt:now},vehicleConfirmation:{match:true,found:base.registration,at:now},safety:{safe:true},...(registrationPhoto?{workflow:{requiredPhotos:['Registration']}}:{})}
  :{journey:{acceptedAt:now,enRouteAt:now,onSiteAt:now}};
 await tx(async c=>{
  const w=await c.query(`INSERT INTO work_orders(legacy_ref,customer_id,contract_id,site_id,vehicle_id,work_type,priority,fault_description,status,financial_status,current_owner,next_action,data)
   VALUES($1,$2,$3,$4,$5,'Breakdown','Normal','DCR-122 vehicle verification fixture','In Progress','Not Started','Technician','Vehicle confirmation and safety check','{}'::jsonb) RETURNING id`,[wo,base.customer_id,base.contract_id,base.site_id,base.vehicle_id]);
  const a=await c.query(`INSERT INTO attendances(legacy_ref,work_order_id,attendance_type,status,arrived_at,data)
   VALUES($1,$2,'Mobile Repair',$3,now(),$4::jsonb) RETURNING id`,[att,w.rows[0].id,working?'In Progress':'On Site',JSON.stringify(data)]);
  await c.query('INSERT INTO attendance_resource_assignments(attendance_id,technician_id) VALUES($1,$2)',[a.rows[0].id,tech.id]);
 });
 return{wo,att}
}
async function promote(note){
 return tx(async c=>{
  const d122=(await c.query("SELECT id,status FROM dcr_items WHERE dcr_ref='DCR-122' FOR UPDATE")).rows[0];assert(d122,'DCR-122 missing');
  const d121=(await c.query("SELECT status,retest_result FROM dcr_items WHERE dcr_ref='DCR-121'")).rows[0];assert(d121?.status==='Completed'&&/PASS/i.test(String(d121.retest_result||'')),'DCR-121 manual PASS state must remain Completed');
  const d120=(await c.query("SELECT status FROM dcr_items WHERE dcr_ref='DCR-120'")).rows[0];assert(d120?.status==='Manual UAT in progress – blocked at Registration Verification by DCR-122','DCR-120 formal manual state changed unexpectedly');
  const d117=(await c.query("SELECT status FROM dcr_items WHERE dcr_ref='DCR-117'")).rows[0];assert(d117?.status==='Ready to Test – dependent on corrected Technician journey','DCR-117 dependency state changed unexpectedly');
  const d119=(await c.query("SELECT status FROM dcr_items WHERE dcr_ref='DCR-119'")).rows[0];assert(d119?.status==='Agreed – Awaiting Build','DCR-119 must remain unbuilt');
  const target='Ready to Test';
  await c.query(`UPDATE dcr_items SET status=$2,resolution=$3,retest_result=$4,deferred=false,updated_at=now() WHERE id=$1`,[
   d122.id,target,
   'DCR-122 correction deployed. Technician registration confirmation now opens with a blank entry field and a physical-vehicle instruction. Stage 6 server comparison remains authoritative, normalises spacing/case, persists match identity/time/Attendance audit, blocks mismatch from progressing, flags mismatch to Operations without changing the Work Order vehicle, and reuses configured Customer / Contract / Workflow / Task evidence rules for Registration photos. Only active server-stored media satisfies mandatory evidence.',
   'Automated deployed DCR-122 acceptance PASS. Jon manual retest is required on WO-10046 / AB26 CDE at its existing On Site stage. Do not advance the manual registration until Jon confirms the blank-field UX.'
  ]);
  if(d122.status!==target)await c.query('INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[d122.id,d122.status,target,note,'Stage 6 DCR-122 automated acceptance']);
  return{dcr122:target,dcr121:d121.status,dcr120:d120.status,dcr117:d117.status,dcr119:d119.status}
 })
}

async function runDcr122(port,ctx={}){
 if((process.env.APP_ENV||'test')!=='stage6-test')return{skipped:true};
 const password=process.env.TEST_USER_PASSWORD;if(!password)throw new Error('TEST_USER_PASSWORD required');
 const baseUrl=`http://127.0.0.1:${port}`,refs=[],results=[];
 const check=(name,ok,detail='')=>{assert(ok,`${name}: ${detail||'failed'}`);results.push({name,ok:true,detail})};
 async function call(pathname,{method='GET',session,body}={}){const headers={'x-kooner-interface':'Technician Mobile'};if(session?.cookie)headers.cookie=session.cookie;if(session?.csrf&&!['GET','HEAD'].includes(method))headers['x-csrf-token']=session.csrf;if(body!==undefined){headers['content-type']='application/json';body=JSON.stringify(body)}const r=await fetch(baseUrl+pathname,{method,headers,body}),text=await r.text();let data=text;try{data=text?JSON.parse(text):null}catch{}return{status:r.status,data,headers:r.headers}}
 async function login(){const r=await call('/api/v1/auth/login',{method:'POST',body:{email:'technician@kooner.test',password}});assert(r.status===200,`Technician login failed: ${r.status}`);return{cookie:(r.headers.get('set-cookie')||'').split(';')[0],csrf:r.data.csrfToken}}
 async function boot(session){return call('/api/v1/bootstrap',{session})}
 const primaryBefore=await primarySnapshot();assert(primaryBefore.w,'WO-10046 missing');
 try{
  check('Core Stage 6 regression remains passed',ctx.core?.failed===0&&ctx.core?.total>=24,`${ctx.core?.passed||0}/${ctx.core?.total||0}`);
  check('Full Stage 6 regression remains passed',ctx.final?.failed===0&&ctx.final?.total>=42,`${ctx.final?.passed||0}/${ctx.final?.total||0}`);
  check('DCR-116 evidence regression remains passed',ctx.evidence?.failed===0&&ctx.evidence?.passed>=12,`${ctx.evidence?.passed||0}/${ctx.evidence?.total||ctx.evidence?.passed||0}`);
  check('DCR-117 automated regression remains passed',ctx.dcr117?.failed===0&&ctx.dcr117?.passed>=15,`${ctx.dcr117?.passed||0}/${ctx.dcr117?.total||0}`);
  check('DCR-118 automated regression remains passed',ctx.dcr118?.failed===0&&ctx.dcr118?.passed>=18,`${ctx.dcr118?.passed||0}/${ctx.dcr118?.total||0}`);
  check('DCR-120 automated regression remains passed',ctx.dcr120?.failed===0&&ctx.dcr120?.passed>=25,`${ctx.dcr120?.passed||0}/${ctx.dcr120?.total||0}`);
  check('DCR-121 automated regression remains passed',ctx.dcr121?.failed===0&&ctx.dcr121?.passed>=30,`${ctx.dcr121?.passed||0}/${ctx.dcr121?.total||0}`);

  const html=read('technician.html'),ui=read('stage6-registration-integrity.js'),server=read('server/stage6-technician-journey-router.js'),close=read('server/stage6-technician-close-router.js');
  check('DCR-122 override loads after guided journey',html.indexOf('stage6-registration-integrity.js')>html.indexOf('stage6-guided-journey.js'),'Technician script order');
  check('Registration confirmation gives physical-vehicle instruction',ui.includes('Look at the vehicle and enter the registration you can see.'),'instruction present');
  check('Registration entry is blank and not pre-populated',ui.includes('id="vcReg" value=""')&&!ui.includes('value="${v.reg}"')&&!ui.includes('<div class=reg>${v.reg}</div>'),'blank input');
  check('Stage 6 server normalises registration spacing/case',server.includes("replace(/\\s+/g,'').toUpperCase()")&&server.includes('normReg(found)===normReg(ctx.registration)'),'authoritative normalisation');
  check('Mismatch cannot silently replace Work Order vehicle',server.includes('Work Order vehicle unchanged')&&!server.includes('UPDATE vehicles SET registration'),'server mismatch integrity');
  check('Configured registration evidence uses active server-stored media only',close.includes("e.removed_at IS NULL AND e.content_data IS NOT NULL AND e.storage_status LIKE 'Stored%'")&&close.includes("'registration':'Registration'"),'existing evidence authority');

  const base=(await query(`SELECT w.customer_id,w.contract_id,w.site_id,w.vehicle_id,v.registration FROM work_orders w JOIN vehicles v ON v.id=w.vehicle_id WHERE w.legacy_ref='WO-10046'`)).rows[0];
  const tech=(await query("SELECT t.id,u.id user_id FROM technicians t JOIN users u ON u.id=t.user_id WHERE lower(u.email)='technician@kooner.test'")).rows[0];assert(base&&tech,'DCR-122 fixture base unavailable');
  let session=await login();

  const match=await fixture(base,tech,'MATCH');refs.push(match);
  const typed=String(base.registration).replace(/\s+/g,'').toLowerCase();
  let r=await call(`/api/v1/technician-journey/${encodeURIComponent(match.wo)}/${encodeURIComponent(match.att)}/action`,{method:'POST',session,body:{action:'registration',registration:typed}});
  check('Manually entered matching registration passes',r.status===200&&r.data.vehicleConfirmation?.match===true,JSON.stringify(r.data));
  check('Spaces and case are normalised for the match',r.data.vehicleConfirmation?.match===true&&r.data.nextAction?.code==='safety',JSON.stringify(r.data.nextAction));
  let q=(await query('SELECT status,data FROM attendances WHERE legacy_ref=$1',[match.att])).rows[0];
  check('Registration confirmation persists user, time and Attendance linkage',q?.status==='On Site'&&q.data?.vehicleConfirmation?.match===true&&!!q.data?.vehicleConfirmation?.at&&String(q.data?.vehicleConfirmation?.userId)===String(tech.user_id),JSON.stringify(q?.data?.vehicleConfirmation));
  q=(await query("SELECT count(*)::int n FROM audit_events WHERE entity_type='Attendance' AND entity_ref=$1 AND action='Technician Journey – Registration Confirmed'",[match.att])).rows[0];
  check('Successful registration confirmation is audited',q?.n===1,String(q?.n||0));
  let b=await boot(session),bw=b.data?.legacyState?.wos?.find(x=>x.id===match.wo),ba=bw?.att?.find(x=>x.id===match.att);
  check('Fresh bootstrap retains confirmed registration state',b.status===200&&ba?.vehicleConfirmation?.match===true,JSON.stringify(ba?.vehicleConfirmation));
  let logout=await call('/api/v1/auth/logout',{method:'POST',session,body:{}});assert(logout.status===200,'DCR-122 logout failed');session=await login();b=await boot(session);bw=b.data?.legacyState?.wos?.find(x=>x.id===match.wo);ba=bw?.att?.find(x=>x.id===match.att);
  check('Registration confirmation survives relogin',b.status===200&&ba?.vehicleConfirmation?.match===true,JSON.stringify(ba?.vehicleConfirmation));
  await query("UPDATE attendances SET status='Completed',departed_at=now(),updated_at=now() WHERE legacy_ref=$1",[match.att]);

  const mismatch=await fixture(base,tech,'MISMATCH');refs.push(mismatch);
  r=await call(`/api/v1/technician-journey/${encodeURIComponent(mismatch.wo)}/${encodeURIComponent(mismatch.att)}/action`,{method:'POST',session,body:{action:'registration',registration:'ZZ99 ZZZ'}});
  check('Registration mismatch requires an explanation',r.status===422&&/mismatch explanation/i.test(String(r.data?.message||'')),JSON.stringify(r.data));
  const reason='DCR-122 controlled mismatch – vehicle onsite does not match job';
  r=await call(`/api/v1/technician-journey/${encodeURIComponent(mismatch.wo)}/${encodeURIComponent(mismatch.att)}/action`,{method:'POST',session,body:{action:'registration',registration:'ZZ99 ZZZ',note:reason}});
  check('Explained mismatch is retained without falsely confirming vehicle',r.status===200&&r.data.vehicleConfirmation?.match===false&&r.data.nextAction?.code==='registration',JSON.stringify(r.data));
  q=(await query(`SELECT w.status,w.current_owner,w.next_action,v.registration,a.data attendance_data FROM work_orders w JOIN vehicles v ON v.id=w.vehicle_id JOIN attendances a ON a.work_order_id=w.id AND a.legacy_ref=$2 WHERE w.legacy_ref=$1`,[mismatch.wo,mismatch.att])).rows[0];
  check('Mismatch flags the job to Operations',q?.status==='On Hold'&&q?.current_owner==='Operations'&&/Review vehicle mismatch/.test(String(q?.next_action||'')),JSON.stringify(q));
  check('Mismatch does not overwrite authoritative Work Order vehicle registration',q?.registration===base.registration,`${q?.registration} expected ${base.registration}`);
  q=(await query("SELECT count(*)::int n FROM audit_events WHERE entity_type='Attendance' AND entity_ref=$1 AND action='Technician Journey – Registration Mismatch' AND reason=$2",[mismatch.att,reason])).rows[0];
  check('Registration mismatch is audited with reason',q?.n===1,String(q?.n||0));
  r=await call(`/api/v1/technician-journey/${encodeURIComponent(mismatch.wo)}/${encodeURIComponent(mismatch.att)}/action`,{method:'POST',session,body:{action:'start_work'}});
  check('Incorrect registration cannot Start Work',r.status===422&&r.data?.error==='OUT_OF_SEQUENCE'&&r.data?.nextJourneyAction?.code==='registration',JSON.stringify(r.data));
  await query("UPDATE attendances SET status='Completed',departed_at=now(),updated_at=now() WHERE legacy_ref=$1",[mismatch.att]);

  const ev=await fixture(base,tech,'REGPHOTO',{working:true,registrationPhoto:true});refs.push(ev);ev.evLocal='EV-DCR122-LOCAL-'+Date.now();ev.evStored='EV-DCR122-STORED-'+Date.now();
  r=await call(`/api/v1/technician-close/${encodeURIComponent(ev.wo)}/${encodeURIComponent(ev.att)}/readiness`,{session});
  check('Configured mandatory Registration photo blocks Finish Job when missing',r.status===200&&r.data.finishAvailable===true&&r.data.missing?.some(x=>x.code==='evidence'&&x.evidenceType==='Registration'),JSON.stringify(r.data));
  const ids=(await query(`SELECT w.id wid,a.id aid,u.id uid FROM work_orders w JOIN attendances a ON a.work_order_id=w.id JOIN users u ON lower(u.email)='technician@kooner.test' WHERE w.legacy_ref=$1 AND a.legacy_ref=$2`,[ev.wo,ev.att])).rows[0];
  await query(`INSERT INTO evidence_metadata(legacy_ref,work_order_id,attendance_id,evidence_type,filename,storage_status,captured_by,source,data) VALUES($1,$2,$3,'Registration','local-registration.jpg','Metadata Only',$4,'Technician Mobile','{}'::jsonb)`,[ev.evLocal,ids.wid,ids.aid,ids.uid]);
  r=await call(`/api/v1/technician-close/${encodeURIComponent(ev.wo)}/${encodeURIComponent(ev.att)}/readiness`,{session});
  check('Local-only Registration image does not satisfy mandatory evidence',r.status===200&&r.data.missing?.some(x=>x.evidenceType==='Registration'),JSON.stringify(r.data));
  const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  r=await call('/api/v1/evidence/media',{method:'POST',session,body:{evidenceRef:ev.evStored,workOrder:ev.wo,attendance:ev.att,type:'Registration',filename:'registration.png',dataUrl:pixel}});
  check('Server-confirmed Registration photo stores successfully',r.status===201&&String(r.data?.storageStatus||'').startsWith('Stored'),JSON.stringify(r.data));
  r=await call(`/api/v1/technician-close/${encodeURIComponent(ev.wo)}/${encodeURIComponent(ev.att)}/readiness`,{session});
  check('Server-confirmed Registration photo satisfies configured evidence gate',r.status===200&&r.data.ready===true&&!r.data.missing?.some(x=>x.evidenceType==='Registration'),JSON.stringify(r.data));
  r=await call(`/api/v1/evidence/${encodeURIComponent(ev.evStored)}`,{method:'DELETE',session,body:{reason:'DCR-122 removed registration evidence regression'}});assert(r.status===200,'DCR-122 registration evidence removal failed');
  r=await call(`/api/v1/technician-close/${encodeURIComponent(ev.wo)}/${encodeURIComponent(ev.att)}/readiness`,{session});
  check('Removed Registration evidence no longer satisfies mandatory requirement',r.status===200&&r.data.missing?.some(x=>x.evidenceType==='Registration'),JSON.stringify(r.data));
  await query("UPDATE attendances SET status='Completed',departed_at=now(),updated_at=now() WHERE legacy_ref=$1",[ev.att]);

  const noev=await fixture(base,tech,'NOPHOTO',{working:true,registrationPhoto:false});refs.push(noev);
  r=await call(`/api/v1/technician-close/${encodeURIComponent(noev.wo)}/${encodeURIComponent(noev.att)}/readiness`,{session});
  check('Registration photo is not forced when no rule configures it',r.status===200&&r.data.ready===true&&!r.data.missing?.some(x=>x.evidenceType==='Registration'),JSON.stringify(r.data));
  await query("UPDATE attendances SET status='Completed',departed_at=now(),updated_at=now() WHERE legacy_ref=$1",[noev.att]);

  const primaryAfter=await primarySnapshot();
  check('WO-10046 / AB26 CDE was not altered by DCR-122 automated testing',same(primaryBefore,primaryAfter),JSON.stringify(primaryAfter));
  const note=`DCR-122 deployed acceptance PASS (${results.length} checks). Blank/manual registration UX, server-authoritative normalised match, mismatch block/Operations flag/audit, persistence and configured Registration-photo evidence rules were validated without altering WO-10046 / AB26 CDE.`;
  const statuses=await promote(note);
  const result={passed:results.length,failed:0,total:results.length,dcr:'DCR-122',dcrStatus:statuses.dcr122,dcr121Status:statuses.dcr121,dcr120Status:statuses.dcr120,dcr117Status:statuses.dcr117,dcr119Status:statuses.dcr119,primaryManualWorkOrder:'WO-10046',registration:'AB26 CDE',results,note};
  console.log(JSON.stringify({level:'info',event:'stage6_dcr122_acceptance_complete',...result}));return result
 }finally{await cleanup(refs)}
}
module.exports={runDcr122};
