/* Stage 4 retest — true device/offline state separation simulation. */
window.K4=window.K4||{};
K4.serverKey='koonerv1';
K4.deviceKey='kooner_mobile_device_state_v2';
K4.clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
K4.sig=function(x){let s=JSON.stringify(x||null),h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)};
K4.readServer=()=>JSON.parse(localStorage.getItem(K4.serverKey)||'null')||K4.clone(S);
K4.writeServer=state=>localStorage.setItem(K4.serverKey,JSON.stringify(state));
K4.readDevice=()=>JSON.parse(localStorage.getItem(K4.deviceKey)||'null');
K4.writeDevice=state=>localStorage.setItem(K4.deviceKey,JSON.stringify(state));
K4.pack=function(state,wid){if(!wid)return null;let w=(state.wos||[]).find(x=>x.id===wid);if(!w)return null;let v=(state.vehicles||[]).find(x=>x.id===w.v);return{workOrder:K4.clone(w),vehicle:K4.clone(v)}};
K4.replaceEntityPack=function(state,pack){if(!pack||!pack.workOrder)return;let wi=(state.wos||[]).findIndex(x=>x.id===pack.workOrder.id);if(wi>=0)state.wos[wi]=K4.clone(pack.workOrder);else state.wos.push(K4.clone(pack.workOrder));if(pack.vehicle){let vi=(state.vehicles||[]).findIndex(x=>x.id===pack.vehicle.id);if(vi>=0)state.vehicles[vi]=K4.clone(pack.vehicle);else state.vehicles.push(K4.clone(pack.vehicle))}};
K4.summaryPack=function(pack){if(!pack||!pack.workOrder)return'No Work Order snapshot';let w=pack.workOrder,a=(w.att||[]).find(x=>x.id===window.mobileJob?.aid),tasks=(w.tasks||[]).map(t=>`${t.desc}: ${t.status}`).join('; ');return `${w.id} • WO ${w.status} • Attendance ${a?.status||'—'} • ${tasks||'No Tasks'}`};

(function restoreDeviceSession(){let d=K4.readDevice();if(d&&d.mobileOfflineMeta?.active){S=d;K4.offlineSession=true}else K4.offlineSession=false})();

window.persist=function(){if(K4.offlineSession||S.mobileOfflineMeta?.active)K4.writeDevice(S);else K4.writeServer(S)};
window.queueSync=function(type,payload,at){
 S.mobileSyncQueue=S.mobileSyncQueue||[];let eventAt=at||K4.iso(),id='DEV-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),online=S.mobileDevice?.online!==false;
 if(K4.offlineSession||S.mobileOfflineMeta?.active){
  S.mobileOfflineMeta=S.mobileOfflineMeta||{active:true,lastExpected:{}};let wid=payload?.wo||null,server=K4.readServer(),expected=null,snapshot=null;
  if(wid){expected=S.mobileOfflineMeta.lastExpected[wid]||K4.sig(K4.pack(server,wid));snapshot=K4.pack(S,wid);S.mobileOfflineMeta.lastExpected[wid]=K4.sig(snapshot)}
  S.mobileSyncQueue.push({id,device:S.mobileDevice?.id||'KOONER-MOBILE-TEST-01',tech:selectedTechId(),type,payload:K4.clone(payload||{}),eventTime:eventAt,deviceCaptureTime:new Date().toISOString(),serverSyncTime:null,status:'Pending Sync',expectedServerSignature:expected,deviceSnapshot:snapshot,applied:false});
  K4.writeDevice(S);return;
 }
 S.mobileSyncQueue.push({id,device:S.mobileDevice?.id||'KOONER-MOBILE-TEST-01',tech:selectedTechId(),type,payload:K4.clone(payload||{}),eventTime:eventAt,deviceCaptureTime:new Date().toISOString(),serverSyncTime:new Date().toISOString(),status:online?'Synced':'Pending Sync',applied:online});
 K4.writeServer(S);
};

K4.enterOffline=function(){let server=K4.readServer(),device=K4.clone(server);device.mobileDevice=device.mobileDevice||{id:'KOONER-MOBILE-TEST-01'};device.mobileDevice.online=false;device.mobileOfflineMeta={active:true,startedAt:new Date().toISOString(),lastExpected:{}};S=device;K4.offlineSession=true;K4.writeDevice(S)};
K4.finishOfflineSession=function(server){S=K4.clone(server);S.mobileDevice=S.mobileDevice||{};S.mobileDevice.online=true;delete S.mobileOfflineMeta;K4.offlineSession=false;localStorage.removeItem(K4.deviceKey);K4.writeServer(S)};

