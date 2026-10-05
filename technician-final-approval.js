/* Stage 4 final approval — failed/conflict sync resolution. */
window.K4=window.K4||{};
K4.unresolvedSyncStatuses=['Pending Sync','Failed','Conflict','Operations Review'];
K4.tryFinishDeviceSession=function(){
  if(!K4.offlineSession||S.mobileDevice?.online===false)return false;
  const unresolved=(S.mobileSyncQueue||[]).some(x=>K4.unresolvedSyncStatuses.includes(x.status));
  if(!unresolved){K4.finishOfflineSession(K4.readServer());updateNetworkButton();return true}
  return false;
};
K4.referralRecord=function(e,reason){
  const server=K4.readServer(),wid=e.payload?.wo||null,serverPack=wid?K4.pack(server,wid):null,devicePack=e.deviceSnapshot||(wid?K4.pack(S,wid):null);
  server.mobileConflictReviews=server.mobileConflictReviews||[];
  let existing=server.mobileConflictReviews.find(r=>r.eventId===e.id&&r.status==='Operations Review');
  if(!existing){
    existing={id:'MSR-'+Date.now(),eventId:e.id,technician:selectedTech().name,technicianId:selectedTechId(),workOrder:wid,eventType:e.type,eventTime:e.eventTime,deviceTime:e.deviceCaptureTime,serverValue:K4.summaryPack(serverPack),deviceValue:K4.summaryPack(devicePack),failureStatus:e.status,reason,status:'Operations Review',createdAt:new Date().toISOString(),deviceSnapshot:K4.clone(devicePack),serverSnapshot:K4.clone(serverPack),history:[]};
    server.mobileConflictReviews.push(existing);
  }else{existing.reason=reason;existing.failureStatus=e.status}
  existing.history.push({at:new Date().toISOString(),by:selectedTech().name,action:'Referred to Operations',reason});
  if(wid){const sw=(server.wos||[]).find(x=>x.id===wid);if(sw){sw.audit=sw.audit||[];sw.audit.push([new Date().toISOString(),selectedTech().name,'Mobile sync event referred to Operations',`${e.id} • ${e.type} • ${reason}`])}}
  K4.writeServer(server);
  e.status='Operations Review';e.resolution='Awaiting Operations review';e.referralReason=reason;K4.writeDevice(S);
};
window.syncReferralModal=function(id){
  const e=(S.mobileSyncQueue||[]).find(x=>x.id===id);if(!e)return;
  if(S.mobileDevice?.online===false)return alert('Go Online before referring a failed/conflict event to Operations.');
  showSheet(`<h3>Refer Sync Item to Operations</h3><div class=notice><b>${e.type}</b><br>${e.id} • ${e.status}</div><div class=field><label>Reason / context *</label><textarea id=syncReferralReason placeholder="Explain why Operations review is required"></textarea></div><div class=notice>Referral does not apply the device change to authoritative Operations data.</div><div class=actions><button class=btn onclick=hideSheet()>Cancel</button><button class="btn p" onclick="saveSyncReferral('${id}')">Refer to Operations</button></div>`)
};
window.saveSyncReferral=function(id){const e=(S.mobileSyncQueue||[]).find(x=>x.id===id),reason=M('syncReferralReason').value.trim();if(!e)return;if(!reason)return alert('Reason is required.');K4.referralRecord(e,reason);hideSheet();renderSync()};
window.retryFailedSync=function(id){const e=(S.mobileSyncQueue||[]).find(x=>x.id===id);if(!e)return;e.status='Pending Sync';e.serverSyncTime=null;delete e.resolution;K4.writeDevice(S);renderSync()};
const _discardDeviceChange=window.discardDeviceChange;
window.discardDeviceChange=function(id){if(typeof _discardDeviceChange==='function')_discardDeviceChange(id);K4.tryFinishDeviceSession()};
window.reviewConflict=function(id){
  const e=(S.mobileSyncQueue||[]).find(x=>x.id===id);if(!e)return;
  const server=K4.readServer(),serverPack=K4.pack(server,e.payload?.wo),devicePack=e.deviceSnapshot||K4.pack(S,e.payload?.wo);
  showSheet(`<h3>Review Sync Conflict</h3><div class="notice bad"><b>Server-authoritative value</b><br>${K4.summaryPack(serverPack)}</div><div class=notice><b>Device value</b><br>${K4.summaryPack(devicePack)}</div><div class=twobtn><button class=btn onclick="retryConflict('${id}')">Retry</button><button class=btn onclick="discardDeviceChange('${id}')">Discard Device Change</button></div><button class="btn warn" onclick="syncReferralModal('${id}')">Operations Review</button><div class=notice>Conflict resolution never silently overwrites the server record.</div><div class=actions><button class=btn onclick=hideSheet()>Close</button></div>`)
};
K4.pullOperationsResolutions=function(){
  if(!K4.offlineSession)return 0;
  const server=K4.readServer(),reviews=server.mobileConflictReviews||[];let resolved=0;
  (S.mobileSyncQueue||[]).forEach(e=>{
    if(e.status!=='Operations Review')return;
    const r=reviews.find(x=>x.eventId===e.id&&String(x.status).startsWith('Resolved'));
    if(!r)return;
    if(r.resolutionAction==='Apply Device Change'){e.status='Synced';e.applied=true;e.serverSyncTime=r.resolvedAt||new Date().toISOString();e.resolution='Applied by Operations review'}
    else{e.status='Discarded';e.applied=false;e.serverSyncTime=null;e.resolution='Operations retained server value';if(e.payload?.wo)K4.replaceEntityPack(S,K4.pack(server,e.payload.wo))}
    resolved++;
  });
  if(resolved)K4.writeDevice(S);
  return resolved;
};
const _syncAllFinalBase=window.syncAll;
window.syncAll=function(){
  if(S.mobileDevice?.online===false)return alert('Go Online before syncing.');
  const resolved=K4.pullOperationsResolutions();
  _syncAllFinalBase();
  if(resolved)K4.tryFinishDeviceSession();
};
window.renderSync=function(){
  const t=selectedTech(),rows=(S.mobileSyncQueue||[]).filter(x=>x.tech===t.id).slice().reverse();
  M('mobileContent').innerHTML=`<h2>Sync Centre</h2><div class=sub>Offline Device State → Pending Sync Event → Server Accept / Failed / Conflict.</div><div class=card><div class=row><div><b>Device</b><br><small>${S.mobileDevice?.id||'Test device'}</small></div>${stat(S.mobileDevice?.online===false?'Offline':'Online')}</div><div class=notice>${K4.offlineSession?'Device session is separate from authoritative Operations data until successful sync.':'Device and authoritative Operations state are aligned.'}</div><div class=twobtn><button class=btn onclick="toggleOnline()">${S.mobileDevice?.online===false?'Go Online':'Go Offline'}</button><button class="btn p" onclick="syncAll()">Sync Pending</button></div></div>${rows.map(x=>`<div class=card><div class=row><div><b>${x.type}</b><br><small>${x.id}</small></div>${stat(x.status)}</div><div class=kv><b>Event time</b><span>${fmtDT(x.eventTime)}</span></div><div class=kv><b>Device capture</b><span>${fmtDT(x.deviceCaptureTime)}</span></div><div class=kv><b>Server sync</b><span>${fmtDT(x.serverSyncTime)}</span></div>${x.status==='Pending Sync'?`<div class=twobtn><button class=btn onclick="simulateSyncState('${x.id}','Failed')">Simulate Failed</button><button class=btn onclick="simulateSyncState('${x.id}','Conflict')">Simulate Conflict</button></div>`:''}${x.status==='Failed'?`<div class="notice bad">Failed: authoritative Operations data has not been changed.</div><div class=twobtn><button class=btn onclick="retryFailedSync('${x.id}')">Retry</button><button class=btn onclick="discardDeviceChange('${x.id}')">Discard Device Change</button></div><button class="btn warn" onclick="syncReferralModal('${x.id}')">Refer to Operations</button>`:''}${x.status==='Conflict'?`<div class="notice bad">Conflict: server data has not been overwritten.</div><button class="btn p" onclick="reviewConflict('${x.id}')">Review Conflict</button>`:''}${x.status==='Operations Review'?'<div class=notice>Referred to Operations. Device change remains unapplied. Use Sync Pending after Operations has resolved it.</div>':''}${x.status==='Discarded'?'<div class=notice>Device change discarded. Authoritative server value retained.</div>':''}</div>`).join('')||'<div class=card>No mobile events yet.</div>'}`
};
