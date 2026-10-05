/* Vehicle site move: append-only assignment history and vehicle audit. */
K3.previousDay=function(iso){let x=new Date(iso+'T12:00:00');x.setDate(x.getDate()-1);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
K3._vehicleDetailSiteMoveBase=window.vehicleDetail;
window.vehicleDetail=function(id){
 K3._vehicleDetailSiteMoveBase(id);let v=V(id),card=vdetail.querySelector('.card');
 if(card&&!card.querySelector('.move-site-action')){
  let h=card.querySelector('h2');if(h)h.insertAdjacentHTML('afterend',`<div class="toolbar move-site-action"><button class="btn" onclick="moveVehicleSite('${id}')">Change / Move Home Site</button></div>`);
 }
};
window.moveVehicleSite=function(id){
 let v=V(id),sites=S.sites.filter(s=>s.c===v.c&&s.id!==v.s);
 show(`<h3>Change / Move Home Site</h3><div class=notice><b>${v.reg}</b> • Current: ${SI(v.s).name}<br>Only Sites belonging to ${C(v.c).name} are available.</div><div class=form><div class=f><label>New Site *</label><select id=mvsite><option value="">Select…</option>${sites.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></div><div class=f><label>Effective From *</label><input id=mvfrom type=date value="${K3.today()}"></div><div class="f full"><label>Reason *</label><input id=mvreason placeholder="Reason for site move"></div></div>${sites.length?'':'<div class="notice bad">No alternative Sites exist for this Customer.</div>'}<div class=actions><button class=btn onclick=hide()>Cancel</button><button class="btn p" ${sites.length?'':'disabled'} onclick="saveVehicleSiteMove('${id}')">Save Site Move</button></div>`);
};
window.saveVehicleSiteMove=function(id){
 let v=V(id),newSite=mvsite.value,from=mvfrom.value,reason=mvreason.value.trim();
 if(!newSite||!from||!reason)return alert('New Site, Effective From and Reason are required.');
 if(SI(newSite).c!==v.c)return alert('Selected Site does not belong to this Customer.');
 if(newSite===v.s)return alert('Select a different Site.');
 v.siteAssignments=v.siteAssignments||[];let oldSite=v.s,currentAssignment=v.siteAssignments.find(a=>a.current)||v.siteAssignments.slice().reverse().find(a=>!a.to);
 if(currentAssignment&&currentAssignment.from&&from<currentAssignment.from)return alert('Effective From cannot be earlier than the current Site Assignment start date.');
 if(currentAssignment){currentAssignment.to=K3.previousDay(from);currentAssignment.current=false;currentAssignment.closedBy='Operations Test User';currentAssignment.closeReason=reason;}
 let assignment={id:'VSA-'+id+'-'+Date.now().toString().slice(-6),site:newSite,from,to:null,current:true,by:'Operations Test User',reason,createdAt:new Date().toISOString()};
 v.siteAssignments.push(assignment);v.s=newSite;v.audit=v.audit||[];let audit={at:new Date().toISOString(),by:'Operations Test User',action:'Home Site changed',oldSite,newSite,effectiveFrom:from,reason,assignmentId:assignment.id};v.audit.push(audit);save();hide();vehicleDetail(id);
};
K3._vehicleTabSiteAuditBase=window.vehicleTab;
window.vehicleTab=function(id,i,b){
 K3._vehicleTabSiteAuditBase(id,i,b);let v=V(id);
 if(i===0&&window.vehiclePane){
  vehiclePane.insertAdjacentHTML('beforeend',`<div class=sectionbox><b>Vehicle Audit History</b>${(v.audit||[]).slice().reverse().map(a=>`<div class=historyline><b>${a.action}</b><br><small>${K3.dt(a.at)} • ${a.by}</small><br>${a.oldSite?`${SI(a.oldSite).name} → ${SI(a.newSite).name} • Effective ${d(a.effectiveFrom)} • ${a.reason}`:''}</div>`).join('')||'<div class=historyline>No vehicle audit events yet.</div>'}</div>`);
 }
};
