/* DCR-116 / UAT-002 — Stage 6 Technician evidence media correction. */
(function(){
  if(!window.KoonerStage6?.active)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const when=e=>e.capturedAt||e.at||'';
  const file=e=>e.fileName||e.name||'Evidence photo';
  const stored=e=>String(e.storageStatus||'').startsWith('Stored');
  const url=e=>`/api/v1/evidence/${encodeURIComponent(e.id)}/content`;
  const formatDate=v=>{try{return typeof fmtDT==='function'?fmtDT(v):new Date(v).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}catch{return esc(v)}};

  window.woEvidence=function(w){
    const rows=(w.evidence||[]);
    if(!rows.length)return `<h3>Evidence</h3><div class="notice">No Technician evidence is linked to this Work Order.</div>`;
    return `<h3>Evidence</h3><div class="notice good"><b>Stage 6 evidence:</b> Technician photos remain linked to the Work Order / Attendance / Task and are loaded from the server.</div>${rows.map(e=>{
      const content=stored(e)?`<a href="${url(e)}" target="_blank" rel="noopener"><img src="${url(e)}" alt="${esc(e.type||'Evidence')}" style="max-width:260px;max-height:190px;border-radius:8px;border:1px solid #ddd;object-fit:cover;margin-top:8px"></a>`:`<div class="notice">Metadata only — no stored media file.</div>`;
      return `<div class="att"><b>${esc(e.type||'Evidence')}</b><br><small>${esc(file(e))} • ${formatDate(when(e))}</small><br><small>Attendance: ${esc(e.attendance||'—')} • Task: ${esc(e.task||'General Attendance')} • Captured by: ${esc(e.by||'Technician')}</small><br><small>Storage: ${esc(e.storageStatus||'Metadata Only')}</small>${content}</div>`
    }).join('')}`;
  };

  window.evidenceCard=function(w,a){
    const rows=(w.evidence||[]).filter(e=>e.attendance===a.id);
    return `<div class=card>${rows.map(e=>`<div class=sync><div><b>${esc(e.type||'Evidence')}</b><br><small>${esc(e.description||file(e))} • ${formatDate(when(e))} • ${esc(file(e))}</small>${stored(e)?`<br><a href="${url(e)}" target="_blank" rel="noopener"><img src="${url(e)}" alt="Evidence" style="max-width:180px;max-height:130px;border-radius:8px;margin-top:6px;object-fit:cover"></a>`:''}</div>${typeof stat==='function'?stat(stored(e)?'Synced':(e.syncStatus||'Metadata Only')):''}</div>`).join('')||'<div class=muted>No evidence captured for this Attendance.</div>'}<button class=btn onclick="evidenceModal('${esc(w.id)}','${esc(a.id)}')">+ Add Evidence / Photo</button></div>`;
  };

  window.evidenceModal=function(wid,aid){
    const w=W(wid);
    showSheet(`<h3>Add Evidence</h3><div class=notice><b>Stage 6:</b> the actual photo is stored for UAT and remains linked to this Work Order / Attendance / Task. Production object storage remains a later production dependency.</div><div class=field><label>Evidence type *</label><select id=evType>${['Registration','Fault / defect','Component before repair','Component after repair','Damage','Meter / diagnostic reading','Parts fitted','Completion','Customer-specific evidence'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class=field><label>Related Task</label><select id=evTask><option value="">Attendance / general</option>${(w.tasks||[]).map(t=>`<option value="${esc(t.id)}">${esc(t.desc)}</option>`).join('')}</select></div><div class=field><label>Photo *</label><input id=evFile type=file accept="image/jpeg,image/png,image/webp" capture="environment"></div><div class=field><label>Description</label><textarea id=evDesc></textarea></div><div class=actions><button class=btn onclick=hideSheet()>Cancel</button><button class="btn p" id=evSaveBtn onclick="saveEvidence('${esc(wid)}','${esc(aid)}')">Save Evidence</button></div>`)
  };

  function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read the photo'));r.readAsDataURL(file)})}
  function loadImage(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Could not process the photo'));i.src=src})}
  function sizeOfDataUrl(dataUrl){const b=String(dataUrl).split(',')[1]||'';return Math.floor(b.length*3/4)}
  async function compressPhoto(file){
    const src=await readFile(file),img=await loadImage(src);let max=1280,quality=.78,out='';
    for(let attempt=0;attempt<5;attempt++){
      const scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
      const c=document.createElement('canvas');c.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));c.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);out=c.toDataURL('image/jpeg',quality);
      if(sizeOfDataUrl(out)<=1450000)return{dataUrl:out,mimeType:'image/jpeg',sizeBytes:sizeOfDataUrl(out)};
      quality=Math.max(.42,quality-.1);max=Math.round(max*.86);
    }
    throw new Error('Photo is still too large after compression. Please retake at a lower resolution.')
  }

  window.saveEvidence=async function(wid,aid){
    const input=document.getElementById('evFile'),f=input?.files?.[0];if(!f)return alert('A photo is required for this evidence item.');
    if(S.mobileDevice?.online===false)return alert('Photo upload requires an online connection in this Stage 6 UAT build. Return Online, then save the evidence.');
    const b=document.getElementById('evSaveBtn');if(b){b.disabled=true;b.textContent='Saving photo…'}
    try{
      const compressed=await compressPhoto(f),evidenceRef='EV-S6-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
      const r=await fetch('/api/v1/evidence/media',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':window.KoonerStage6.csrfToken,'X-Kooner-Interface':'Technician Mobile','Idempotency-Key':evidenceRef},body:JSON.stringify({evidenceRef,workOrder:wid,attendance:aid,task:document.getElementById('evTask').value||null,type:document.getElementById('evType').value,description:document.getElementById('evDesc').value.trim(),filename:f.name||'technician-photo.jpg',mimeType:compressed.mimeType,dataUrl:compressed.dataUrl,visibility:'Internal Kooner Only'})});
      const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.message||'Evidence upload failed');
      hideSheet();alert('Evidence saved to the Stage 6 server. The job will refresh so the stored photo can be reloaded.');location.reload();
    }catch(err){if(b){b.disabled=false;b.textContent='Save Evidence'}alert(err.message||'Evidence upload failed')}
  };
})();
