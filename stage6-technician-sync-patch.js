/* Stage 6 sync referral completion: retain the unapplied device snapshot for controlled Operations review. */
(function(){
 if(!window.KoonerStage6?.active||!KoonerStage6.user?.roles?.includes('technician'))return;
 window.saveSyncReferral=async function(id){
  const e=(S.mobileSyncQueue||[]).find(x=>x.id===id),reason=M('syncReferralReason').value.trim();if(!e)return;if(!reason)return alert('Reason is required.');
  try{
   const r=await fetch(`/api/v1/sync/mobile-events/${encodeURIComponent(id)}/refer`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':KoonerStage6.csrfToken,'X-Kooner-Interface':'Technician Mobile'},body:JSON.stringify({reason,deviceSnapshot:e.deviceSnapshot||null})});
   const x=await r.json().catch(()=>({}));if(!r.ok)throw new Error(x.message||`Server returned ${r.status}`);
   e.status='Operations Review';e.conflictId=x.conflictId||e.conflictId;e.referralReason=reason;e.resolution='Awaiting Operations review';K4.writeDevice(S);hideSheet();renderSync();
  }catch(err){alert(err.message)}
 };
})();
