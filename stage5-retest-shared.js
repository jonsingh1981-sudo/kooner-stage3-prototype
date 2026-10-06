/* Stage 5 retest corrections: central portal authorisation, safe rendering and DCR records. */
window.K5=window.K5||{};
K5.safe=function(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))};
K5.allCustomerSites=function(s,cid){return (s.sites||[]).filter(x=>x.c===cid).map(x=>x.id)};
K5.customerLevelFinance=function(s,u){if(!u||!u.finance)return false;let all=K5.allCustomerSites(s,u.customer),mine=u.sites||[];return all.every(id=>mine.includes(id))};
K5.permissionForAction={
 openCustomer:null,openSite:null,openVehicle:'vehicles',openWorkOrder:'workorders',openEstimate:'estimates',openInvoice:'invoices',openDocument:'documents',
 submitWorkRequest:'submit',sendMessage:'workorders',updatePO:'po',submitMileage:'mileage',requestVOR:'workorders',dataChange:'datachange',
 approveEstimate:'approve',declineEstimate:'approve',estimateQuestion:'estimates',manageUsers:'users',notificationChange:'notifications',profileChange:null
};
K5.mutatingActions=new Set(['submitWorkRequest','sendMessage','updatePO','submitMileage','requestVOR','dataChange','approveEstimate','declineEstimate','estimateQuestion','manageUsers']);
K5.resolveScope=function(s,ctx){ctx=ctx||{};let customer=ctx.customer||null,site=ctx.site||null,record=null;
 if(ctx.siteId){record=(s.sites||[]).find(x=>x.id===ctx.siteId);if(record){customer=record.c;site=record.id}}
 if(ctx.vehicleId){record=(s.vehicles||[]).find(x=>x.id===ctx.vehicleId);if(record){customer=record.c;site=record.s}}
 if(ctx.workOrderId){record=(s.wos||[]).find(x=>x.id===ctx.workOrderId);if(record){customer=record.c;site=record.s}}
 if(ctx.invoiceId){record=(s.invoices||[]).find(x=>x.id===ctx.invoiceId);if(record)customer=record.customer}
 if(ctx.documentId){record=(s.documents||[]).find(x=>x.id===ctx.documentId);if(record){customer=record.customer||customer;site=record.site||site;if(!site&&record.workOrder){let w=(s.wos||[]).find(x=>x.id===record.workOrder);if(w){customer=w.c;site=w.s}}if(!site&&record.vehicle){let v=(s.vehicles||[]).find(x=>x.id===record.vehicle);if(v){customer=v.c;site=v.s}}}}
 return{customer,site,record};
};
K5.invoiceSites=function(s,inv){let sites=new Set();(inv.workOrders||[]).forEach(id=>{let w=(s.wos||[]).find(x=>x.id===id);if(w)sites.add(w.s)});(inv.lines||[]).forEach(l=>{if(l.site)sites.add(l.site);if(l.workOrder){let w=(s.wos||[]).find(x=>x.id===l.workOrder);if(w)sites.add(w.s)}if(l.reference){let w=(s.wos||[]).find(x=>x.id===l.reference);if(w)sites.add(w.s)}});return[...sites]};
K5.portalAuth=function(s,userId,action,ctx){let u=(s.portalUsers||[]).find(x=>x.id===userId);if(!u||u.status!=='Active')return{ok:false,reason:'User inactive or unavailable'};let perm=K5.permissionForAction[action];if(perm&&!(u.permissions||[]).includes(perm))return{ok:false,reason:'Permission not granted'};if(u.readOnly&&K5.mutatingActions.has(action))return{ok:false,reason:'Read Only role'};let scope=K5.resolveScope(s,ctx);if(scope.customer&&scope.customer!==u.customer)return{ok:false,reason:'Customer scope'};if(scope.site&&!(u.sites||[]).includes(scope.site))return{ok:false,reason:'Site scope'};
 if(action==='openInvoice'){
  let inv=(s.invoices||[]).find(x=>x.id===ctx.invoiceId);if(!inv||inv.status!=='Issued'||inv.customer!==u.customer)return{ok:false,reason:'Invoice scope'};
  if(!u.finance)return{ok:false,reason:'Finance visibility required'};
  let sites=K5.invoiceSites(s,inv),full=K5.customerLevelFinance(s,u);
  if(!sites.length&&inv.type!=='One Work Order'&&!full)return{ok:false,reason:'Customer-level Finance required for consolidated invoice'};
  if(sites.some(id=>!(u.sites||[]).includes(id)))return{ok:false,reason:'Invoice includes unauthorised Site data'};
  if(inv.type&&/consolidated|monthly|weekly/i.test(inv.type)&&!full)return{ok:false,reason:'Customer-level Finance required for mixed/consolidated invoice'};
 }
 if(action==='openDocument'){
  let d=(s.documents||[]).find(x=>x.id===ctx.documentId);if(!d||d.customer!==u.customer)return{ok:false,reason:'Document scope'};
  if(d.visibility==='Internal Kooner Only')return{ok:false,reason:'Internal document'};
  if(d.visibility==='Customer Finance Only'&&!u.finance)return{ok:false,reason:'Finance document'};
  if(d.invoice){let a=K5.portalAuth(s,userId,'openInvoice',{invoiceId:d.invoice});if(!a.ok)return a}
  if(scope.site&&!(u.sites||[]).includes(scope.site))return{ok:false,reason:'Document linked to unauthorised Site'};
  if(!['Customer Visible','Customer Finance Only','Specific Site/User Role',undefined,null,''].includes(d.visibility))return{ok:false,reason:'Document visibility'};
 }
 if(ctx.recordCustomer&&ctx.recordCustomer!==u.customer)return{ok:false,reason:'Record customer'};
 if(ctx.recordSite&&!(u.sites||[]).includes(ctx.recordSite))return{ok:false,reason:'Record site'};
 return{ok:true,user:u,scope};
};
K5.customerCommVisible=function(c){return !!c&&c.visibility==='Customer Visible'&&c.visibility!=='Internal Kooner Only'&&c.audience!=='Internal Kooner Only'&&c.audience!=='Internal'};
K5.roleTemplates=K5.roleTemplates||{
 'Customer Administrator':{permissions:['vehicles','workorders','submit','estimates','approve','billing','invoices','mileage','notifications','users','po','documents','datachange'],finance:true,readOnly:false},
 'Site Manager':{permissions:['vehicles','workorders','submit','estimates','mileage','notifications','po','documents','datachange'],finance:false,readOnly:false},
 'Fleet Manager':{permissions:['vehicles','workorders','submit','estimates','mileage','notifications','po','documents','datachange'],finance:false,readOnly:false},
 'Authoriser':{permissions:['vehicles','workorders','estimates','approve','documents','notifications'],finance:false,readOnly:false},
 'Finance':{permissions:['vehicles','workorders','estimates','billing','invoices','documents','notifications'],finance:true,readOnly:true},
 'Read Only':{permissions:['vehicles','workorders','estimates','documents','notifications'],finance:false,readOnly:true}
};
K5.stage5RetestDcr=[
 ['DCR-079','Customer Portal Security','Portal action-level authorisation at every sensitive read/write.','Defect','P1','Central Portal authorisation service now revalidates user, customer, site, permission, Read Only state and record scope inside sensitive actions.'],
 ['DCR-080','Customer Portal Security','Read Only enforcement.','Defect','P1','Read Only is enforced inside mutation/save functions; permitted viewing and personal preference/contact updates remain separate.'],
 ['DCR-081','Customer Portal Estimates','Estimate response authorisation and current-state validation.','Defect','P1','Approve/Decline/Question now revalidate exact Estimate, version, current valid state, scope and permission at save time.'],
 ['DCR-082','Customer Portal Security','Invoice, Document and Communication scope hardening.','Defect','P1','Invoice Site scope, linked-document scope and explicit Customer Visible communication rules hardened.'],
 ['DCR-083','Customer Portal Security','Customer input safe rendering.','Defect','P1','Central HTML escaping is applied to Portal-supplied text in customer and Operations Portal views.'],
 ['DCR-084','Operations / Customer Portal','Portal Action underlying-resolution workflow.','Defect','P1','Operations resolution is action-type aware and updates the underlying Portal Request, mileage review, data-change or Work Order action with audit.'],
 ['DCR-085','Customer Portal','Portal list and filter completion.','Improvement','P1','Work Order, Vehicle and Maintenance/Compliance filters expanded while remaining inside authorised scope.'],
 ['DCR-086','Customer Portal Security','Customer User permission administration ceiling.','Defect','P1','Prototype user administration shows role, Site scope, Finance, approval, Read Only and status, and prevents delegation beyond administrator scope/authority.']
];
K5.ensureRetest=function(s){if(!s)return s;s.defects=s.defects||[];K5.stage5RetestDcr.forEach(r=>{if(!s.defects.some(x=>x.id===r[0]))K5.addDcr(s,r,false)});let d=s.defects.find(x=>x.id==='DCR-078');if(d&&d.status!=='Agreed'){d.history=d.history||[];d.history.push({at:K5.iso(s),by:'System Build',from:d.status,to:'Agreed',note:'Restored as deferred Production Security Dependency per Stage 5 build control.'});d.status='Agreed'};(s.portalUsers||[]).forEach(u=>{u.permissions=u.permissions||[];u.finance=!!u.finance;u.readOnly=!!u.readOnly;u.status=u.status||'Active'});return s};
(function(){let s=K5.read();if(s){K5.ensureRetest(s);K5.write(s)}})();