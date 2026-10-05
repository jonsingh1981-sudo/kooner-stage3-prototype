/* Stage 3 final retest tidy-up: dynamic clock, billing periods, vehicle site moves, explicit maintenance-plan selection. Dashboard layout intentionally unchanged. */
window.K3=window.K3||{};

/* Central operational clock. Historical seeded data is never rewritten. */
S.settings=S.settings||{};
if(S.settings.recentCompletedDays==null)S.settings.recentCompletedDays=30;
K3.clock={
 actualNow:()=>new Date(),
 now:function(){
  let real=this.actualNow(),ov=S.settings.testDateOverride;
  if(!ov)return real;
  let p=String(ov).split('-').map(Number);
  return new Date(p[0],p[1]-1,p[2],real.getHours(),real.getMinutes(),real.getSeconds(),real.getMilliseconds());
 },
 today:function(){let x=this.now();return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`},
 period:function(){return this.today().slice(0,7)},
 isTestOverride:function(){return !!S.settings.testDateOverride}
};
try{delete K3.TODAY}catch(e){}
Object.defineProperty(K3,'TODAY',{configurable:true,get:()=>K3.clock.today()});
K3.now=()=>K3.clock.now();
K3.today=()=>K3.clock.today();
K3.currentPeriod=()=>K3.clock.period();
if(!S.settings.billingPeriod)S.settings.billingPeriod=K3.currentPeriod();

K3.isRecentComplete=function(w){
 if(w.status!=='Operationally Complete')return false;
 let at=K3.completedAt(w);if(!at)return false;
 let n=K3.clock.now(),end=new Date(n.getFullYear(),n.getMonth(),n.getDate(),23,59,59,999),start=new Date(end);
 start.setDate(start.getDate()-K3.recentDays());
 let x=new Date(at);return x>=start&&x<=end;
};
K3.isHistoricalComplete=function(w){return w.status==='Operationally Complete'&&!K3.isRecentComplete(w)};
K3.isOverdue=function(when){return !!when&&new Date(when)<K3.clock.now()};
K3.dateDue=function(date){if(!date)return false;let n=K3.clock.now(),dte=new Date(date+'T23:59:59');return dte<n};

window.dash=function(){let a=S.wos.filter(w=>!w.archive&&w.status!=='Operationally Complete'&&w.status!=='Cancelled'),ms=[['Open Work Orders',a.length,"openFiltered('','')"],['New / Pending Triage',S.wos.filter(w=>w.status==='Pending Triage').length,"openFiltered('Pending Triage','')"],['In Progress',S.wos.filter(w=>w.status==='In Progress').length,"openFiltered('In Progress','')"],['Awaiting Approval',S.wos.filter(w=>w.status==='Awaiting Approval').length,"openFiltered('Awaiting Approval','')"],['Awaiting Parts',S.wos.filter(w=>w.status==='Awaiting Parts').length,"openFiltered('Awaiting Parts','')"],['On Hold',S.wos.filter(w=>w.status==='On Hold').length,"openFiltered('On Hold','')"],['VOR',S.wos.filter(w=>w.vor&&w.status!=='Operationally Complete').length,"go('Work Orders')"],['Overdue Actions',S.wos.filter(w=>w.next!=='None'&&K3.isOverdue(w.due)).length,"go('Work Orders')"],['Complete awaiting Billing',S.wos.filter(w=>w.status==='Operationally Complete'&&w.fin==='Billing Review').length,"openFiltered('Operationally Complete','Billing Review')"],['Billing awaiting action',S.wos.filter(w=>['Billing Review','Validated','Ready to Invoice'].includes(w.fin)).length,"go('Billing')"]];let urgent=S.wos.filter(w=>!w.archive&&w.next!=='None').slice(0,6);content.innerHTML=`<h2>Operations Dashboard</h2><div class=sub>Live dummy/test overview for Kooner Operations.</div><div class="grid cards">${ms.map(m=>`<div class="card metric" onclick="${m[2]}"><div class=n>${m[1]}</div><div class=label>${m[0]}</div></div>`).join('')}</div><div class="grid two" style="margin-top:12px"><div class=card><h3>Current Owner / Next Action / Due</h3>${urgent.map(w=>`<div class=row><div><b>${w.id}</b><br><small>${V(w.v).reg} • ${C(w.c).name}</small></div><div><b>${w.owner}</b><br><small>${w.next}</small></div><div>${dt(w.due)}</div><div><button class="btn sm" onclick="openWO('${w.id}')">Open</button></div></div>`).join('')}</div><div class=card><h3>Billing awaiting action</h3>${S.wos.filter(w=>['Billing Review','Validated','Ready to Invoice'].includes(w.fin)).map(w=>`<div class=att><b>${w.id}</b> • ${V(w.v).reg}<br>${badge(w.fin)} <button class="btn sm" onclick="openWO('${w.id}')">Open</button></div>`).join('')||'<span class=muted>No test items.</span>'}</div></div>`};

window.maintenance=function(){content.innerHTML=`<h2>Maintenance</h2><div class=sub>Whichever is due first — date or mileage — controls the requirement.</div><div class="grid three">${S.vehicles.map(v=>`<div class=card><h3>${v.reg} ${badge(v.maint)}</h3><p>${v.make} ${v.model}<br>${C(v.c).name}</p><div class=summary><div class=sum><small>Current</small>${v.miles.toLocaleString()} mi</div><div class=sum><small>Next date</small>${d(v.nextD)}</div><div class=sum><small>Next mileage</small>${v.nextM.toLocaleString()} mi</div><div class=sum><small>Why due</small>${v.miles>=v.nextM?'Mileage':K3.dateDue(v.nextD)?'Date':'Forecast'}</div></div></div>`).join('')}</div>`};

K3.fixedMaintenanceFor=function(cid,period){
 period=period||S.settings.billingPeriod||K3.currentPeriod();
 let [yy,mm]=period.split('-').map(Number),dim=K3.daysInMonth(yy,mm),rows=[],total=0;
 for(let p of (S.fixedMaintenancePlans||[]).filter(x=>x.customer===cid&&x.status==='Active')){
  let ct=CT(p.contract);if(!ct.id)continue;
  for(let a of (p.coverageAssignments||[])){
   let vids=a.vehicle?[a.vehicle]:(a.vehicles||[]);
   for(let vid of vids){let amount=0,days=0,segments={};
    for(let day=1;day<=dim;day++){
     let ds=`${yy}-${String(mm).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
     if(!K3.activeOn(ct.from,ct.to,ds)||!K3.activeOn(a.from,a.to,ds))continue;
     let r=K3.rateForDay(p,ds);if(!r)continue;
     days++;let daily=(+r.monthly||0)/dim;amount+=daily;segments[r.version]=(segments[r.version]||0)+daily;
    }
    if(days){amount=Math.round(amount*100)/100;total+=amount;rows.push({plan:p,assignment:a,vehicle:V(vid),days,amount,segments})}
   }
  }
 }
 return{period,daysInMonth:dim,rows,total:Math.round(total*100)/100};
};
window.setBillingPeriod=function(v){if(!/^\d{4}-\d{2}$/.test(v))return;S.settings.billingPeriod=v;save();if(current==='Billing')billing();if(current==='Contracts')contracts()};

