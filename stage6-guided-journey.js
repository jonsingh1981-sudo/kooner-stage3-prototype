/* DCR-120 — Technician guided journey and one-current-job UX. */
(function(){
 if(!window.KoonerStage6?.active||KoonerStage6.interfaceName!=='Technician Mobile'||!KoonerStage6.user?.roles?.includes('technician'))return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ACTIVE=new Set(['En Route','On Site','In Progress','Paused','Stopped for Safety']);
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
  if(n&&(n.classList.contains('twobtn')||n.classList.contains('btn')||n.classList.contains('notice'))){
   // This is the Stage 4 jobPrimaryActions block immediately after the hero. Other job
   // content starts with section-title and is left untouched.
   n.remove()
  }
 }
 function ensureWorkingTimer(wid,aid){
  S.mobileActiveTimers=S.mobileActiveTimers||{};const tid=selectedTechId();
  if(S.mobileActiveTimers[tid])return;
  S.mobileActiveTimers[tid]={id:'TE-'+Date.now(),wo:wid,attendance:aid,task:null,activity:'Working',start:(window.K4&&K4.iso)?K4.iso():new Date().toISOString(),billable:true,autoStarted:true};
  persist()
 }
 window.guidedJourneyAction=function(wid,aid,code){
  const w=W(wid),a=(w.att||[]).find(x=>x.id===aid);if(!a)return;
  if(code==='accept')return acceptJob(wid,aid);
  if(code==='en_route')return guard(aid,()=>setJourneyStatus(wid,aid,'En Route'));
  if(code==='on_site')return guard(aid,()=>setJourneyStatus(wid,aid,'On Site'));
  if(code==='registration')return vehicleConfirmModal(wid,aid);
  if(code==='safety')return safetyModal(wid,aid);
  if(code==='start_work')return guard(aid,()=>{startWork(wid,aid);const fresh=(W(wid).att||[]).find(x=>x.id===aid);if(fresh?.status==='In Progress'){ensureWorkingTimer(wid,aid);renderJob(wid,aid)}});
  if(code==='finish_job')return openFinishJob(wid,aid);
  if(code==='resolve')return smartReasons(wid,aid,'unable')
 };
 // DCR-120 completion requirements can point at a specific Task. DCR-116's photo picker
 // resolves the Task synchronously before opening the camera. Temporarily narrowing the
 // in-memory Task list lets that existing, already-tested upload path link the required
 // photo to the exact Task without introducing a second media implementation.
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
