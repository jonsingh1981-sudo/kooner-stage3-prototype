/* Stage 6 API-backed compatibility layer. Backend/database remains authoritative. */
(function(){
  const nativeGet=Storage.prototype.getItem,nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem;
  function xhr(method,url,body){try{const x=new XMLHttpRequest();x.open(method,url,false);x.setRequestHeader('Accept','application/json');if(body)x.setRequestHeader('Content-Type','application/json');x.send(body?JSON.stringify(body):null);return x}catch(e){return null}}
  function unavailable(){
    window.KoonerStage6={active:false,mode:'Backend Unavailable',authority:'Fail Closed'};
    const here=location.pathname;
    if(!here.endsWith('/stage6-unavailable.html'))location.replace('/stage6-unavailable.html');
  }
  const probe=xhr('GET','/api/v1/system/public');
  if(!probe||probe.status!==200){unavailable();return}
  const me=xhr('GET','/api/v1/auth/me');
  if(!me){unavailable();return}
  if(me.status===401||me.status===403){const next=encodeURIComponent(location.pathname+location.search);location.replace('/stage6-login.html?next='+next);return}
  if(me.status!==200){unavailable();return}
  const auth=JSON.parse(me.responseText),boot=xhr('GET','/api/v1/bootstrap');
  if(!boot||boot.status!==200){unavailable();return}
  const payload=JSON.parse(boot.responseText);let state=payload.legacyState||{},lastServerState=JSON.parse(JSON.stringify(payload.legacyState||{})),version=Number(payload.stateVersion||1),queue=Promise.resolve(),conflict=false;
  const interfaceName=location.pathname.includes('technician')?'Technician Mobile':location.pathname.includes('customer')?'Customer Portal':'Operations/Desktop';
  const roleNames={customer_administrator:'Customer Administrator',site_manager:'Site Manager',fleet_manager:'Fleet Manager',authoriser:'Authoriser',customer_finance:'Finance',read_only:'Read Only',operations:'Operations',dispatcher:'Dispatcher',technician:'Technician',billing:'Billing',administrator:'Administrator'};
  function legacyPortalPermissions(p){const out=[];if(p.includes('vehicles.read'))out.push('vehicles');if(p.includes('workorders.read'))out.push('workorders');if(p.includes('portal.submit'))out.push('submit');if(p.includes('estimates.read'))out.push('estimates');if(p.includes('estimates.approve'))out.push('approve');if(p.includes('portal.finance'))out.push('billing','invoices');if(p.includes('documents.read'))out.push('documents');if(p.includes('portal.users'))out.push('users');if(p.includes('compat.write'))out.push('mileage','notifications','po','datachange');return[...new Set(out)]}
  if(interfaceName==='Customer Portal'&&auth.user.type==='customer'){
    const customerRef=state.customers?.[0]?.id||null,siteRefs=(state.sites||[]).map(s=>s.id),roleCode=auth.user.roles?.[0]||'read_only',portalId=auth.user.ref||auth.user.id;
    state.portalUsers=[{id:portalId,customer:customerRef,name:auth.user.name,email:auth.user.email||'',phone:'',role:roleNames[roleCode]||roleCode,sites:siteRefs,permissions:legacyPortalPermissions(auth.user.permissions||[]),finance:(auth.user.permissions||[]).includes('portal.finance'),readOnly:!(auth.user.permissions||[]).includes('compat.write'),status:'Active',stage6Authenticated:true}];
    state.portalSettings={selectedUser:portalId};
    lastServerState=JSON.parse(JSON.stringify(state));
  }
  if(interfaceName==='Technician Mobile'&&auth.user.type==='internal'&&(auth.user.roles||[]).includes('technician')&&state.techs?.length){state.mobileSettings={...(state.mobileSettings||{}),selectedTech:state.techs[0].id};lastServerState=JSON.parse(JSON.stringify(state))}
  window.__koonerStage6State=state;
  function cache(v){try{nativeSet.call(localStorage,'koonerv1_stage6_cache',JSON.stringify(v))}catch{}}
  cache(state);
  Storage.prototype.getItem=function(k){if(k==='koonerv1'&&window.KoonerStage6?.active)return JSON.stringify(state);return nativeGet.call(this,k)};
  Storage.prototype.removeItem=function(k){if(k==='koonerv1'&&window.KoonerStage6?.active)return;return nativeRemove.call(this,k)};
  function banner(text,kind){const run=()=>{let b=document.getElementById('stage6Banner');if(!b){b=document.createElement('div');b.id='stage6Banner';b.style.cssText='position:fixed;z-index:99999;bottom:0;left:0;right:0;padding:7px 12px;font:12px Arial;text-align:center;background:#efe7f6;color:#3b185b;border-top:1px solid #c7addd';document.body.appendChild(b)}b.textContent=text;if(kind==='bad'){b.style.background='#fee2e2';b.style.color='#7f1d1d'}else if(kind==='warn'){b.style.background='#fef3c7';b.style.color='#78350f'}else{b.style.background='#efe7f6';b.style.color='#3b185b'}};if(document.body)run();else addEventListener('DOMContentLoaded',run)}
  function restoreServerState(){state=JSON.parse(JSON.stringify(lastServerState));window.__koonerStage6State=state;cache(state)}
  // DCR-121: explicit API actions may return a state that is already committed by the
  // authoritative server. Accepting that state locally must NOT submit a second compatibility
  // snapshot. This keeps the Technician on the same job and prevents false browser-first success.
  function acceptServerState(next,nextVersion){
    const snapshot=JSON.parse(JSON.stringify(next||{}));
    state=snapshot;lastServerState=JSON.parse(JSON.stringify(snapshot));window.__koonerStage6State=state;
    if(Number.isFinite(Number(nextVersion)))version=Number(nextVersion);
    conflict=false;cache(state);banner(`STAGE 6 TEST • DATABASE/API BACKED • ${interfaceName} • server version ${version}`);return state;
  }
  async function sendSnapshot(snapshot){
    let r;
    try{r=await fetch('/api/v1/compat/state',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrfToken,'X-Kooner-Interface':interfaceName},body:JSON.stringify({state:snapshot,baseVersion:version})})}
    catch(e){restoreServerState();unavailable();throw e}
    const out=await r.json().catch(()=>({}));
    if(r.status===401||r.status===403){restoreServerState();location.replace('/stage6-login.html?next='+encodeURIComponent(location.pathname+location.search));throw new Error('Session expired')}
    if(r.status===409){restoreServerState();conflict=true;banner('STAGE 6 • CONFLICT DETECTED — another user changed server data. Refreshing server-authoritative data.','warn');setTimeout(()=>location.reload(),700);throw new Error('Conflict detected')}
    if(!r.ok){restoreServerState();banner('STAGE 6 • SERVER REJECTED CHANGE — browser data was rolled back to server authority.','bad');setTimeout(()=>location.reload(),900);throw new Error(out.message||'Save failed')}
    version=Number(out.stateVersion||version);conflict=false;lastServerState=JSON.parse(JSON.stringify(snapshot));cache(snapshot);banner(`STAGE 6 TEST • DATABASE/API BACKED • ${interfaceName} • server version ${version}`);return out;
  }
  function saveState(next){state=next;window.__koonerStage6State=state;const snapshot=JSON.parse(JSON.stringify(next));if(interfaceName==='Technician Mobile'&&next?.mobileDevice?.online===false){cache(snapshot);banner('STAGE 6 • TECHNICIAN OFFLINE — device cache only; pending events must sync to server.','warn');return}queue=queue.then(()=>sendSnapshot(snapshot)).catch(()=>{});}
  Storage.prototype.setItem=function(k,v){if(k==='koonerv1'&&window.KoonerStage6?.active){try{saveState(JSON.parse(v))}catch(e){banner('STAGE 6 • invalid compatibility state was not saved','bad')}return}return nativeSet.call(this,k,v)};
  async function logout(){await fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-CSRF-Token':auth.csrfToken},credentials:'same-origin'});location.replace('/stage6-login.html')}
  window.KoonerStage6={active:true,mode:'Database/API Backed',authority:'PostgreSQL/API',user:auth.user,csrfToken:auth.csrfToken,get stateVersion(){return version},saveState,acceptServerState,logout,refresh:()=>location.reload(),interfaceName};
  banner(`STAGE 6 TEST • DATABASE/API BACKED • ${interfaceName} • ${auth.user.name}`);
  addEventListener('DOMContentLoaded',()=>{if(interfaceName==='Customer Portal'){const p=document.getElementById('persona');if(p){p.disabled=true;p.title='Stage 6 authenticated user – persona switching is disabled'}}});
  setInterval(async()=>{if(conflict||document.hidden)return;try{const r=await fetch('/api/v1/changes?since='+version,{credentials:'same-origin'});if(r.status===401||r.status===403){location.replace('/stage6-login.html');return}if(!r.ok){unavailable();return}const x=await r.json();if(x.changed)banner(`STAGE 6 • NEW SERVER DATA AVAILABLE (v${x.version}) — refresh to load it.`,'warn')}catch{unavailable()}},15000);
})();