window.toggleOnline=function(){
 if(!K4.offlineSession&&!S.mobileOfflineMeta?.active){K4.enterOffline();updateNetworkButton();if(window.mobileView==='sync')renderSync();else if(window.mobileView==='home')renderHome();return}
 S.mobileDevice=S.mobileDevice||{};S.mobileDevice.online=S.mobileDevice.online===false;K4.writeDevice(S);updateNetworkButton();if(window.mobileView==='sync')renderSync();else if(window.mobileView==='home')renderHome();
};
window.updateNetworkButton=function(){let b=M('netBtn'),online=S.mobileDevice?.online!==false;b.textContent=online?(K4.offlineSession?'Online • Sync Required':'Online'):'Offline';b.classList.toggle('offline',!online)};

K4.serverEventCopy=function(e){return{id:e.id,device:e.device,tech:e.tech,type:e.type,payload:K4.clone(e.payload),eventTime:e.eventTime,deviceCaptureTime:e.deviceCaptureTime,serverSyncTime:e.serverSyncTime,status:e.status,applied:e.applied}};
window.syncAll=function(){
 if(S.mobileDevice?.online===false)return alert('Go Online before syncing.');
 let server=K4.readServer();server.mobileAppliedEventIds=server.mobileAppliedEventIds||[];server.mobileSyncQueue=server.mobileSyncQueue||[];let done=0,conflicts=0;
 let rows=(S.mobileSyncQueue||[]).filter(x=>x.status==='Pending Sync').sort((a,b)=>String(a.deviceCaptureTime).localeCompare(String(b.deviceCaptureTime)));
 rows.forEach(e=>{
  if(server.mobileAppliedEventIds.includes(e.id)){e.status='Synced';e.applied=true;e.serverSyncTime=e.serverSyncTime||new Date().toISOString();done++;return}
  let wid=e.payload?.wo||null;
  if(wid&&e.deviceSnapshot){let current=K4.pack(server,wid),sig=K4.sig(current);if(e.expectedServerSignature&&sig!==e.expectedServerSignature){e.status='Conflict';e.conflictDetectedAt=new Date().toISOString();e.serverValueSummary=K4.summaryPack(current);e.deviceValueSummary=K4.summaryPack(e.deviceSnapshot);conflicts++;return}K4.replaceEntityPack(server,e.deviceSnapshot)}
  e.status='Synced';e.applied=true;e.serverSyncTime=new Date().toISOString();server.mobileAppliedEventIds.push(e.id);server.mobileSyncQueue.push(K4.serverEventCopy(e));done++;
 });
 K4.writeServer(server);K4.writeDevice(S);
 let unresolved=(S.mobileSyncQueue||[]).some(x=>['Pending Sync','Failed','Conflict','Operations Review'].includes(x.status));
 if(!unresolved)K4.finishOfflineSession(server);
 if(window.mobileView==='sync')renderSync();else renderHome();
 alert(`${done} event(s) synchronised.${conflicts?' '+conflicts+' conflict(s) require review.':''}`);
};
window.simulateSyncState=function(id,status){let e=(S.mobileSyncQueue||[]).find(x=>x.id===id);if(!e)return;e.status=status;e.serverSyncTime=null;if(status==='Conflict'){let server=K4.readServer(),pack=K4.pack(server,e.payload?.wo);e.serverValueSummary=K4.summaryPack(pack);e.deviceValueSummary=K4.summaryPack(e.deviceSnapshot)}K4.writeDevice(S);renderSync()};

