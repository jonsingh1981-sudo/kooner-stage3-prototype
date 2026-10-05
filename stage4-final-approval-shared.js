/* Stage 4 final approval corrections — DCR-052/053. */
window.K4=window.K4||{};
(function(){
  if(typeof S==='undefined')return;
  S.defects=S.defects||[];
  const items=[
    ['DCR-052','Technician Mobile / Billing','Technician Actual Time to Billing Labour Review','Defect','P1','Actual Technician Mobile time now creates a commercial Labour Review line. SRT/Expected Time, Actual Technician Time and Customer Billable Labour remain separate. Customer/Contract Pricing Rules propose normal billable treatment; Operations/Billing can approve or override billable time with reason/audit. Final Billing labour uses the approved commercial decision, never the legacy technician billable flag.'],
    ['DCR-053','Technician Mobile / Sync','Failed/Conflict Sync Resolution & Operations Review','Defect','P1','Failed sync items now support Retry, Discard Device Change and Refer to Operations. Conflict/failed referrals create a Desktop Mobile Sync / Conflict Review queue containing event/device/server details. Final Operations resolution requires a reason/audit and never silently overwrites authoritative server data.']
  ];
  const now=()=>window.K4&&K4.iso?K4.iso():new Date().toISOString();
  const date=()=>new Date(window.K4&&K4.now?K4.now():new Date()).toLocaleDateString('en-GB');
  items.forEach(([id,area,desc,type,priority,resolution])=>{
    if(S.defects.some(x=>x.id===id))return;
    const at=now();
    S.defects.push({id,date:date(),area,desc,type,priority,status:'Ready to Test',resolution,retest:'Pending Stage 4 final approval retest',history:[
      {at,by:'System Build',from:'',to:'New',note:'Stage 4 final approval correction logged.'},
      {at,by:'System Build',from:'New',to:'Agreed',note:'Correction accepted for build.'},
      {at,by:'System Build',from:'Agreed',to:'Building',note:'Implemented in existing Kooner prototype.'},
      {at,by:'System Build',from:'Building',to:'Ready to Test',note:resolution}
    ]});
  });
  if(typeof persist==='function')persist();else localStorage.setItem('koonerv1',JSON.stringify(S));
})();
