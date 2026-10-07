/* DCR-120 / DCR-121 — guided Technician journey with server-confirmed persistence. */
(function(){
 if(!window.KoonerStage6?.active||KoonerStage6.interfaceName!=='Technician Mobile'||!KoonerStage6.user?.roles?.includes('technician'))return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ACTIVE=new Set(['En Route','On Site','In Progress','Paused','Stopped for Safety']),busy=new Set();
 function policy(a){const remote=/remote support/i.test(a?.type||''),workshop=/workshop/i.test(selectedTech()?.role||'');return{remote,workshop,requiresEnRoute:!remote&&!workshop,requiresOnSite:!remote,requiresRegistration:!remote,requiresSafety:!remote}}
 function currentOther(aid){return attendanceJobs(selectedTechId()).find(x=>x.a.id!==aid&&ACTIVE.has(x.a.status))||null}
 function blocked(other){
  showSheet(`<h3>Current job still active</h3><div class="notice"><b>Finish or resolve your current job before starting another.</b></div><div class=reg>${esc(V(other.w.v).reg)}</div><div class=muted>${esc(other.w.id)} • ${esc(other.a.status)}</div><div class=actions><button class=btn onclick=hideSheet()>Close</button><button class="btn p" onclick="hideSheet();openMobileJob('${esc(other.w.id)}','${esc(other.a.id)}')">Return to Current Job</button></div>`)
 }
 function guard(aid,fn){const other=currentOther(aid);if(other){blocked(other);return false}fn();return true}
 function nextAction(w,a){
  const p=policy(a);
  if(['Planned','Dispatched'].includes(a.status))return{code:'accept',label:'ACCEPT JOB'};
  if(a.status==='Accepted'){
   if(p.requiresEnRoute)return{code:'en_route',label:'START TRAVEL / EN ROUTE'};
   if(p.requiresOnSite)return{code:'on_site',label:'ARRIVED ON SITE'};
   return{code:'start_work',label:p.remote?'START REMOTE SUPPORT':'START WORK'};
  }
  if(a.status==='En Route'&&p.requiresOnSite)return{code:'on_site',label:'ARRIVED ON SITE'};
  if(a.status==='On Site'){
   if(p.requiresRegistration&&!a.vehicleConfirmation?.match)return{code:'registration',label:'CONFIRM REGISTRATION'};
   if(p.requiresSafety&&!a.safety?.safe)return{code:'safety',label:'COMPLETE SAFETY CHECK'};
   return{code:'start_work',label:p.remote?'START REMOTE SUPPORT':'START WORK'};
  }
  if(a.status==='In Progress')return{code:'finish_job',label:'FINISH JOB'};
  if(['Paused','Stopped for Safety'].includes(a.status))return{code:'resolve',label:'RESOLVE CURRENT JOB'};
  return null
 }
 function primaryHtml(w,a,x){
  if(!x)return'';
  const style='width:100%;margin:10px 0 14px;font-size:20px;font-weight:800;padding:16px';
  if(x.code==='accept')return `<div id=guidedPrimary><button class="btn good" style="${style}" onclick="guidedJourneyAction('${esc(w.id)}','${esc(a.id)}','accept')">${x.label}</button><button class="btn bad" style="width:100%;margin:-6px 0 14px" onclick="rejectJobModal('${esc(w.id)}','${esc(a.id)}')">Reject Job</button></div>`;
  return `<div id=guidedPrimary><button class="btn p" style="${style}" onclick="guidedJourneyAction('${esc(w.id)}','${esc(a.id)}','${x.code}')">${x.label}</button></div>`
 }
 function removeOldPrimary(hero){
  const smart=M('smartFinishJobPrimary');if(smart)smart.remove();
  const old=M('guidedPrimary');if(old)old.remove();
  const n=hero?.nextElementSibling;
  if(n&&(n.classList.contains('twobtn')||n.classList.contains('btn')||n.classList.contains('notice')))n.remove()
 }
 function ensureWorkingTimer(wid,aid){
  S.mobileActiveTimers=S.mobileActiveTimers||{};const tid=selectedTechId();
  if(S.mobileActiveTimers[tid])return;
  S.mobileActiveTimers[tid]={id:'TE-'+Date.now(),wo:wid,attendance:aid,task:null,activity:'Working',start:(window.K4&&K4.iso)?K4.iso():new Date().toISOString(),billable:true,autoStarted:true}
 }
 function applyServerConfirmation(wid,aid,out){
  let w=W(wid),a=(w.att||[]).find(x=>x.id===aid);if(!w?.id||!a)return;
  a.status=out.attendanceStatus||a.status;a._recordVersion=Number(out.attendanceVersion||a._recordVersion||0);
  if(out.journey)a.journey=out.journey;if(out.vehicleConfirmation!==undefined)a.vehicleConfirmation=out.vehicleConfirmation;if(out.safety!==undefined)a.safety=out.safety;
  w.status=out.workOrderStatus||w.status;w.owner=out.currentOwner||w.owner;w.next=out.nextWorkOrderAction||w.next;w._recordVersion=Number(out.workOrderVersion||w._recordVersion||0);
  S=KoonerStage6.acceptServerState(S,out.stateVersion);
  if(out.action==='start_work'&&a.status==='In Progress')ensureWorkingTimer(wid,aid);
  window.mobileView='job';window.mobileJob={wid,aid};
  renderJob(wid,aid)
 }
 function journeyError(wid,aid,e){
  const body=e?.body||{},other=body.activeWorkOrder&&body.activeAttendance?`<div class=actions><button class="btn p" onclick="hideSheet();openMobileJob('${esc(body.activeWorkOrder)}','${esc(body.activeAttendance)}')">Return to Current Job</button></div>`:'';
  showSheet(`<h3>Action not saved</h3><div class="notice bad"><b>${esc(body.message||e.message||'The server did not save this action.')}</b></div><div class=notice>Your job has not been advanced. You are still on ${esc(wid)}.</div>${other}<div class=actions><button class=btn onclick="hideSheet();openMobileJob('${esc(wid)}','${esc(aid)}')">Back to This Job</button></div>`)
 }
 async function journeyApi(wid,aid,action,payload={}){
  if(S.mobileDevice?.online===false||navigator.onLine===false)throw Object.assign(new Error('Connection required before this journey action can be confirmed by the Stage 6 server.'),{body:{message:'Connection required before this journey action can be confirmed by the Stage 6 server.'}});
  const r=await fetch(`/api/v1/technician-journey/${encodeURIComponent(wid)}/${encodeURIComponent(aid)}/action`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':KoonerStage6.csrfToken,'X-Kooner-Interface':'Technician Mobile'},body:JSON.stringify({action,...payload})});
  const out=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(out.message||`Server returned ${r.status}`);e.status=r.status;e.body=out;throw e}return out
 }
 async function runJourney(wid,aid,action,payload={}){
  const key=wid+'|'+aid+'|'+action;if(busy.has(key))return;busy.add(key);
  try{
   // DCR-121 ordering is deliberate: no browser state is changed before the authoritative
   // server confirms success. A rejection therefore cannot briefly show the next stage.
   const out=await journeyApi(wid,aid,action,payload);
   applyServerConfirmation(wid,aid,out)
  }catch(e){journeyError(wid,aid,e)}finally{busy.delete(key)}
 }
 window.guidedJourneyAction=function(wid,aid,code){
  const w=W(wid),a=(w.att||[]).find(x=>x.id===aid);if(!a)return;
  if(code==='accept')return runJourney(wid,aid,'accept');
  if(code==='en_route')return guard(aid,()=>runJourney(wid,aid,'en_route'));
  if(code==='on_site')return guard(aid,()=>runJourney(wid,aid,'on_site'));
  if(code==='registration')return vehicleConfirmModal(wid,aid);
  if(code==='safety')return safetyModal(wid,aid);
  if(code==='start_work')return guard(aid,()=>runJourney(wid,aid,'start_work'));
  if(code==='finish_job')return openFinishJob(wid,aid);
  if(code==='resolve')return smartReasons(wid,aid,'unable')
 };
 // Override the Stage 4 modal save handlers so Registration and Safety are also
 // server-confirmed before local UI state changes.
 window.saveVehicleConfirm=async function(wid,aid){
  const w=W(wid),found=M('vcReg')?.value?.toUpperCase()||'',note=M('vcNote')?.value?.trim()||'';if(!found)return alert('Enter the registration found onsite.');
  const expected=String(V(w.v).reg||'').replace(/\s/g,'').toUpperCase(),actual=found.replace(/\s/g,'').toUpperCase();if(expected!==actual&&!note)return alert('Add a mismatch explanation.');
  hideSheet();return runJourney(wid,aid,'registration',{registration:found,note})
 };
 window.saveSafety=async function(wid,aid){
  const safe=M('sfOutcome')?.value==='Safe to Proceed',reason=M('sfReason')?.value?.trim()||'';if(!safe&&!reason)return alert('Reason required when Unsafe to Proceed.');
  const payload={safe,reason,note:M('sfNote')?.value?.trim()||'',safeLoc:!!M('sf-safeLoc')?.checked,secured:!!M('sf-secured')?.checked,ppe:!!M('sf-ppe')?.checked,traffic:!!M('sf-traffic')?.checked,height:!!M('sf-height')?.checked,ev:!!M('sf-ev')?.checked};
  hideSheet();return runJourney(wid,aid,'safety',payload)
 };
 // DCR-120 completion requirements can point at a specific Task. DCR-116's photo picker
 // resolves the Task synchronously before opening the camera. Temporarily narrowing the
 // in-memory Task list lets that existing, already-tested upload path link the required photo.
 const baseTakeRequiredPhoto=window.takeRequiredPhoto;
 if(typeof baseTakeRequiredPhoto==='function')window.takeRequiredPhoto=function(wid,aid,type,taskRef){
  if(!taskRef)return baseTakeRequiredPhoto(wid,aid,type);
  const w=W(wid),all=w.tasks||[],target=all.find(t=>t.id===taskRef);if(!target)return baseTakeRequiredPhoto(wid,aid,type);
  w.tasks=[target];try{return baseTakeRequiredPhoto(wid,aid,type)}finally{w.tasks=all}
 };
 const baseFinish=window.openFinishJob;
 window.openFinishJob=function(wid,aid){const w=W(wid),a=(w.att||[]).find(x=>x.id===aid);if(!a)return;if(a.status!=='In Progress'){const x=nextAction(w,a);showSheet(`<h3>${esc(x?.label||'Job is not ready to finish')}</h3><div class=notice>Complete the next job step first. FINISH JOB becomes available once this Attendance is Working.</div><div class=actions><button class=btn onclick=hideSheet()>Close</button>${x&&x.code!=='resolve'?`<button class="btn p" onclick="hideSheet();guidedJourneyAction('${esc(wid)}','${esc(aid)}','${esc(x.code)}')">${esc(x.label)}</button>`:''}</div>`);return}return baseFinish(wid,aid)};
 const baseRender=window.renderJob;
 window.renderJob=function(wid,aid){
  const out=baseRender.apply(this,arguments),w=W(wid),a=(w.att||[]).find(x=>x.id===aid),root=M('mobileContent'),hero=root?.querySelector('.card.hero');
  if(!w?.id||!a||!hero)return out;
  removeOldPrimary(hero);
  const x=nextAction(w,a);if(x)hero.insertAdjacentHTML('afterend',primaryHtml(w,a,x));
  return out
 };
 if(window.mobileJob?.wid&&window.mobileJob?.aid)renderJob(window.mobileJob.wid,window.mobileJob.aid);
})();
