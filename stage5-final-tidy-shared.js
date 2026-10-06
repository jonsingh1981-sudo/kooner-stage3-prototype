/* Stage 5 final approval tidy-up: fail-closed document/invoice scope + DCR-087/088 + test data. */
window.K5=window.K5||{};
K5.stage5FinalTidyDcr=[
 ['DCR-087','Customer Portal Security','Specific Document / Invoice Scope Fail-Closed Control.','Defect','P1','Specific Site/User Role documents now require configured Site/Role/User scope and Site-scoped invoice access fails closed when invoice Site scope cannot be established.'],
 ['DCR-088','Operations / Customer Portal','Emergency/VOR Triage Continuity.','Defect','P1','Emergency/VOR acknowledgement outcomes now preserve triage unless the request is converted into operational work or deliberately closed with an authorised reason.']
];
K5.invoiceSites=function(s,inv){let sites=new Set();if(inv&&inv.site)sites.add(inv.site);(inv?.sites||[]).forEach(x=>x&&sites.add(x));(inv?.workOrders||[]).forEach(id=>{let w=(s.wos||[]).find(x=>x.id===id);if(w?.s)sites.add(w.s)});(inv?.lines||[]).forEach(l=>{if(l.site)sites.add(l.site);if(l.workOrder){let w=(s.wos||[]).find(x=>x.id===l.workOrder);if(w?.s)sites.add(w.s)}if(l.vehicle){let v=(s.vehicles||[]).find(x=>x.id===l.vehicle);if(v?.s)sites.add(v.s)}if(l.reference){let w=(s.wos||[]).find(x=>x.id===l.reference);if(w?.s)sites.add(w.s);let v=(s.vehicles||[]).find(x=>x.id===l.reference||x.reg===l.reference);if(v?.s)sites.add(v.s)}});return[...sites]};
K5._portalAuthPreFinal=K5._portalAuthPreFinal||K5.portalAuth;
K5.portalAuth=function(s,userId,action,ctx){ctx=ctx||{};let base=K5._portalAuthPreFinal(s,userId,action,ctx);if(!base.ok)return base;let u=base.user||(s.portalUsers||[]).find(x=>x.id===userId);if(!u)return{ok:false,reason:'User unavailable'};
 if(action==='openInvoice'){
  let inv=(s.invoices||[]).find(x=>x.id===ctx.invoiceId);if(!inv||inv.status!=='Issued'||inv.customer!==u.customer)return{ok:false,reason:'Invoice scope'};
  let full=K5.customerLevelFinance(s,u),sites=K5.invoiceSites(s,inv);
  if(!full&&!sites.length)return{ok:false,reason:'Invoice Site scope cannot be established'};
  if(!full&&sites.some(id=>!(u.sites||[]).includes(id)))return{ok:false,reason:'Invoice includes unauthorised Site data'};
  if(!full&&inv.type&&/consolidated|monthly|weekly/i.test(inv.type))return{ok:false,reason:'Customer-level Finance required for consolidated invoice'};
 }
 if(action==='openDocument'){
  let d=(s.documents||[]).find(x=>x.id===ctx.documentId);if(!d||d.customer!==u.customer)return{ok:false,reason:'Document scope'};
  if(d.visibility==='Internal Kooner Only')return{ok:false,reason:'Internal Kooner Only'};
  if(d.visibility==='Specific Site/User Role'){
   let allowedSites=Array.isArray(d.allowedSites)?d.allowedSites.filter(Boolean):[],allowedRoles=Array.isArray(d.allowedRoles)?d.allowedRoles.filter(Boolean):[],allowedUsers=Array.isArray(d.allowedUsers)?d.allowedUsers.filter(Boolean):[];
   if(!allowedSites.length&&!allowedRoles.length&&!allowedUsers.length)return{ok:false,reason:'Specific document scope is not configured'};
   if(allowedSites.length&&!allowedSites.some(id=>(u.sites||[]).includes(id)))return{ok:false,reason:'Specific document Site scope'};
   if(allowedRoles.length&&!allowedRoles.includes(u.role))return{ok:false,reason:'Specific document Role scope'};
   if(allowedUsers.length&&!allowedUsers.includes(u.id))return{ok:false,reason:'Specific document User scope'};
  }
 }
 return base;
};
K5.ensureFinalTidy=function(s){if(!s)return s;s.defects=s.defects||[];K5.stage5FinalTidyDcr.forEach(r=>{if(!s.defects.some(x=>x.id===r[0]))K5.addDcr(s,r,false)});let d78=s.defects.find(x=>x.id==='DCR-078');if(d78){d78.status='Agreed';d78.deferred=true;d78.dependency='Production Security Dependency';d78.displayStatus='Agreed / Deferred – Production Security Dependency';d78.resolution='DEFERRED – Production Security Dependency. Production authentication, MFA/SSO, secure sessions, server-side Customer isolation and secure media access remain later production work.'}
 s.portalUsers=s.portalUsers||[];if(!s.portalUsers.some(x=>x.id==='CU6'))s.portalUsers.push({id:'CU6',customer:'C1',name:'Birmingham Finance Tester',email:'birmingham.finance@testtransport.example',phone:'0121 555 0112',role:'Finance',sites:['S1'],permissions:['vehicles','workorders','estimates','billing','invoices','documents','notifications'],finance:true,readOnly:true,status:'Active'});
 s.documents=s.documents||[];let docs=[
  {id:'DOC-TEST-CUST-S1',customer:'C1',site:'S1',vehicle:'V1',workOrder:'WO-10041',type:'Completion evidence',name:'Customer visible test document',visibility:'Customer Visible',date:'2026-10-03'},
  {id:'DOC-TEST-FIN-S1',customer:'C1',site:'S1',vehicle:'V1',workOrder:'WO-10041',type:'Finance document',name:'Finance only test document',visibility:'Customer Finance Only',date:'2026-10-03'},
  {id:'DOC-TEST-SPEC-S1',customer:'C1',site:'S1',vehicle:'V1',workOrder:'WO-10041',type:'Scoped site document',name:'Birmingham Site Manager scoped document',visibility:'Specific Site/User Role',allowedSites:['S1'],allowedRoles:['Site Manager'],allowedUsers:[],date:'2026-10-03'},
  {id:'DOC-TEST-INT-S1',customer:'C1',site:'S1',vehicle:'V1',workOrder:'WO-10041',type:'Internal evidence',name:'Internal only test document',visibility:'Internal Kooner Only',date:'2026-10-03'}
 ];docs.forEach(x=>{if(!s.documents.some(d=>d.id===x.id))s.documents.push(x)});
 s.invoices=s.invoices||[];if(!s.invoices.some(x=>x.id==='INV-9301'))s.invoices.push({id:'INV-9301',customer:'C1',site:'S1',date:'2026-10-03',period:'2026-10',status:'Issued',type:'One Work Order',po:'PO-S1-TEST',net:120,vat:24,gross:144,workOrders:['WO-10041'],lines:[{type:'Work Order',workOrder:'WO-10041',reference:'WO-10041',description:'Birmingham site-specific test invoice',amount:120}],document:'INV-9301-test.pdf'});
 let inv9101=s.invoices.find(x=>x.id==='INV-9101');if(inv9101){inv9101.customerWide=true;inv9101.scopeLabel='Customer-wide consolidated invoice'}
 return s};
(function(){let s=K5.read();if(s){K5.ensureFinalTidy(K5.ensureRetest(K5.ensure(s)));K5.write(s)}})();