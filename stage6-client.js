/* Stage 6 API-backed compatibility layer. Backend/database remains authoritative. */
(function(){
  const nativeGet=Storage.prototype.getItem,nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem;
  function xhr(method,url,body){try{const x=new XMLHttpRequest();x.open(method,url,false);x.setRequestHeader('Accept','application/json');if(body)x.setRequestHeader('Content-Type','application/json');x.send(body?JSON.stringify(body):null);return x}catch(e){return null}}
  const probe=xhr('GET','/api/v1/system/public');
  if(!probe||probe.status!==200){window.KoonerStage6={active:false,mode:'Legacy Prototype Test Data'};return}
  const me=xhr('GET','/api/v1/auth/me');
  if(!me||me.status===401||me.status===403){const next=encodeURIComponent(location.pathname+location.search);location.replace('/stage6-login.html?next='+next);return}
  if(me.status!==200){document.documentElement.innerHTML='<body style="font-family:Arial;padding:30px"><h2>Kooner backend unavailable</h2><p>The shared Kooner API could not authenticate this session. Business data has not fallen back to browser storage.</p></body>';return}
  const auth=JSON.parse(me.responseText),boot=xhr('GET','/api/v1/bootstrap');
  if(!boot||boot.status!==200){document.documentElement.innerHTML='<body style="font-family:Arial;padding:30px"><h2>Kooner backend unavailable</h2><p>The shared database could not be loaded. Operations and Customer Portal do not use stale local business data as authority.</p></body>';return}
  const payload=JSON.parse(boot.responseText);let state=payload.legacyState||{},version=Number(payload.stateVersion||1),queue=Promise.resolve(),conflict=false;
  const interfaceName=location.pathname.includes('technician')?'Technician Mobile':location.pathname.includes('customer')?'Customer Portal':'Operations/Desktop';
  window.__koonerStage6State=state;
  function cache(v){try{nativeSet.call(localStorage,'koonerv1_stage6_cache',JSON.stringify(v))}catch{}}
  cache(state);
  Storage.prototype.getItem=function(k){if(k==='koonerv1'&&window.KoonerStage6?.active)return JSON.stringify(state);return nativeGet.call(this,k)};
  Storage.prototype.removeItem=function(k){if(k==='koonerv1'&&window.KoonerStage6?.active)return;return nativeRemove.call(this,k)};
  function banner(text,kind){const run=()=>{let b=document.getElementById('stage6Banner');if(!b){b=document.createElement('div');b.id='stage6Banner';b.style.cssText='position:fixed;z-index:99999;bottom:0;left:0;right:0;padding:7px 12px;font:12px Arial;text-align:center;background:#efe7f6;color:#3b185b;border-top:1px solid #c7addd';document.body.appendChild(b)}b.textContent=text;if(kind==='bad'){b.style.background='#fee2e2';b.style.color='#7f1d1d'}else if(kind==='warn'){b.style.background='#fef3c7';b.style.color='#78350f'}else{b.style.background='#efe7f6';b.style.color='#3b185b'}};if(document.body)run();else addEventListener('DOMContentLoaded',run)}
  async function sendSnapshot(snapshot){
    const r=await fetch('/api/v1/compat/state',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrfToken,'X-Kooner-Interface':interfaceName},body:JSON.stringify({state:snapshot,baseVersion:version})});
    const out=await r.json().catch(()=>({}));
    if(r.status===409){conflict=true;banner('STAGE 6 • CONFLICT DETECTED — another user changed server data. Refresh before retrying.','warn');throw new Error('Conflict detected')}
    if(!r.ok){banner('STAGE 6 • SERVER SAVE FAILED — no browser fallback authority was used.','bad');throw new Error(out.message||'Save failed')}
    version=Number(out.stateVersion||version);conflict=false;cache(snapshot);banner(`STAGE 6 TEST • DATABASE/API BACKED • ${interfaceName} • server version ${version}`);return out;
  }
  function saveState(next){state=next;window.__koonerStage6State=state;const snapshot=JSON.parse(JSON.stringify(next));if(interfaceName==='Technician Mobile'&&next?.mobileDevice?.online===false){cache(snapshot);banner('STAGE 6 • TECHNICIAN OFFLINE — device cache only; pending events must sync to server.','warn');return}queue=queue.then(()=>sendSnapshot(snapshot)).catch(()=>{});}
  Storage.prototype.setItem=function(k,v){if(k==='koonerv1'&&window.KoonerStage6?.active){try{saveState(JSON.parse(v))}catch(e){banner('STAGE 6 • invalid compatibility state was not saved','bad')}return}return nativeSet.call(this,k,v)};
  async function logout(){await fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-CSRF-Token':auth.csrfToken},credentials:'same-origin'});location.replace('/stage6-login.html')}
  window.KoonerStage6={active:true,mode:'Database/API Backed',user:auth.user,csrfToken:auth.csrfToken,get stateVersion(){return version},saveState,logout,refresh:()=>location.reload(),interfaceName};
  banner(`STAGE 6 TEST • DATABASE/API BACKED • ${interfaceName} • ${auth.user.name}`);
  setInterval(async()=>{if(conflict||document.hidden)return;try{const r=await fetch('/api/v1/changes?since='+version,{credentials:'same-origin'});if(!r.ok)return;const x=await r.json();if(x.changed)banner(`STAGE 6 • NEW SERVER DATA AVAILABLE (v${x.version}) — refresh to load it.`,'warn')}catch{}},15000);
})();
