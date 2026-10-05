/* Stage 5 shared Customer Portal data/configuration. Uses the same Kooner browser state as Operations/Desktop and Technician Mobile. */
window.K5=window.K5||{};
K5.key='koonerv1';
K5.now=function(state){let real=new Date(),ov=state?.settings?.testDateOverride;if(!ov)return real;let p=String(ov).split('-').map(Number);return new Date(p[0],p[1]-1,p[2],real.getHours(),real.getMinutes(),real.getSeconds(),real.getMilliseconds())};
K5.iso=state=>K5.now(state).toISOString();
K5.today=state=>{let x=K5.now(state);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
K5.read=()=>JSON.parse(localStorage.getItem(K5.key)||'null');
K5.write=s=>localStorage.setItem(K5.key,JSON.stringify(s));
K5.stage5Dcr=[
['DCR-054','Customer Portal','Customer Portal shell/dashboard and customer-facing navigation.','Improvement','P1','Customer Portal shell, dashboard, attention cards and responsive Kooner customer navigation added.'],
['DCR-055','Customer Portal Security','Customer/Site data isolation.','Defect','P1','All Portal retrieval/open/search helpers enforce Customer and Site scope before rendering records.'],
['DCR-056','Customer Portal Security','Customer user roles and data scopes.','Improvement','P1','Configurable prototype personas/roles with customer, site and permission scopes added.'],
['DCR-057','Customer Portal','Portal Search.','Improvement','P1','Scope-limited search added for registration, Work Order, PO/reference, Site and issued Invoice.'],
['DCR-058','Customer Portal','Vehicle list and customer Vehicle record.','Improvement','P1','Customer-facing Vehicle list/record with Overview, Work Orders, Maintenance, Compliance, Mileage, Documents, visible Defects and VOR history added.'],
['DCR-059','Customer Portal','Work Order list and customer Work Order record.','Improvement','P1','Active/Recently Completed/Historical views, filters and customer-safe Work Order record added.'],
['DCR-060','Customer Portal','Customer-facing status mapping.','Improvement','P1','Internal workflow status remains unchanged while customer-friendly status wording is mapped separately.'],
['DCR-061','Customer Portal','New Work Request.','Improvement','P1','Registration-led customer request flow creates a Kooner Portal Request/Draft for Operations triage without auto-dispatch.'],
['DCR-062','Customer Portal','Emergency/VOR telephone-first control.','Defect','P1','Urgent/unsafe/VOR request selections display telephone-first emergency warning while still allowing supporting information submission.'],
['DCR-063','Customer Portal','Duplicate customer request checking.','Defect','P1','Active Work Orders are checked before submission; customer can view existing, add information or confirm a separate requirement with reason.'],
['DCR-064','Customer Portal','Estimate view and controlled approval.','Improvement','P1','Current valid Estimate is clear, superseded history is retained, and Approve/Decline/Question updates the same Estimate approval history.'],
['DCR-065','Customer Portal','Customer communications.','Improvement','P1','Customer-visible Work Order communication thread supports messages and requested information without exposing Internal Only notes.'],
['DCR-066','Customer Portal','PO/reference updates.','Improvement','P1','Authorised PO/reference updates retain previous/new value, user, date/time and source audit.'],
['DCR-067','Customer Portal','Documents/evidence visibility.','Defect','P1','Documents/evidence are filtered by Customer Visible, Finance or scoped visibility rather than exposing all Technician evidence.'],
['DCR-068','Customer Portal','Billing/Invoice Portal.','Improvement','P1','Issued invoice list supports Work Order and consolidated/fixed-maintenance lines; Billing Review drafts remain hidden.'],
['DCR-069','Customer Portal','Maintenance/Compliance Portal.','Improvement','P1','Scope-limited maintenance/compliance view added using date-or-mileage due information already held in Kooner.'],
['DCR-070','Customer Portal','Customer mileage submission and validation.','Defect','P1','Portal mileage appends history with source/customer user; lower readings require reason, preserve both readings and create Operations review without reducing trusted mileage.'],
['DCR-071','Customer Portal','VOR customer visibility.','Improvement','P1','Customer can see VOR vehicle/status/current Work Order and request review without directly clearing Kooner VOR.'],
['DCR-072','Customer Portal','Customer notification preferences.','Improvement','P2','Prototype per-user notification event preferences and active/inactive controls added; no live messaging connection.'],
['DCR-073','Customer Portal','Customer user management.','Improvement','P2','Customer Administrator can manage prototype users for their own organisation only; production provisioning remains deferred.'],
['DCR-074','Customer Portal','Customer Data Change Request.','Improvement','P1','Controlled master-data corrections create Customer Data Change Requests for Operations Review instead of overwriting Kooner master data.'],
['DCR-075','Customer Portal','Customer Portal audit.','Improvement','P1','Portal actions write source-labelled audit records and Work Order audit where relevant.'],
['DCR-076','Customer Portal','Operations Customer Portal Action Queue.','Improvement','P1','Desktop queue surfaces Portal actions requiring Operations attention and links back to the relevant Kooner record.'],
['DCR-077','Customer Portal Security','Cross-customer isolation testing.','Defect','P1','Direct record open/search/manipulated parameter attempts outside Customer/Site scope return Access Denied without exposing restricted data.'],
['DCR-078','Customer Portal Security','Production Portal security dependencies.','Production Dependency','P1','Production authentication, MFA/SSO, secure sessions, server-side isolation, secure media access and production infrastructure remain deferred.']
];
K5.addDcr=function(s,row,deferred){s.defects=s.defects||[];if(s.defects.some(x=>x.id===row[0]))return;let at=K5.iso(s),[id,area,desc,type,priority,resolution]=row;s.defects.push({id,date:new Date(K5.now(s)).toLocaleDateString('en-GB'),area,desc,type,priority,status:deferred?'Agreed':'Ready to Test',resolution:deferred?'PRODUCTION DEPENDENCY – architecture preserved; deliberately deferred from Stage 5 browser prototype.':resolution,retest:deferred?'Not applicable until production implementation':'Pending Stage 5 customer retest',history:deferred?[{at,by:'System Build',from:'',to:'New',note:'Stage 5 production dependency logged.'},{at,by:'System Build',from:'New',to:'Agreed',note:'Deferred without weakening approved architecture.'}]:[{at,by:'System Build',from:'',to:'New',note:'Stage 5 requirement logged.'},{at,by:'System Build',from:'New',to:'Agreed',note:'Requirement confirmed.'},{at,by:'System Build',from:'Agreed',to:'Building',note:'Built into existing Kooner prototype.'},{at,by:'System Build',from:'Building',to:'Ready to Test',note:resolution}]})};
K5.ensure=function(s){if(!s)return s;
 s.portalUsers=s.portalUsers||[
  {id:'CU1',customer:'C1',name:'Alex Carter',email:'alex@testtransport.example',phone:'0121 555 0101',role:'Customer Administrator',sites:['S1','S2'],permissions:['vehicles','workorders','submit','estimates','approve','billing','invoices','mileage','notifications','users','po','documents','datachange'],finance:true,status:'Active'},
  {id:'CU2',customer:'C1',name:'Jordan Blake',email:'birmingham.manager@testtransport.example',phone:'0121 555 0110',role:'Site Manager',sites:['S1'],permissions:['vehicles','workorders','submit','estimates','mileage','notifications','po','documents','datachange'],finance:false,status:'Active'},
  {id:'CU3',customer:'C1',name:'Taylor Green',email:'bristol.manager@testtransport.example',phone:'0117 555 0111',role:'Site Manager',sites:['S2'],permissions:['vehicles','workorders','submit','estimates','mileage','notifications','po','documents','datachange'],finance:false,status:'Active'},
  {id:'CU4',customer:'C1',name:'Maya Lewis',email:'finance@testtransport.example',phone:'0121 555 0102',role:'Finance',sites:['S1','S2'],permissions:['vehicles','workorders','estimates','billing','invoices','documents','notifications'],finance:true,readOnly:true,status:'Active'},
  {id:'CU5',customer:'C2',name:'Sam Wilson',email:'sam@demologistics.example',phone:'0117 555 0201',role:'Customer Administrator',sites:['S3'],permissions:['vehicles','workorders','submit','estimates','approve','billing','invoices','mileage','notifications','users','po','documents','datachange'],finance:true,status:'Active'}
 ];
 s.portalSettings=s.portalSettings||{selectedUser:'CU1'};s.portalRequests=s.portalRequests||[];s.portalActions=s.portalActions||[];s.portalAudit=s.portalAudit||[];s.portalDataChangeRequests=s.portalDataChangeRequests||[];s.portalNotificationPrefs=s.portalNotificationPrefs||{};s.portalUserRequests=s.portalUserRequests||[];
 s.invoices=s.invoices||[];
 if(!s.invoices.some(x=>x.id==='INV-9001'))s.invoices.push({id:'INV-9001',customer:'C1',date:'2026-08-31',period:'2026-08',status:'Issued',type:'One Work Order',po:'PO-OLD',net:56.6,vat:11.32,gross:67.92,workOrders:['WO-10038'],lines:[{type:'Work Order',reference:'WO-10038',description:'Tyre repair and travel',amount:56.6}],document:'INV-9001-test.pdf'});
 if(!s.invoices.some(x=>x.id==='INV-9101'))s.invoices.push({id:'INV-9101',customer:'C1',date:'2026-09-30',period:'2026-09',status:'Issued',type:'Monthly Consolidated',po:'CONSOLIDATED-SEP',net:405,vat:81,gross:486,workOrders:[],lines:[{type:'Fixed Maintenance',reference:'FMP-C1-VEH',description:'Vehicle Maintenance Plan — test monthly charge',amount:225},{type:'Fixed Maintenance',reference:'FMP-C1-GRP',description:'Core Vans Group — test monthly charge',amount:180}],document:'INV-9101-test.pdf'});
 if(!s.invoices.some(x=>x.id==='INV-9201'))s.invoices.push({id:'INV-9201',customer:'C2',date:'2026-09-25',period:'2026-09',status:'Issued',type:'One Work Order',po:'PO-TEST-DEMO',net:142.5,vat:28.5,gross:171,workOrders:[],lines:[{type:'Reactive Repair',reference:'DEMO-SEP',description:'Issued test repair invoice',amount:142.5}],document:'INV-9201-test.pdf'});
 s.documents=s.documents||[];
 let docs=[
  {id:'DOC-P1',customer:'C1',site:'S1',vehicle:'V1',workOrder:'WO-10041',type:'Diagnostic report',name:'Brake diagnosis summary',visibility:'Customer Visible',date:'2026-10-03'},
  {id:'DOC-P2',customer:'C1',site:'S2',vehicle:'V2',workOrder:'WO-10042',type:'Estimate support',name:'Suspension estimate support',visibility:'Customer Visible',date:'2026-10-03'},
  {id:'DOC-P3',customer:'C1',type:'Invoice',invoice:'INV-9101',name:'September consolidated invoice',visibility:'Customer Finance Only',date:'2026-09-30'},
  {id:'DOC-I1',customer:'C1',vehicle:'V1',workOrder:'WO-10041',type:'Technician evidence',name:'Internal diagnostic scratch note',visibility:'Internal Kooner Only',date:'2026-10-03'}
 ];docs.forEach(x=>{if(!s.documents.some(d=>d.id===x.id))s.documents.push(x)});
 let w42=(s.wos||[]).find(w=>w.id==='WO-10042');if(w42&&w42.ests?.[0]&&w42.ests[0].versions.length===1){let cur=w42.ests[0].versions[0];w42.ests[0].versions.unshift({v:0,status:'Superseded',hrs:.6,rate:cur.rate||80,parts:25,markup:cur.markup||30,thirdCost:0,thirdMarkup:20,miles:0,mileageRate:.85,other:0,vat:20,scope:'Initial diagnostic repair scope — superseded',createdAt:'2026-10-03T09:55:00',approvalHistory:[]})}
 (s.wos||[]).forEach(w=>{w.communications=w.communications||[];if(!w.communications.some(x=>x.seedPortal)){w.communications.push({id:'COM-SEED-'+w.id,at:w.created,sender:'Kooner Operations',audience:'Customer',source:'Operations/Desktop',message:'Request received and logged by Kooner.',visibility:'Customer Visible',seedPortal:true})}w.evidence=w.evidence||[];});
 K5.stage5Dcr.forEach(r=>K5.addDcr(s,r,r[0]==='DCR-078'));
 return s;
};
(function(){let s;if(typeof S!=='undefined'){s=S;K5.ensure(s);if(typeof save==='function')save();else K5.write(s)}else{s=K5.read();if(s){K5.ensure(s);K5.write(s)}}})();