window.reviewConflict=function(id){let e=(S.mobileSyncQueue||[]).find(x=>x.id===id);if(!e)return;let server=K4.readServer(),serverPack=K4.pack(server,e.payload?.wo),devicePack=e.deviceSnapshot||K4.pack(S,e.payload?.wo);showSheet(`<h3>Review Sync Conflict</h3><div class=notice bad><b>Server-authoritative value</b><br>${K4.summaryPack(serverPack)}</div><div class=notice><b>Device value</b><br>${K4.summaryPack(devicePack)}</div><div class=field><label>Conflict action</label><div class=twobtn><button class=btn onclick="retryConflict('${id}')">Retry</button><button class=btn onclick="discardDeviceChange('${id}')">Discard Device Change</button></div><button class="btn warn" onclick="sendConflictToOperations('${id}')">Operations Review</button></div><div class=notice>Conflict resolution never silently overwrites the server record.</div><div class=actions><button class=btn onclick=hideSheet()>Close</button></div>`)};
window.retryConflict=function(id){let e=(S.mobileSyncQueue||[]).find(x=>x.id===id);if(!e)return;e.status='Pending Sync';e.serverSyncTime=null;delete e.conflictDetectedAt;K4.writeDevice(S);hideSheet();renderSync()};
window.discardDeviceChange=function(id){let e=(S.mobileSyncQueue||[]).find(x=>x.id===id);if(!e)return;let server=K4.readServer(),wid=e.payload?.wo;if(wid){let pack=K4.pack(server,wid);K4.replaceEntityPack(S,pack);(S.mobileSyncQueue||[]).filter(x=>x.id!==id&&x.payload?.wo===wid&&x.status==='Pending Sync').forEach(x=>{x.status='Conflict';x.serverValueSummary='Server was rebased after an earlier device change was discarded.';x.deviceValueSummary=K4.summaryPack(x.deviceSnapshot)})}e.status='Discarded';e.resolution='Device change discarded in favour of current server value';e.serverSyncTime=null;K4.writeDevice(S);hideSheet();renderSync()};
window.sendConflictToOperations=function(id){let e=(S.mobileSyncQueue||[]).find(x=>x.id===id);if(!e)return;let server=K4.readServer(),wid=e.payload?.wo;server.mobileConflictReviews=server.mobileConflictReviews||[];server.mobileConflictReviews.push({id:'CR-'+Date.now(),eventId:e.id,workOrder:wid,technician:selectedTech().name,createdAt:new Date().toISOString(),serverValue:e.serverValueSummary||'',deviceValue:e.deviceValueSummary||'',status:'Operations Review'});if(wid){let sw=(server.wos||[]).find(x=>x.id===wid);if(sw){sw.audit=sw.audit||[];sw.audit.push([new Date().toISOString(),selectedTech().name,'Mobile sync conflict referred to Operations',e.id])}}K4.writeServer(server);e.status='Operations Review';e.resolution='Awaiting Operations review';K4.writeDevice(S);hideSheet();renderSync()};

window.renderSync=function(){let t=selectedTech(),rows=(S.mobileSyncQueue||[]).filter(x=>x.tech===t.id).slice().reverse();M('mobileContent').innerHTML=`<h2>Sync Centre</h2><div class=sub>Offline Device State → Pending Sync Event → Server Accept / Failed / Conflict.</div><div class=card><div class=row><div><b>Device</b><br><small>${S.mobileDevice?.id||'Test device'}</small></div>${stat(S.mobileDevice?.online===false?'Offline':'Online')}</div><div class=notice>${K4.offlineSession?'Device session is separate from authoritative Operations data until successful sync.':'Device and authoritative Operations state are aligned.'}</div><div class=twobtn><button class=btn onclick="toggleOnline()">${S.mobileDevice?.online===false?'Go Online':'Go Offline'}</button><button class="btn p" onclick="syncAll()">Sync Pending</button></div></div>${rows.map(x=>`<div class=card><div class=row><div><b>${x.type}</b><br><small>${x.id}</small></div>${stat(x.status)}</div><div class=kv><b>Event time</b><span>${fmtDT(x.eventTime)}</span></div><div class=kv><b>Device capture</b><span>${fmtDT(x.deviceCaptureTime)}</span></div><div class=kv><b>Server sync</b><span>${fmtDT(x.serverSyncTime)}</span></div>${x.status==='Pending Sync'?`<div class=twobtn><button class=btn onclick="simulateSyncState('${x.id}','Failed')">Simulate Failed</button><button class=btn onclick="simulateSyncState('${x.id}','Conflict')">Simulate Conflict</button></div>`:''}${x.status==='Failed'?'<div class="notice bad">Failed: authoritative Operations data has not been changed.</div>':''}${x.status==='Conflict'?`<div class="notice bad">Conflict: server data has not been overwritten.</div><button class="btn p" onclick="reviewConflict('${x.id}')">Review Conflict</button>`:''}${x.status==='Operations Review'?'<div class=notice>Referred to Operations. Device change remains unapplied.</div>':''}</div>`).join('')||'<div class=card>No mobile events yet.</div>'}`};

updateNetworkButton();
