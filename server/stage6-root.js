'use strict';
const express=require('express');
const state=require('./state');
const {query}=require('./db');

// Enrich the compatibility bootstrap with opaque server record versions.
// These values support optimistic concurrency/offline sync and are not business data.
const originalBuild=state.buildLegacyState;
state.buildLegacyState=async function stage6VersionedBuild(user){
 const payload=await originalBuild(user),s=payload.legacyState||{};
 for(const v of (s.vehicles||[])){const r=await query('SELECT version FROM vehicles WHERE legacy_ref=$1',[v.id]);if(r.rowCount)v._recordVersion=Number(r.rows[0].version)}
 for(const w of (s.wos||[])){
  const wr=await query('SELECT id,version FROM work_orders WHERE legacy_ref=$1',[w.id]);if(!wr.rowCount)continue;w._recordVersion=Number(wr.rows[0].version);
  for(const a of (w.att||[])){const ar=await query('SELECT version FROM attendances WHERE legacy_ref=$1 AND work_order_id=$2',[a.id,wr.rows[0].id]);if(ar.rowCount)a._recordVersion=Number(ar.rows[0].version)}
  for(const t of (w.tasks||[])){const tr=await query('SELECT version FROM tasks WHERE legacy_ref=$1 AND work_order_id=$2',[t.id,wr.rows[0].id]);if(tr.rowCount)t._recordVersion=Number(tr.rows[0].version)}
 }
 if(user.user_type==='internal'&&!user.roles.includes('technician')){
  const cr=await query(`SELECT c.id,c.status,c.resolution,c.created_at,se.event_id,se.device_id,se.event_type,se.event_timestamp,se.device_capture_timestamp,se.sync_status,se.server_value,se.device_value,u.display_name technician,w.legacy_ref work_order_ref FROM conflicts c JOIN sync_events se ON se.id=c.sync_event_id LEFT JOIN users u ON u.id=se.user_id LEFT JOIN work_orders w ON w.id=se.work_order_id ORDER BY c.created_at DESC LIMIT 100`);
  s.mobileConflictReviews=cr.rows.map(x=>({id:String(x.id),eventId:x.event_id,device:x.device_id,technician:x.technician||'Technician',workOrder:x.work_order_ref,eventType:x.event_type,eventTime:x.event_timestamp,deviceTime:x.device_capture_timestamp,failureStatus:x.sync_status,status:x.status==='Open'?'Operations Review':`Resolved - ${x.status}`,serverValue:JSON.stringify(x.server_value||{}),deviceValue:JSON.stringify(x.device_value||{}),resolutionReason:x.resolution||'',createdAt:x.created_at,stage6ServerConflict:true}));
 }
 return payload;
};

const app=express();
app.use('/api/v1/sync',require('./stage6-sync-security-router'));
app.use('/api/v1/sync',require('./stage6-sync-router'));
app.use(require('./stage6-search-router'));
app.use(require('./stage6-import-router'));
app.use(require('./stage6-gateway'));
module.exports=app;
