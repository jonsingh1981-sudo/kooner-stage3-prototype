/* DCR-116 / UAT-002 — Stage 6 Technician evidence auto-save UX correction. */
(function(){
  if(!window.KoonerStage6?.active)return;
  const isTechnician=window.KoonerStage6.interfaceName==='Technician Mobile';
  const PENDING_KEY='kooner_stage6_pending_evidence_v1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const when=e=>e.capturedAt||e.at||'';
  const file=e=>e.fileName||e.name||'Evidence photo';
  const stored=e=>String(e.storageStatus||'').startsWith('Stored');
  const url=e=>`/api/v1/evidence/${encodeURIComponent(e.id)}/content`;
  const formatDate=v=>{try{return typeof fmtDT==='function'?fmtDT(v):new Date(v).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}catch{return esc(v)}};
  const normalTypes=['Registration','Fault / Defect','Before Repair','After Repair','Damage','Parts Fitted','Completion'];
  const statusByAttendance={};

  function pendingItems(){try{const x=JSON.parse(localStorage.getItem(PENDING_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
  function writePending(items){localStorage.setItem(PENDING_KEY,JSON.stringify(items))}
  function rememberPending(item){
    const rows=pendingItems().filter(x=>x.evidenceRef!==item.evidenceRef);rows.push(item);
    try{writePending(rows);return true}catch(e){
      try{writePending([item]);return true}catch{return false}
    }
  }
  function forgetPending(ref){try{writePending(pendingItems().filter(x=>x.evidenceRef!==ref))}catch{}}
  function setStatus(aid,text,kind='info'){statusByAttendance[aid]={text,kind,at:Date.now()}}
  function clearStatus(aid){delete statusByAttendance[aid]}
  function renderCurrent(wid,aid){try{if(window.mobileJob?.wid===wid&&window.mobileJob?.aid===aid&&typeof renderJob==='function')renderJob(wid,aid)}catch{}}
  function activeTaskFor(w,type){
    if(type==='Registration')return null;
    const tasks=(w.tasks||[]).filter(t=>!['Cancelled','Resolved by Override'].includes(t.status));
    const active=tasks.filter(t=>['In Progress','Not Started','Awaiting Parts','Awaiting Approval','Blocked'].includes(t.status));
    if(active.length===1)return active[0].id;
    const working=active.filter(t=>t.status==='In Progress');if(working.length===1)return working[0].id;
    if(tasks.length===1)return tasks[0].id;
    return null;
  }
  function addServerEvidenceToState(wid,out,meta){
    const w=W(wid);w.evidence=w.evidence||[];
    if(w.evidence.some(e=>e.id===out.evidenceRef))return;
    w.evidence.push({id:out.evidenceRef,attendance:out.attendance||meta.attendance,task:out.task||meta.task||null,type:out.evidenceType||meta.type,fileName:out.filename||meta.filename,name:out.filename||meta.filename,mimeType:out.mimeType,sizeBytes:out.sizeBytes,storageStatus:out.storageStatus,capturedAt:out.capturedAt||new Date().toISOString(),at:out.capturedAt||new Date().toISOString(),by:window.KoonerStage6.user?.name||'Technician',description:meta.description||'',source:'Technician Mobile',serverBacked:true});
  }

  window.woEvidence=function(w){
    const rows=(w.evidence||[]).filter(e=>stored(e));
    if(!rows.length)return `<h3>Evidence</h3><div class="notice">No active Technician evidence is linked to this Work Order.</div>`;
    return `<h3>Evidence</h3><div class="notice good"><b>Stage 6 evidence:</b> active Technician photos are loaded from the server and remain linked to the Work Order / Attendance / Task.</div>${rows.map(e=>{
      const content=`<a href="${url(e)}" target="_blank" rel="noopener"><img src="${url(e)}" alt="${esc(e.type||'Evidence')}" style="max-width:260px;max-height:190px;border-radius:8px;border:1px solid #ddd;object-fit:cover;margin-top:8px"></a>`;
      return `<div class="att"><b>${esc(e.type||'Evidence')}</b><br><small>${esc(file(e))} • ${formatDate(when(e))}</small><br><small>Attendance: ${esc(e.attendance||'—')} • Task: ${esc(e.task||'General Attendance')} • Captured by: ${esc(e.by||'Technician')}</small><br><small>Storage: ${esc(e.storageStatus)}</small>${content}</div>`
    }).join('')}`;
  };

  function savedThumb(e,wid,aid){
    return `<div style="position:relative;display:inline-block;width:142px;vertical-align:top;margin:0 8px 10px 0"><a href="${url(e)}" target="_blank" rel="noopener"><img src="${url(e)}" alt="${esc(e.type||'Evidence')}" style="width:142px;height:104px;border-radius:9px;border:1px solid #d8d8d8;object-fit:cover;display:block"></a><button type="button" aria-label="Remove photo" onclick="event.preventDefault();event.stopPropagation();confirmRemoveEvidence('${esc(wid)}','${esc(aid)}','${esc(e.id)}')" style="position:absolute;right:-6px;top:-6px;width:26px;height:26px;border-radius:50%;border:1px solid #bbb;background:#fff;color:#a40000;font-weight:800;line-height:22px;padding:0;box-shadow:0 1px 4px #999;cursor:pointer">×</button><div style="font-size:11px;margin-top:5px"><b>${esc(e.type||'Evidence')}</b><br>${esc(e.task||'General Attendance')}</div></div>`
  }
  function failedThumb(p){
    return `<div style="position:relative;display:inline-block;width:142px;vertical-align:top;margin:0 8px 10px 0"><img src="${p.dataUrl}" alt="Upload failed" style="width:142px;height:104px;border-radius:9px;border:2px solid #b91c1c;object-fit:cover;display:block;opacity:.8"><div style="font-size:11px;margin-top:5px;color:#991b1b"><b>Upload Failed</b><br>Not saved to server</div><button class="btn small" style="margin-top:5px" onclick="retryEvidence('${esc(p.evidenceRef)}')">Retry</button></div>`
  }

  window.evidenceCard=function(w,a){
    const rows=(w.evidence||[]).filter(e=>e.attendance===a.id&&stored(e));
    const pending=pendingItems().filter(p=>p.workOrder===w.id&&p.attendance===a.id);
    const st=statusByAttendance[a.id];
    const statusHtml=st?`<div class="notice ${st.kind==='bad'?'bad':st.kind==='good'?'good':''}"><b>${esc(st.text)}</b></div>`:'';
    const taskHint=activeTaskFor(w,'Before Repair');
    return `<div class=card>${statusHtml}${rows.length?`<div style="margin-bottom:8px">${rows.map(e=>savedThumb(e,w.id,a.id)).join('')}</div>`:'<div class=muted>No server-saved photos for this Attendance yet.</div>'}${pending.length?`<div class="notice bad"><b>Upload Failed</b> — these photos are retained on this device for retry and do not count as saved evidence.</div><div>${pending.map(failedThumb).join('')}</div>`:''}<div class="notice"><b>Photo evidence:</b> tap the required photo type, take/select the picture, and it will compress and upload automatically. There is no second save step.${taskHint?`<br><small>Repair photos will automatically link to Task ${esc(taskHint)} where the current task is unambiguous.</small>`:''}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${normalTypes.map(t=>`<button class=btn onclick="takeRequiredPhoto('${esc(w.id)}','${esc(a.id)}','${esc(t)}')">📷 ${esc(t)}</button>`).join('')}</div><button class=btn style="margin-top:8px" onclick="evidenceModal('${esc(w.id)}','${esc(a.id)}')">Other / Special Evidence</button></div>`;
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

  async function postEvidence(meta){
    const r=await fetch('/api/v1/evidence/media',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':window.KoonerStage6.csrfToken,'X-Kooner-Interface':'Technician Mobile','Idempotency-Key':meta.evidenceRef},body:JSON.stringify({evidenceRef:meta.evidenceRef,workOrder:meta.workOrder,attendance:meta.attendance,task:meta.task||null,type:meta.type,description:meta.description||'',filename:meta.filename||'technician-photo.jpg',mimeType:meta.mimeType,dataUrl:meta.dataUrl,visibility:'Internal Kooner Only'})});
    const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.message||'Evidence upload failed');return out
  }

  async function processPhoto(meta,fileObj){
    setStatus(meta.attendance,'Compressing photo…');renderCurrent(meta.workOrder,meta.attendance);
    try{
      const compressed=fileObj?.dataUrl?fileObj:await compressPhoto(fileObj);
      meta={...meta,...compressed,filename:meta.filename||fileObj?.name||'technician-photo.jpg'};
      if(S.mobileDevice?.online===false||navigator.onLine===false){
        const ok=rememberPending({...meta,status:'Upload Failed',capturedAt:new Date().toISOString()});
        setStatus(meta.attendance,ok?'Upload Failed — photo retained on this device and will retry when online.':'Upload Failed — photo could not be retained on this device. Retake when online.','bad');renderCurrent(meta.workOrder,meta.attendance);return
      }
      setStatus(meta.attendance,'Uploading photo…');renderCurrent(meta.workOrder,meta.attendance);
      const out=await postEvidence(meta);
      forgetPending(meta.evidenceRef);addServerEvidenceToState(meta.workOrder,out,meta);
      setStatus(meta.attendance,'Photo saved to server.','good');renderCurrent(meta.workOrder,meta.attendance);
      setTimeout(()=>{clearStatus(meta.attendance);renderCurrent(meta.workOrder,meta.attendance)},2200)
    }catch(err){
      let retained=false;
      if(meta.dataUrl)retained=rememberPending({...meta,status:'Upload Failed',capturedAt:new Date().toISOString()});
      setStatus(meta.attendance,retained?'Upload Failed — photo retained for retry.':'Upload Failed — photo was not saved. Please retry or retake.','bad');renderCurrent(meta.workOrder,meta.attendance);
    }
  }

  function choosePhoto(meta){
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.setAttribute('capture','environment');input.style.display='none';document.body.appendChild(input);
    input.addEventListener('change',async()=>{const f=input.files?.[0];input.remove();if(!f)return;await processPhoto({...meta,filename:f.name||'technician-photo.jpg'},f)},{once:true});
    input.click()
  }

  window.takeRequiredPhoto=function(wid,aid,type){
    const w=W(wid),task=activeTaskFor(w,type),evidenceRef='EV-S6-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
    choosePhoto({evidenceRef,workOrder:wid,attendance:aid,task,type,description:''})
  };

  window.evidenceModal=function(wid,aid){
    const w=W(wid);
    showSheet(`<h3>Other / Special Evidence</h3><div class=notice>Use this only when the normal photo requirement buttons do not describe the evidence. Taking the photograph will save it automatically after the server confirms the upload.</div><div class=field><label>Evidence type *</label><select id=evType>${['Meter / Diagnostic Reading','Customer-specific Evidence','Other Evidence'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class=field><label>Related Task</label><select id=evTask><option value="">Attendance / general</option>${(w.tasks||[]).map(t=>`<option value="${esc(t.id)}">${esc(t.desc)}</option>`).join('')}</select></div><div class=field><label>Description (only if needed)</label><textarea id=evDesc></textarea></div><div class=actions><button class=btn onclick=hideSheet()>Cancel</button><button class="btn p" onclick="takeSpecialPhoto('${esc(wid)}','${esc(aid)}')">📷 Take Photo</button></div>`)
  };
  window.takeSpecialPhoto=function(wid,aid){
    const type=document.getElementById('evType')?.value||'Other Evidence',task=document.getElementById('evTask')?.value||null,description=document.getElementById('evDesc')?.value.trim()||'',evidenceRef='EV-S6-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);hideSheet();choosePhoto({evidenceRef,workOrder:wid,attendance:aid,task,type,description})
  };

  window.confirmRemoveEvidence=function(wid,aid,ref){
    showSheet(`<h3>Remove this photo?</h3><div class=notice>The photo will be removed from the active job evidence. Its audit/history record will remain.</div><div class=actions><button class=btn onclick=hideSheet()>Cancel</button><button class="btn bad" onclick="removeEvidenceNow('${esc(wid)}','${esc(aid)}','${esc(ref)}')">Remove</button></div>`)
  };
  window.removeEvidenceNow=async function(wid,aid,ref){
    const removeButton=document.querySelector('#mobileSheet .btn.bad');if(removeButton){removeButton.disabled=true;removeButton.textContent='Removing…'}
    try{
      const r=await fetch('/api/v1/evidence/'+encodeURIComponent(ref),{method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':window.KoonerStage6.csrfToken,'X-Kooner-Interface':'Technician Mobile'},body:JSON.stringify({reason:'Technician removed incorrect photo'})});const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.message||'Could not remove photo');
      const w=W(wid);w.evidence=(w.evidence||[]).filter(e=>e.id!==ref);hideSheet();setStatus(aid,'Photo removed. Audit/history retained.','good');renderCurrent(wid,aid);setTimeout(()=>{clearStatus(aid);renderCurrent(wid,aid)},2200)
    }catch(err){if(removeButton){removeButton.disabled=false;removeButton.textContent='Remove'}alert(err.message||'Could not remove photo')}
  };

  async function retryOne(p){
    if(!isTechnician||S.mobileDevice?.online===false||navigator.onLine===false)return false;
    try{setStatus(p.attendance,'Retrying photo upload…');renderCurrent(p.workOrder,p.attendance);const out=await postEvidence(p);forgetPending(p.evidenceRef);addServerEvidenceToState(p.workOrder,out,p);setStatus(p.attendance,'Photo saved to server.','good');renderCurrent(p.workOrder,p.attendance);setTimeout(()=>{clearStatus(p.attendance);renderCurrent(p.workOrder,p.attendance)},2200);return true}catch{setStatus(p.attendance,'Upload Failed — photo retained for retry.','bad');renderCurrent(p.workOrder,p.attendance);return false}
  }
  window.retryEvidence=async function(ref){const p=pendingItems().find(x=>x.evidenceRef===ref);if(p)await retryOne(p)};
  async function retryPending(){for(const p of pendingItems())await retryOne(p)}

  if(isTechnician){addEventListener('online',()=>retryPending());setTimeout(()=>retryPending(),1600);setInterval(()=>{if(document.visibilityState==='visible')retryPending()},30000)}
})();
