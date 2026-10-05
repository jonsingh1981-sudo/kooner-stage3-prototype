/* Stage 4 Technician Mobile shared-state additions. Same localStorage/data model as Operations/Desktop. */
window.K4=window.K4||{};
K4.storageKey='koonerv1';
K4.now=function(){
  if(window.K3&&K3.clock)return K3.clock.now();
  let real=new Date(),ov=(typeof S!=='undefined'&&S.settings&&S.settings.testDateOverride)||null;
  if(!ov)return real;
  let p=String(ov).split('-').map(Number);return new Date(p[0],p[1]-1,p[2],real.getHours(),real.getMinutes(),real.getSeconds(),real.getMilliseconds());
};
K4.today=function(){let x=K4.now();return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
K4.iso=()=>K4.now().toISOString();
K4.save=function(){if(typeof save==='function')save();else if(typeof S!=='undefined')localStorage.setItem(K4.storageKey,JSON.stringify(S));};
K4.by=(a,id)=>(a||[]).find(x=>x.id===id)||{};
K4.dcrItems=[
 ['DCR-034','Technician Mobile','Mobile-first Technician shell, simulated technician login and My Day workflow.','Improvement','P1','Mobile-first Technician interface added with test technician selector, My Day, assigned work, current/next/completed job visibility and restricted technician view.'],
 ['DCR-035','Technician Mobile','Assigned Attendance accept/reject and technician status journey.','Improvement','P1','Accept/Reject with controlled reasons plus Accepted, En Route, Arrived, In Progress and Completed Attendance status flow added.'],
 ['DCR-036','Technician Mobile','Registration-led arrival, site/access and configurable safety workflow.','Improvement','P1','Registration confirmation, vehicle mismatch escalation, prominent site/access information and dynamic risk/Unsafe to Proceed flow added.'],
 ['DCR-037','Technician Mobile','Task workflow and job-specific evidence capture.','Improvement','P1','Task cards use existing Work Order/Task data, show SRT separately from actual time and support task outcomes plus evidence metadata/photo placeholders.'],
 ['DCR-038','Technician Mobile','Labour/time tracking and multiple-technician Attendance support.','Improvement','P1','Per-technician activity timers and Labour/Time Entries added; multiple technicians on one Attendance remain distinguishable.'],
 ['DCR-039','Technician Mobile','Diagnosis, additional defects and VOR recommendations.','Improvement','P1','Technician diagnosis, additional requirement/defect capture and controlled roadworthiness/VOR recommendations added without silently creating unrelated Work Orders.'],
 ['DCR-040','Technician Mobile','Technician Estimate preparation using Customer/Contract Pricing Rules.','Improvement','P1','Mobile estimate drafting/submission uses existing effective Pricing Rules and SRT; technicians can see approval state but cannot mark Customer Approved.'],
 ['DCR-041','Technician Mobile','Parts, Parts Run, Return Visit and Remote Support under the master Work Order.','Improvement','P1','Parts activity and follow-on Attendance creation added beneath the same Work Order, including chargeability and outcome fields.'],
 ['DCR-042','Technician Mobile','Attendance completion gate and exception/escalation outcomes.','Improvement','P1','Attendance can complete while Work Order remains open; blockers drive Current Owner/Next Action. Operational Completion occurs only when required Tasks are terminal.'],
 ['DCR-043','Technician Mobile','Offline-first/synchronisation simulation.','Improvement','P1','Offline toggle, unique device events, Pending Sync/Synced/Failed/Conflict states and manual sync simulation added while preserving production offline architecture.'],
 ['DCR-044','Technician Mobile','Operations visibility and shared audit/state.','Improvement','P1','Technician actions update the same Work Orders, Attendances, Tasks and Audit History used by Desktop; cross-tab storage refresh is supported.']
];
K4.dependency=['DCR-045','Technician Mobile','Production mobile dependencies: authentication/MFA, secure device cache/database, production media storage, push notifications and app-store deployment.','Production Dependency','P2'];
K4.addDcr=function(item,ready=true){
  if(typeof S==='undefined')return;S.defects=S.defects||[];let[id,area,desc,type,priority,resolution]=item;if(S.defects.some(x=>x.id===id))return;let at=K4.iso();
  if(ready)S.defects.push({id,date:new Date(K4.now()).toLocaleDateString('en-GB'),area,desc,type,priority,status:'Ready to Test',resolution,retest:'Pending Stage 4 technician retest',history:[{at,by:'System Build',from:'',to:'New',note:'Stage 4 requirement logged.'},{at,by:'System Build',from:'New',to:'Agreed',note:'Requirement confirmed.'},{at,by:'System Build',from:'Agreed',to:'Building',note:'Built into existing Kooner prototype.'},{at,by:'System Build',from:'Building',to:'Ready to Test',note:resolution}]});
  else S.defects.push({id,date:new Date(K4.now()).toLocaleDateString('en-GB'),area,desc,type,priority,status:'Agreed',resolution:'PRODUCTION DEPENDENCY – simulated or deliberately deferred in Stage 4 browser prototype.',retest:'Not applicable until production implementation',history:[{at,by:'System Build',from:'',to:'New',note:'Production dependency logged.'},{at,by:'System Build',from:'New',to:'Agreed',note:'Preserved for later production implementation.'}]});
};
K4.ensureScenarioData=function(){
  if(typeof S==='undefined')return;S.mobileSyncQueue=S.mobileSyncQueue||[];S.mobileDevice=S.mobileDevice||{id:'KOONER-MOBILE-TEST-01',online:true};S.mobileSettings=S.mobileSettings||{selectedTech:'T1'};
  K4.dcrItems.forEach(x=>K4.addDcr(x,true));K4.addDcr(K4.dependency,false);
  let w41=K4.by(S.wos,'WO-10041');if(w41.id){w41.evidence=w41.evidence||[];w41.additionalRequirements=w41.additionalRequirements||[];w41.notifications=w41.notifications||[];if(!(w41.att||[]).some(a=>a.id==='MOB-A41'))w41.att.push({id:'MOB-A41',type:'Diagnosis',status:'Dispatched',tech:['T1'],plan:K4.today()+'T09:00:00',arr:'',dep:'',travel:0,miles:0,charge:'Included',out:'',lab:[],timeEntries:[],mobileDemo:true,syncStatus:'Synced'});if(!(w41.tasks||[]).some(t=>t.id==='MOB-TK41'))w41.tasks.push({id:'MOB-TK41',desc:'Confirm brake fault and rear caliper condition',type:'Diagnosis',status:'Not Started',srt:.5,actual:0,out:'',op:'SRT-DIAG',mobileDemo:true,required:true});}
  let w42=K4.by(S.wos,'WO-10042');if(w42.id){w42.evidence=w42.evidence||[];w42.additionalRequirements=w42.additionalRequirements||[];w42.notifications=w42.notifications||[];if(!(w42.att||[]).some(a=>a.id==='MOB-A42'))w42.att.push({id:'MOB-A42',type:'Estimate Follow-up',status:'Dispatched',tech:['T2'],plan:K4.today()+'T10:30:00',arr:'',dep:'',travel:0,miles:0,charge:'Included',out:'',lab:[],timeEntries:[],mobileDemo:true,syncStatus:'Synced'});}
  let w43=K4.by(S.wos,'WO-10043');if(w43.id){w43.evidence=w43.evidence||[];w43.additionalRequirements=w43.additionalRequirements||[];w43.notifications=w43.notifications||[];let a=(w43.att||[]).find(x=>x.id==='A3');if(a&&a.status==='Planned'){a.status='Dispatched';a.mobileDemo=true}w43.tasks.forEach(t=>{if(t.id==='TK5'&&!t.op)t.op='SRT-SVC-ANN'});}
  if(!K4.by(S.wos,'WO-10045').id){S.wos.push({id:'WO-10045',v:'V4',c:'C2',ct:'CT2',s:'S3',loc:'Coventry Hub — Bay 14',caller:'Sam Wilson',driver:'Demo Driver',sitec:'Transport Office',update:'Sam Wilson',auth:'Sam Wilson',fault:'Number plate lamp inoperative',cat:'Repair',pri:'Normal',safe:'Vehicle parked safely in depot',vor:false,po:'PO-MOB-0045',access:'Check in at Transport Office',status:'Dispatched',fin:'Not Started',owner:'Technician',next:'Attend and repair number plate lamp',due:K4.today()+'T14:00:00',created:K4.iso(),archive:false,att:[{id:'MOB-A45',type:'Repair',status:'Dispatched',tech:['T1'],plan:K4.today()+'T13:00:00',arr:'',dep:'',travel:0,miles:0,charge:'Chargeable',out:'',lab:[],timeEntries:[],mobileDemo:true,syncStatus:'Synced'}],tasks:[{id:'MOB-TK45',desc:'Replace number plate lamp',type:'Repair',status:'Not Started',srt:.4,actual:0,out:'',op:'SRT-LAMP',required:true,mobileDemo:true}],ests:[],parts:[['Number plate lamp','TEST-NPL-01','Available',1,7.5,'Demo Supplier']],evidence:[],additionalRequirements:[],notifications:[],audit:[[K4.iso(),'System Build','Stage 4 mobile test Work Order created','Scenario D — repair completion test']]});}
  S.wos.forEach(w=>{w.evidence=w.evidence||[];w.additionalRequirements=w.additionalRequirements||[];w.notifications=w.notifications||[];(w.att||[]).forEach(a=>{a.timeEntries=a.timeEntries||[];a.safety=a.safety||null;a.vehicleConfirmation=a.vehicleConfirmation||null})});
  K4.save();
};
K4.ensureScenarioData();
