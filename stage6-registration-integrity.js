/* DCR-122 — Technician vehicle registration verification integrity. */
(function(){
 if(!window.KoonerStage6?.active||KoonerStage6.interfaceName!=='Technician Mobile'||!KoonerStage6.user?.roles?.includes('technician'))return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
})();
