'use strict';

const {query,tx}=require('./db');

function assert(condition,message){if(!condition)throw new Error(message)}

async function prepareFixtures(){
  return tx(async c=>{
    const c1=(await c.query("SELECT id FROM customers WHERE legacy_ref='C1'")).rows[0];
    const s1=(await c.query("SELECT id FROM sites WHERE legacy_ref='S1'")).rows[0];
    const v1=(await c.query("SELECT id FROM vehicles WHERE legacy_ref='V1'")).rows[0];
    const tech=(await c.query("SELECT id,user_id FROM technicians WHERE legacy_ref='T1'")).rows[0];
    assert(c1&&s1&&v1&&tech,'Stage 6 acceptance fixtures require C1/S1/V1/T1 seed data');

    // Dedicated read-only test user uses the same test-only password hash as the
    // seeded Birmingham manager. It is never created in a production environment.
    const sourceUser=(await c.query("SELECT password_hash FROM users WHERE email='birmingham.manager@testtransport.test'")).rows[0];
    assert(sourceUser,'Birmingham manager test user is missing');
    const ro=(await c.query(`INSERT INTO users(legacy_ref,email,display_name,password_hash,active,user_type,customer_id)
      VALUES('CU-READONLY','readonly@testtransport.test','Test Transport Read Only', $1,true,'customer',$2)
      ON CONFLICT(email) DO UPDATE SET active=true,password_hash=EXCLUDED.password_hash,display_name=EXCLUDED.display_name,customer_id=EXCLUDED.customer_id
      RETURNING id`,[sourceUser.password_hash,c1.id])).rows[0];
    await c.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='read_only' ON CONFLICT DO NOTHING",[ro.id]);
    await c.query("INSERT INTO user_scopes(user_id,customer_id,site_id,scope_type) VALUES($1,$2,$3,'site') ON CONFLICT DO NOTHING",[ro.id,c1.id,s1.id]);

    const wo=(await c.query(`INSERT INTO work_orders(legacy_ref,customer_id,site_id,vehicle_id,work_type,priority,fault_description,status,financial_status,current_owner,next_action,vor,data,version)
      VALUES('WO-S6-ACCEPT',$1,$2,$3,'Stage 6 Acceptance','Normal','Stage 6 shared database acceptance fixture','Pending Triage','Not Started','Operations','Run Stage 6 acceptance',false,'{"testOnly":true}'::jsonb,1)
      ON CONFLICT(legacy_ref) DO UPDATE SET customer_id=EXCLUDED.customer_id,site_id=EXCLUDED.site_id,vehicle_id=EXCLUDED.vehicle_id,status='Pending Triage',financial_status='Not Started',current_owner='Operations',next_action='Run Stage 6 acceptance',data=EXCLUDED.data,version=1,updated_at=now()
      RETURNING id`,[c1.id,s1.id,v1.id])).rows[0];

    async function attendance(ref){
      const a=(await c.query(`INSERT INTO attendances(legacy_ref,work_order_id,attendance_type,status,planned_at,data,version)
        VALUES($1,$2,'Mobile','Dispatched',now(),'{"testOnly":true}'::jsonb,1)
        ON CONFLICT(legacy_ref) DO UPDATE SET work_order_id=EXCLUDED.work_order_id,status='Dispatched',arrived_at=NULL,departed_at=NULL,data=EXCLUDED.data,version=1,updated_at=now()
        RETURNING id`,[ref,wo.id])).rows[0];
      await c.query('DELETE FROM attendance_resource_assignments WHERE attendance_id=$1',[a.id]);
      await c.query('INSERT INTO attendance_resource_assignments(attendance_id,technician_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[a.id,tech.id]);
      return a;
    }
    await attendance('ATT-S6-ACCEPT');
    await attendance('ATT-S6-SYNC');

    const est=(await c.query(`INSERT INTO estimates(legacy_ref,work_order_id,status,current_version_no,version)
      VALUES('EST-S6-ACCEPT',$1,'Sent',1,1)
      ON CONFLICT(legacy_ref) DO UPDATE SET work_order_id=EXCLUDED.work_order_id,status='Sent',current_version_no=1,version=1,updated_at=now()
      RETURNING id`,[wo.id])).rows[0];
    const ev=(await c.query(`INSERT INTO estimate_versions(estimate_id,version_no,status,net,vat,gross,scope,data)
      VALUES($1,1,'Sent',100,20,120,'Stage 6 acceptance fixture','{"testOnly":true}'::jsonb)
      ON CONFLICT(estimate_id,version_no) DO UPDATE SET status='Sent',net=100,vat=20,gross=120,scope=EXCLUDED.scope,data=EXCLUDED.data
      RETURNING id`,[est.id])).rows[0];
    await c.query('DELETE FROM estimate_approval_history WHERE estimate_version_id=$1',[ev.id]);

    // Fixed event ids let the idempotency/conflict test be rerun safely on every deploy.
    await c.query(`DELETE FROM conflicts WHERE sync_event_id IN (SELECT id FROM sync_events WHERE event_id = ANY($1::text[]))`,[['S6-SYNC-IDEMPOTENT','S6-SYNC-CONFLICT']]);
    await c.query('DELETE FROM sync_events WHERE event_id = ANY($1::text[])',[['S6-SYNC-IDEMPOTENT','S6-SYNC-CONFLICT']]);

    const sentinel=await c.query("SELECT value FROM system_meta WHERE key='stage6_persistence_sentinel'");
    const persisted=sentinel.rowCount>0;
    if(!persisted)await c.query("INSERT INTO system_meta(key,value) VALUES('stage6_persistence_sentinel',jsonb_build_object('createdAt',now()::text,'marker',gen_random_uuid()::text))");
    return {persisted};
  });
}

async function runLiveAcceptance(port){
  const appEnv=process.env.APP_ENV||'test';
  if(appEnv==='production')return {skipped:true,reason:'Never run the Stage 6 acceptance harness in production'};
  const password=process.env.TEST_USER_PASSWORD;
  if(!password)throw new Error('TEST_USER_PASSWORD is required for Stage 6 live acceptance');
  const base=`http://127.0.0.1:${port}`;
  const results=[];
  const fixture=await prepareFixtures();

  async function call(path,{method='GET',session,body,headers={}}={}){
    const h={...headers};
    if(session?.cookie)h.cookie=session.cookie;
    if(body!==undefined){h['content-type']='application/json';body=JSON.stringify(body)}
    if(session?.csrf&&!['GET','HEAD'].includes(method))h['x-csrf-token']=session.csrf;
    const r=await fetch(base+path,{method,headers:h,body});
    const text=await r.text();let data=text;
    try{data=text?JSON.parse(text):null}catch{}
    return{status:r.status,data,headers:r.headers};
  }
  async function login(email){
    const r=await call('/api/v1/auth/login',{method:'POST',body:{email,password}});
    assert(r.status===200,`Login failed for ${email}: HTTP ${r.status}`);
    const setCookie=r.headers.get('set-cookie')||'';
    const cookie=setCookie.split(';')[0];
    assert(cookie.startsWith('kooner_session='),`Session cookie missing for ${email}`);
    return{email,cookie,csrf:r.data.csrfToken};
  }
  function record(name,ok,detail=''){results.push({name,ok,detail});if(!ok)throw new Error(`${name}: ${detail}`)}

  const health=await call('/api/v1/health/ready');record('Health / PostgreSQL readiness',health.status===200&&health.data?.database==='reachable',JSON.stringify(health.data));
  const unauth=await call('/api/v1/work-orders');record('Unauthenticated API rejected',unauth.status===401,`HTTP ${unauth.status}`);

  const ops=await login('operations@kooner.test');
  const tech=await login('technician@kooner.test');
  const cust=await login('customer.admin@testtransport.test');
  const site=await login('birmingham.manager@testtransport.test');
  const finance=await login('finance@testtransport.test');
  const readonly=await login('readonly@testtransport.test');
  record('Controlled Stage 6 test logins',true,'Operations, Technician, Customer Admin, Site Manager, Finance, Read Only');

  const opWo0=await call('/api/v1/work-orders/WO-S6-ACCEPT',{session:ops});
  const techWo0=await call('/api/v1/work-orders/WO-S6-ACCEPT',{session:tech});
  record('Operations and Technician retrieve same Work Order',opWo0.status===200&&techWo0.status===200&&opWo0.data.id===techWo0.data.id,`Ops ${opWo0.status}, Tech ${techWo0.status}`);

  const marker=`Stage 6 shared update ${Date.now()}`;
  const opPatch=await call('/api/v1/work-orders/WO-S6-ACCEPT',{method:'PATCH',session:ops,body:{version:opWo0.data.version,nextAction:marker,reason:'Stage 6 live shared-database acceptance'}});
  assert(opPatch.status===200,`Operations shared update failed: HTTP ${opPatch.status}`);
  const techAfter=await call('/api/v1/work-orders/WO-S6-ACCEPT',{session:tech});
  record('Operations update visible to independent Technician session',techAfter.status===200&&techAfter.data.nextAction===marker&&techAfter.data.version===opPatch.data.version,`Tech version ${techAfter.data?.version}`);

  const stale=await call('/api/v1/work-orders/WO-S6-ACCEPT',{method:'PATCH',session:ops,body:{version:opWo0.data.version,nextAction:'stale overwrite attempt'}});
  record('Optimistic concurrency rejects stale write',stale.status===409,`HTTP ${stale.status}`);
  const invalid=await call('/api/v1/work-orders/WO-S6-ACCEPT',{method:'PATCH',session:ops,body:{version:opPatch.data.version,status:'Operationally Complete'}});
  record('Backend rejects invalid Work Order transition',invalid.status===422,`HTTP ${invalid.status}`);

  const att0=techAfter.data.attendances.find(x=>x.legacy_ref==='ATT-S6-ACCEPT');
  assert(att0,'Technician acceptance Attendance missing');
  const attPatch=await call('/api/v1/attendances/ATT-S6-ACCEPT/status',{method:'PATCH',session:tech,body:{version:Number(att0.version),status:'Accepted',reason:'Stage 6 live acceptance'}});
  assert(attPatch.status===200,`Technician Attendance update failed: HTTP ${attPatch.status}`);
  const opAfterTech=await call('/api/v1/work-orders/WO-S6-ACCEPT',{session:ops});
  const opAtt=opAfterTech.data.attendances.find(x=>x.legacy_ref==='ATT-S6-ACCEPT');
  record('Technician update visible to Operations session',opAtt?.status==='Accepted','Operations sees '+(opAtt?.status||'missing'));

  const customerBoot=await call('/api/v1/bootstrap',{session:cust});
  const customerWo=customerBoot.data?.legacyState?.wos?.find(x=>x.id==='WO-S6-ACCEPT');
  const customerEst=customerWo?.ests?.find(x=>x.id==='EST-S6-ACCEPT');
  record('Customer Portal retrieves same server Estimate',customerBoot.status===200&&!!customerEst,'Estimate present='+!!customerEst);
  const approve=await call('/api/v1/estimates/EST-S6-ACCEPT/approve',{method:'POST',session:cust,headers:{'idempotency-key':'S6-EST-APPROVE'},body:{version:1,decision:'Approved',comments:'Stage 6 shared approval test'}});
  assert(approve.status===200,`Customer Estimate approval failed: HTTP ${approve.status}`);
  const audit=await call('/api/v1/audit?limit=100',{session:ops});
  record('Customer approval visible in Operations audit',audit.status===200&&audit.data.items.some(x=>x.entity_ref==='EST-S6-ACCEPT'&&x.action==='Estimate Approved'),'Approval audit found='+audit.data?.items?.some?.(x=>x.entity_ref==='EST-S6-ACCEPT'));
  const reapprove=await call('/api/v1/estimates/EST-S6-ACCEPT/approve',{method:'POST',session:cust,headers:{'idempotency-key':'S6-EST-REAPPROVE'},body:{version:1,decision:'Approved'}});
  record('Estimate cannot be approved again after decision',reapprove.status===422,`HTTP ${reapprove.status}`);

  const crossCustomer=await call('/api/v1/vehicles/V4',{session:cust});
  record('Customer cannot retrieve another Customer vehicle',crossCustomer.status===403,`HTTP ${crossCustomer.status}`);
  const crossSite=await call('/api/v1/vehicles/V2',{session:site});
  record('Site Manager cannot retrieve another Site vehicle',crossSite.status===403,`HTTP ${crossSite.status}`);
  const ownSite=await call('/api/v1/vehicles/V1',{session:site});record('Site Manager can retrieve own Site vehicle',ownSite.status===200,`HTTP ${ownSite.status}`);
  const internalDoc=await call('/api/v1/documents/DOC-TEST-INT-S1',{session:cust});record('Customer cannot retrieve Internal Only document',internalDoc.status===403,`HTTP ${internalDoc.status}`);
  const scopedDoc=await call('/api/v1/documents/DOC-TEST-SPEC-S1',{session:site});record('Specific Site/Role document scope works',scopedDoc.status===200,`HTTP ${scopedDoc.status}`);
  const consolidated=await call('/api/v1/invoices/INV-9101',{session:finance});record('Customer-wide Finance can retrieve consolidated invoice',consolidated.status===200,`HTTP ${consolidated.status}`);
  const noFinance=await call('/api/v1/invoices/INV-9101',{session:site});record('Site user without Finance cannot retrieve invoice',noFinance.status===403,`HTTP ${noFinance.status}`);
  const roMutation=await call('/api/v1/portal/requests',{method:'POST',session:readonly,body:{vehicle:'V1',requestType:'Other',description:'Read only mutation attempt'}});record('Read Only cannot mutate operational data',roMutation.status===403,`HTTP ${roMutation.status}`);
  const techBilling=await call('/api/v1/billing/work-orders/WO-S6-ACCEPT/transition',{method:'POST',session:tech,body:{version:opAfterTech.data.version,status:'Billing Review'}});record('Technician cannot access Billing administration',techBilling.status===403,`HTTP ${techBilling.status}`);

  // Revoked/inactive-session proof on the dedicated read-only fixture user.
  await query("UPDATE users SET active=false WHERE email='readonly@testtransport.test'");
  const revoked=await call('/api/v1/auth/me',{session:readonly});
  await query("UPDATE users SET active=true WHERE email='readonly@testtransport.test'");
  record('Inactive user cannot continue existing session',revoked.status===401,`HTTP ${revoked.status}`);

  // Genuine offline idempotency and conflict contract.
  const syncWo=await call('/api/v1/work-orders/WO-S6-ACCEPT',{session:tech});
  const syncAtt=syncWo.data.attendances.find(x=>x.legacy_ref==='ATT-S6-SYNC');
  assert(syncAtt,'Sync acceptance Attendance missing');
  const syncEvent={eventId:'S6-SYNC-IDEMPOTENT',deviceId:'S6-DEVICE',eventType:'attendance.status',workOrder:'WO-S6-ACCEPT',attendance:'ATT-S6-SYNC',baseVersion:Number(syncAtt.version),eventTime:new Date().toISOString(),deviceCaptureTime:new Date().toISOString(),payload:{status:'Accepted'}};
  const sync1=await call('/api/v1/sync/events',{method:'POST',session:tech,body:syncEvent});
  const sync2=await call('/api/v1/sync/events',{method:'POST',session:tech,body:syncEvent});
  record('Offline duplicate event is not applied twice',sync1.status===200&&sync1.data.status==='Accepted'&&sync2.status===200&&sync2.data.idempotentReplay===true,`first=${sync1.data?.status}, replay=${sync2.data?.idempotentReplay}`);
  const conflictEvent={...syncEvent,eventId:'S6-SYNC-CONFLICT',baseVersion:Number(syncAtt.version),payload:{status:'On Site'}};
  const conflict=await call('/api/v1/sync/events',{method:'POST',session:tech,body:conflictEvent});
  const conflictList=await call('/api/v1/sync/conflicts',{session:ops});
  record('Offline version conflict returns Conflict rather than overwrite',conflict.status===200&&conflict.data.status==='Conflict'&&conflictList.status===200&&conflictList.data.items.some(x=>x.event_id==='S6-SYNC-CONFLICT'),`status=${conflict.data?.status}`);

  const migrations=await query('SELECT version FROM schema_migrations ORDER BY version');
  const counts=await query(`SELECT jsonb_build_object('customers',(SELECT count(*) FROM customers),'sites',(SELECT count(*) FROM sites),'vehicles',(SELECT count(*) FROM vehicles),'workOrders',(SELECT count(*) FROM work_orders),'users',(SELECT count(*) FROM users),'dcrItems',(SELECT count(*) FROM dcr_items)) AS counts`);
  record('Relational seed data exists',Number(counts.rows[0].counts.customers)>=2&&Number(counts.rows[0].counts.workOrders)>=1,JSON.stringify(counts.rows[0].counts));

  const summary={passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,total:results.length,persistenceSentinelPreExisted:fixture.persisted,migrations:migrations.rows.map(x=>x.version),results,at:new Date().toISOString()};
  await query(`INSERT INTO system_meta(key,value,updated_at) VALUES('stage6_acceptance_last',$1::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify(summary)]);
  console.log(JSON.stringify({level:'info',event:'stage6_live_acceptance_complete',...summary}));
  return summary;
}

module.exports={runLiveAcceptance};
