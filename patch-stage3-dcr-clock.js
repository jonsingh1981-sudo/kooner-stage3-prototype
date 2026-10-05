/* Controlled Test Date Override — clearly test configuration only. */
window.setTestDateOverride=function(v){S.settings.testDateOverride=v||'';S.settings.billingPeriod=S.settings.billingPeriod||K3.currentPeriod();save();if(current==='Admin / Settings')admin();else render()};
K3._adminClockBase=window.admin;
window.admin=function(){
 K3._adminClockBase();let actual=K3.clock.actualNow(),effective=K3.clock.now(),ov=K3.clock.isTestOverride();
 content.insertAdjacentHTML('afterbegin',`<div class=card style="margin-bottom:12px"><h3>System Date / Clock</h3><div class="notice ${ov?'bad':'good'}"><b>${ov?'TEST DATE OVERRIDE ACTIVE':'Actual system clock in use'}</b><br>Actual browser/system time: ${K3.dt(actual.toISOString())}<br>Operational date/time: ${K3.dt(effective.toISOString())}</div><div class=accountbar><label><b>Test Date Override:</b></label><input type=date value="${S.settings.testDateOverride||''}" onchange="setTestDateOverride(this.value)"><button class=btn onclick="setTestDateOverride('')">Clear Override</button><span class=muted>Prototype test configuration only. Historical seeded dates are not changed.</span></div></div>`);
};

K3.finalTidyItems=[
 ['DCR-030','System Clock','Remove hard-coded operational system date and route date logic through a central System Date / Clock helper.','Defect','P1','Central clock now uses the actual browser/system date-time by default, with a clearly labelled optional Test Date Override. Recent completion, default shift/onboarding dates and operational date checks use it.'],
 ['DCR-031','Billing','Billing Run / Fixed Maintenance period must be selected rather than permanently hard-coded to October 2026.','Defect','P1','Billing Period selector added. Fixed maintenance and consolidated billing now calculate from the selected YYYY-MM period while retaining October 2026 as regression test data.'],
 ['DCR-032','Vehicle Management','Add controlled Change / Move Home Site action for existing vehicles.','Improvement','P1','Vehicle Site Move now closes the previous Site Assignment, creates a new effective-dated current assignment, updates Home Site and records full audit details.'],
 ['DCR-033','Fixed Maintenance','Vehicle onboarding must explicitly select the actual Fixed Maintenance Plan / Group / Fleet coverage rather than the first matching plan.','Defect','P1','After Contract selection, onboarding shows only valid actual coverage plans plus None and stores Plan ID, Assignment ID, effective date and effective rate relationship.']
];
K3.finalTidyItems.forEach(item=>K3.addDefectWithJourney(item));
save();
render();K3.stripSeconds();
