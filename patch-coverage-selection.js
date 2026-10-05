/* Explicit fixed-maintenance plan selection during onboarding. */
K3.validCoveragePlans=function(cid,contractId,effectiveDate){
 if(!cid||!contractId)return[];let day=effectiveDate||K3.today();
 return (S.fixedMaintenancePlans||[]).filter(p=>p.customer===cid&&p.contract===contractId&&p.status==='Active'&&(!p.from||p.from<=day)&&(!p.to||p.to>=day));
};
K3._renderVehicleWizardCoverageBase=window.renderVehicleWizard;
window.renderVehicleWizard=function(){
 K3._renderVehicleWizardCoverageBase();let x=K3.vehicleDraft;
 if(K3.vehicleStep===5){
  let ct=document.getElementById('avcontract'),cov=document.getElementById('avcoverage');
  if(ct){ct.onchange=()=>refreshVehicleCoverageOptions();}
  if(cov){
   let parent=cov.closest('.f');if(parent)parent.querySelector('label').textContent='Fixed Maintenance Plan / Coverage Assignment';
   cov.insertAdjacentHTML('afterend',`<div class=tiny style="margin-top:6px">Select the actual Plan / Group / Fleet coverage. No automatic first-match assignment is permitted.</div><div class=f style="margin-top:8px"><label>Coverage Effective From</label><input id=avcoveragefrom type=date value="${x.coverageFrom||x.siteFrom||K3.today()}" onchange="refreshVehicleCoverageOptions()"></div>`);
   refreshVehicleCoverageOptions();
  }
 }
 if(K3.vehicleStep===6){let p=(S.fixedMaintenancePlans||[]).find(q=>q.id===x.coveragePlanId),r=p?K3.rateForDay(p,x.coverageFrom||x.siteFrom||K3.today()):null;let box=document.querySelector('#modalbox .notice');if(box)box.insertAdjacentHTML('beforebegin',`<div class=pricing-box><b>Selected Coverage:</b> ${p?p.name:'None'}<br><small>${p?`${p.scope}${p.group?' / '+p.group:''} • Plan ${p.id} • Effective ${d(x.coverageFrom)} • Rate ${r?r.version+' '+money(r.monthly)+'/month':'No rate on effective date'}`:'No fixed-maintenance coverage selected.'}</small></div>`)}
};
window.refreshVehicleCoverageOptions=function(){
 let x=K3.vehicleDraft,ct=document.getElementById('avcontract'),cov=document.getElementById('avcoverage'),from=document.getElementById('avcoveragefrom');if(!cov)return;
 let contractId=ct?ct.value:x.contract,effective=from?from.value:(x.coverageFrom||x.siteFrom||K3.today()),plans=K3.validCoveragePlans(x.customer,contractId,effective);
 cov.innerHTML='<option value="">None</option>'+plans.map(p=>{let r=K3.rateForDay(p,effective),label=`${p.name} — ${p.scope}${p.group?' / '+p.group:''}${r?' — '+r.version+' '+money(r.monthly)+'/month':''}`;return `<option value="${p.id}" ${x.coveragePlanId===p.id?'selected':''}>${label}</option>`}).join('');
};
K3._captureVehicleStepExplicitBase=K3.captureVehicleStep;
K3.captureVehicleStep=function(){
 if(K3.vehicleStep!==5)return K3._captureVehicleStepExplicitBase();
 let x=K3.vehicleDraft,contract=avcontract.value,planId=avcoverage.value,from=(document.getElementById('avcoveragefrom')?.value||x.siteFrom||K3.today());
 x.contract=contract;x.coveragePlanId=planId||'';x.coverageFrom=from;
 if(planId){let p=(S.fixedMaintenancePlans||[]).find(q=>q.id===planId);if(!p||p.customer!==x.customer||p.contract!==contract)return'Selected coverage plan is not valid for this Customer / Contract.';let r=K3.rateForDay(p,from);if(!r)return'No effective rate exists for the selected coverage plan on that date.';x.coverage=p.name;x.coverageRateVersionId=r.id;x.coverageRateVersion=r.version;x.coverageMonthlyRate=r.monthly;}else{x.coverage='None';x.coverageRateVersionId='';x.coverageRateVersion='';x.coverageMonthlyRate=0;}
 return null;
};
K3._saveNewVehicleExplicitBase=window.saveNewVehicle;
window.saveNewVehicle=function(){
 let x=K3.vehicleDraft,planId=x.coveragePlanId,coverageName=x.coverage,coverageFrom=x.coverageFrom,rateId=x.coverageRateVersionId,rateVersion=x.coverageRateVersion,monthly=x.coverageMonthlyRate;
 x.coverage='None';K3._saveNewVehicleExplicitBase();let v=S.vehicles.find(q=>q.reg.replace(/\s/g,'').toUpperCase()===String(x.reg||'').replace(/\s/g,'').toUpperCase());if(!v)return;
 if(planId){let p=(S.fixedMaintenancePlans||[]).find(q=>q.id===planId);if(p){let aid='FCA-'+Date.now().toString().slice(-6);let a={id:aid,vehicle:v.id,from:coverageFrom||K3.today(),to:null,note:'Explicitly selected during vehicle onboarding',rateVersionAtAssignment:rateId};p.coverageAssignments.push(a);Object.assign(v,{coverage:coverageName,coveragePlanId:planId,coverageAssignmentId:aid,coverageEffectiveFrom:a.from,coverageRateVersionId:rateId,coverageRateVersion:rateVersion,coverageMonthlyRate:monthly});v.audit=v.audit||[];v.audit.push({at:new Date().toISOString(),by:'Operations Test User',action:'Fixed Maintenance coverage assigned',planId,assignmentId:aid,effectiveFrom:a.from,rateVersionId:rateId,reason:'Explicit vehicle onboarding selection'});save();}}
};
