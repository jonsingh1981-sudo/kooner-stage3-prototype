/* Stage 6: the Stage 5 persona selector is no longer authentication. Keep the approved Portal UI but lock identity to the authenticated server session. */
(function(){
 if(!window.KoonerStage6?.active||KoonerStage6.user?.type!=='customer')return;
 const authRef=KoonerStage6.user.ref||KoonerStage6.user.id;
 function current(){return (S.portalUsers||[]).find(x=>x.id===authRef)||(S.portalUsers||[]).find(x=>x.stage6Authenticated)||null}
 window.user=function(){return current()||{id:authRef,customer:'',name:KoonerStage6.user.name,role:'Customer User',sites:[],permissions:[],readOnly:true,status:'Active'}};
 window.initPersona=function(){
  const u=current();if(!u)return;
  S.portalSettings=S.portalSettings||{};S.portalSettings.selectedUser=u.id;
  if(window.persona){persona.innerHTML=`<option value="${u.id}" selected>${C(u.customer).name} — ${u.name} (${u.role})</option>`;persona.disabled=true;persona.title='Stage 6 identity is controlled by the authenticated server session';}
 };
 const originalToggle=window.togglePortalUser;
 window.togglePortalUser=function(id){if(id===authRef)return alert('You cannot deactivate the currently authenticated account from its own session.');return originalToggle(id)};
 function addIdentityBanner(){if(document.getElementById('stage6Identity'))return;let h=document.querySelector('.top');if(!h)return;let x=document.createElement('div');x.id='stage6Identity';x.className='notice good';x.style.margin='0 6px';x.innerHTML=`<b>Authenticated:</b> ${K5.safe(KoonerStage6.user.name)}<br><small>Identity and Customer/Site scope are server controlled.</small>`;h.appendChild(x)}
 initPersona();addIdentityBanner();
 try{render()}catch(e){console.warn('Stage 6 customer identity refresh',e)}
})();
