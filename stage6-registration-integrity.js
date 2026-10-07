/* DCR-122 — Technician vehicle registration verification integrity. */
(function(){
 if(!window.KoonerStage6?.active||KoonerStage6.interfaceName!=='Technician Mobile'||!KoonerStage6.user?.roles?.includes('technician'))return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const verified=a=>!!a?.vehicleConfirmation?.match&&a.vehicleConfirmation.verificationMethod==='Manual Physical Entry'&&a.vehicleConfirmation.integrityVersion==='DCR-122';

 // Deliberately do not display or pre-fill the authoritative Work Order registration here.
 // The Technician must read the physical vehicle and enter what they can actually see.
 window.vehicleConfirmModal=function(wid,aid){
  showSheet(`<h3>Confirm Registration</h3>
   <div class="notice"><b>Look at the vehicle and enter the registration you can see.</b></div>
   <div class="field"><label>Registration seen on vehicle *</label><input id="vcReg" value="" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" inputmode="text" style="text-transform:uppercase" placeholder="Enter registration"></div>
   <div class="field"><label>Mismatch reason / note</label><textarea id="vcNote" placeholder="Required only if the vehicle does not match the job"></textarea></div>
   <div class="actions"><button class="btn" onclick="hideSheet()">Cancel</button><button class="btn p" onclick="saveVehicleConfirm('${esc(wid)}','${esc(aid)}')">Confirm</button></div>`);
  setTimeout(()=>document.getElementById('vcReg')?.focus(),50);
 };

 // A pre-DCR-122 confirmation may have match=true because the old screen displayed and
 // pre-filled the expected registration. Keep that historical record, but do not let it move
 // the Technician past vehicle verification. Only a server-confirmed DCR-122 manual entry is
 // accepted as current journey proof.
 const baseRender=window.renderJob;
 window.renderJob=function(wid,aid){
  const out=baseRender.apply(this,arguments),w=W(wid),a=(w?.att||[]).find(x=>x.id===aid),root=M('mobileContent'),hero=root?.querySelector('.card.hero');
  if(!w?.id||!a||!hero||a.status!=='On Site'||verified(a))return out;
  M('guidedPrimary')?.remove();
  hero.insertAdjacentHTML('afterend',`<div id="guidedPrimary"><button class="btn p" style="width:100%;margin:10px 0 14px;font-size:20px;font-weight:800;padding:16px" onclick="guidedJourneyAction('${esc(wid)}','${esc(aid)}','registration')">CONFIRM REGISTRATION</button></div>`);
  return out
 };
 if(window.mobileJob?.wid&&window.mobileJob?.aid)renderJob(window.mobileJob.wid,window.mobileJob.aid);
})();
