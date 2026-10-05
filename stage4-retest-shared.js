/* Stage 4 technician retest corrections — shared DCR entries only. */
window.K4=window.K4||{};
K4.retestDcrItems=[
 ['DCR-046','Technician Mobile','Offline authoritative-state separation and conflict handling.','Defect','P1','Offline technician changes now remain in device state and Pending Sync until accepted by the authoritative Kooner state. Failed/Conflict events do not alter Operations data; conflicts provide Review / Retry / Discard / Operations Review controls.'],
 ['DCR-047','Technician Mobile','Technician journey completion gate.','Defect','P1','Attendance completion now validates the applicable workflow journey. Standard onsite work requires Accepted, En Route where applicable, On Site, registration confirmation, safety pass and Work Started; Workshop/Remote Support use type-aware rules and exceptions use controlled routes.'],
 ['DCR-048','Technician Mobile','Task Completion Rule and evidence enforcement.','Defect','P1','Task completion now runs configurable Completion Rules for required answers, findings, measurements, mileage/diagnosis fields and task-specific evidence. Missing requirements block completion and are shown clearly.'],
 ['DCR-049','Technician Mobile','Actual technician time must remain separate from customer billability.','Defect','P1','Technicians record activity/start/end/duration/task only. Final customer chargeability remains controlled by Pricing Rules/Operations; technicians can flag Chargeability Review Required with a reason but cannot set final billable labour.'],
 ['DCR-050','Technician Mobile','My Day must use the selected operational date.','Defect','P1','My Day now filters Attendances using the central Kooner System Date/Clock and separates Current Job, Next Job, Today’s Remaining Jobs and Today’s Completed Jobs. Future/historical work no longer inflates today.'],
 ['DCR-051','Technician Mobile','Technician mileage validation and append-only history.','Defect','P1','Technician mileage entries append a source/time/technician/WO/Attendance record. Lower readings require an explanation, remain preserved for review and never silently reduce the current trusted Kooner mileage.']
];
K4.retestDcrItems.forEach(item=>{if(typeof K4.addDcr==='function')K4.addDcr(item,true)});
if(typeof K4.save==='function')K4.save();