K3._billingPeriodBase=window.billing;
window.billing=function(){
 K3._billingPeriodBase();
 let bar=content.querySelector('.accountbar');
 if(bar&&!bar.querySelector('#billingPeriod')){
  let wrap=document.createElement('span');wrap.innerHTML=`<label><b>Billing Period:</b></label> <input id="billingPeriod" type="month" value="${S.settings.billingPeriod||K3.currentPeriod()}" onchange="setBillingPeriod(this.value)">`;
  let btn=bar.querySelector('button');bar.insertBefore(wrap,btn||null);
 }
 let card=[...content.querySelectorAll('.card')].find(x=>x.textContent.includes('Monthly Consolidated Billing Run'));
 if(card&&!card.querySelector('.period-rule-note'))card.insertAdjacentHTML('beforeend',`<div class="notice period-rule-note">Fixed maintenance uses <b>Plan → Coverage Assignment → Effective Rate Version → selected Billing Period</b>. October 2026 remains available as a test period, but is not embedded as permanent logic.</div>`);
};
window.consolidatedPreview=function(cid,period){
 let c=C(cid),p=period||document.querySelector('#billingPeriod')?.value||S.settings.billingPeriod||K3.currentPeriod();
 S.settings.billingPeriod=p;save();
 let eligible=S.wos.filter(w=>w.c===cid&&w.fin==='Ready to Invoice'&&w.bill);eligible.forEach(recalcBilling);
 let fm=K3.fixedMaintenanceFor(cid,p),fixed=fm.total,woNet=eligible.reduce((s,w)=>s+billtot(w.bill)[0],0),net=fixed+woNet,vat=net*.2;
 show(`<h3>Exact Invoice Preview — Monthly Consolidated</h3><div class="notice good">Billing Account isolation confirmed: ${c.name} only.</div><div class=att><b>Customer: ${c.name}</b><br>Billing Period: ${p}<br>Billing configuration: ${c.billing}<hr>${fm.rows.length?`<b>Fixed Maintenance Coverage Lines</b><br>${fm.rows.map(r=>`${r.plan.name} • ${r.vehicle.reg} • ${r.days}/${fm.daysInMonth} days: ${money(r.amount)}`).join('<br>')}<br><b>Fixed maintenance total: ${money(fixed)}</b><hr>`:''}${eligible.map(w=>`${w.id} / ${V(w.v).reg}: ${money(billtot(w.bill)[0])}`).join('<br>')||'No Ready-to-Invoice Work Orders for this customer'}<hr>Net ${money(net)}<br>VAT ${money(vat)}<br><b>Gross ${money(net+vat)}</b></div><div class=notice>Excluded: ${S.wos.filter(w=>w.c!==cid&&w.fin==='Ready to Invoice').length} Ready-to-Invoice Work Order(s) belonging to other customers.</div><div class=actions><button class=btn onclick=hide()>Close</button></div>`);
};

K3._contractsPeriodBase=window.contracts;
window.contracts=function(){
 K3._contractsPeriodBase();
 let selected=S.settings.billingPeriod||K3.currentPeriod(),fm=K3.fixedMaintenanceFor('C1',selected),oct=K3.fixedMaintenanceFor('C1','2026-10');
 content.insertAdjacentHTML('beforeend',`<div class=card style="margin-top:12px"><h3>Fixed Maintenance Billing Period Calculator</h3><div class=accountbar><label><b>Billing Period:</b></label><input type=month value="${selected}" onchange="setBillingPeriod(this.value)"><span class=muted>Selected period drives coverage/rate/pro-rata calculation.</span></div><div class=pricing-box><b>${selected} calculated charge: ${money(fm.total)}</b>${fm.rows.map(r=>`<div class=historyline>${r.plan.name} • ${r.vehicle.reg} • ${r.days}/${fm.daysInMonth} days • ${money(r.amount)}</div>`).join('')||'<div class=historyline>No covered assignments in this period.</div>'}</div><div class=notice><b>Preserved regression example:</b> October 2026 = ${money(oct.total)} (expected £492.10 from the seeded test coverage).</div></div>`);
};
