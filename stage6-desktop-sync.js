/* Stage 6 Operations/Desktop: server-backed conflict, labour review and vehicle site-move controls. */
(function(){
 if(!window.KoonerStage6?.active||KoonerStage6.user?.type!=='internal')return;
 const headers=()=>({'Content-Type':'application/json','X-CSRF-Token':KoonerStage6.csrfToken,'X-Kooner-Interface':'Operations/Desktop'});

 const oldOpen=window.openMobileSyncReview,oldResolve=window.resolveMobileSyncReview;
 window.openMobileSyncReview=function(id){
  const r=(S.mobileConflictReviews||[]).find(x=>x.id===id);if(!r)return;
  if(!r.stage6ServerConflict)return typeof oldOpen==='function'?oldOpen(id):undefined;
  show(`<h3>Mobile Sync / Conflict Review</h3><div class=notice><b>Stage 6 server conflict</b><br>This record is held in PostgreSQL. No device value has been applied automatically.</div><div class=summary><div class=sum><small>Event ID</small>${r.eventId}</div><div class=sum><small>Technician</small>${r.technician}</div><div class=sum><small>Work Order</small>${r.workOrder||'—'}</div><div class=sum><small>Event type</small>${r.eventType||'Mobile Offline Event'}</div><div class=sum><small>Device/Event time</small>${r.deviceTime?K3.dt(r.deviceTime):'—'}</div><div class=sum><small>Status</small>${r.status}</div></div><div class="grid two"><div class=notice><b>Server value</b><br><small>${K5?.safe?K5.safe(r.serverValue||'—'):(r.serverValue||'—')}</small></div><div class=notice><b>Device value</b><br><small>${K5?.safe?K5.safe(r.deviceValue||'—'):(r.deviceValue||'—')}</small></div></div>${r.status==='Operations Review'?`<div class=form><div class="f full"><label>Resolution reason *</label><textarea id=stage6SyncReason></textarea></div></div><div class=actions><button class=btn onclick=hide()>Close</button><button class=btn onclick="resolveStage6Sync('${id}','Keep Server')">Keep Server / Discard Device</button><button class="btn p" onclick="resolveStage6Sync('${id}','Apply Device Change After Review')">Apply Device After Review</button></div>`:`<div class="notice good"><b>${r.status}</b><br>${r.resolutionReason||''}</div><div class=actions><button class=btn onclick=hide()>Close</button></div>`}`)
 };
 window.resolveStage6Sync=async function(id,decision){const reason=document.getElementById('stage6SyncReason')?.value.trim();if(!reason)return alert('Resolution reason is required.');try{const res=await fetch(`/api/v1/sync/conflicts/${encodeURIComponent(id)}/resolve-v2`,{method:'POST',credentials:'same-origin',headers:headers(),body:JSON.stringify({decision,reason})});const x=await res.json().catch(()=>({}));if(!res.ok)throw new Error(x.message||`Server returned ${res.status}`);hide();alert(`Sync conflict resolved: ${decision}. The decision and reason were written to server audit.`);location.reload()}catch(e){alert(e.message)}};
 window.resolveMobileSyncReview=function(id,action){const r=(S.mobileConflictReviews||[]).find(x=>x.id===id);if(r?.stage6ServerConflict)return resolveStage6Sync(id,action==='Apply Device Change'?'Apply Device Change After Review':'Keep Server');return typeof oldResolve==='function'?oldResolve(id,action):undefined};

 // Stage 4 commercial labour review now writes to the relational review record rather than browser state.
 const oldLabourModal=window.labourReviewModal;
 if(typeof oldLabourModal==='function')window.labourReviewModal=function(wid,lid){oldLabourModal(wid,lid);const r=document.getElementById('lrReviewer');if(r){r.value=KoonerStage6.user?.name||'Authenticated Billing User';r.disabled=true;r.title='Stage 6 reviewer is the authenticated user'}};
 window.saveLabourReview=async function(wid,lid){
  const w=W(wid),local=(w.labourReviews||[]).find(x=>x.id===lid);if(!local)return alert('Labour Review is no longer available. Refresh and try again.');
  const hours=Number(document.getElementById('lrApproved')?.value),mins=Math.round(hours*60),reason=document.getElementById('lrReason')?.value.trim()||'',changed=mins!==Math.round(Number(local.proposedBillableMinutes)||0);
  if(!Number.isFinite(hours)||hours<0)return alert('Approved Billable Time must be zero or greater.');if((changed||local.chargeabilityReviewRequired)&&!reason)return alert('Enter an override/review reason.');
  try{
   const list=await fetch(`/api/v1/billing/labour-reviews?workOrder=${encodeURIComponent(wid)}`,{credentials:'same-origin'}),lj=await list.json().catch(()=>({}));if(!list.ok)throw new Error(lj.message||`Server returned ${list.status}`);const server=(lj.items||[]).find(x=>x.id===lid);if(!server)throw new Error('The server Labour Review no longer exists. Refresh and try again.');
   const res=await fetch(`/api/v1/billing/labour-reviews/${encodeURIComponent(lid)}/decision`,{method:'POST',credentials:'same-origin',headers:headers(),body:JSON.stringify({version:server.version,approvedBillableMinutes:mins,reason})});const x=await res.json().catch(()=>({}));if(!res.ok)throw new Error(x.message||`Server returned ${res.status}`);
   hide();alert(`Labour treatment approved by ${x.reviewer}. The decision is stored in PostgreSQL and server audit.`);location.reload()
  }catch(e){alert(e.message)}
 };

 // Stage 3 effective-dated Home Site move now writes the exact chosen date/reason to relational history and audit.
 window.saveVehicleSiteMove=async function(id){
  const target=document.getElementById('mvsite')?.value,from=document.getElementById('mvfrom')?.value,reason=document.getElementById('mvreason')?.value.trim();if(!target||!from||!reason)return alert('New Site, Effective From and Reason are required.');
  try{const res=await fetch(`/api/v1/vehicles/${encodeURIComponent(id)}/move-site`,{method:'POST',credentials:'same-origin',headers:headers(),body:JSON.stringify({targetSite:target,effectiveFrom:from,reason})});const x=await res.json().catch(()=>({}));if(!res.ok)throw new Error(x.message||`Server returned ${res.status}`);hide();alert(`Home Site changed ${x.oldSite} → ${x.newSite}. Effective-dated history and audit have been saved.`);location.reload()}catch(e){alert(e.message)}
 };
})();
