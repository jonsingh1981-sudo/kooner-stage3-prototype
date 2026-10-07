-- Stage 6 UAT: record DCR-120 manual journey progress and DCR-122 BEFORE correction.
-- DCR-119 remains recorded only / not authorised for build.
DO $$
DECLARE
  d RECORD;
  old_status TEXT;
BEGIN
  SELECT id,status INTO d FROM dcr_items WHERE dcr_ref='DCR-121' FOR UPDATE;
  IF d.id IS NULL OR d.status <> 'Completed' THEN RAISE EXCEPTION 'DCR-121 must remain Completed'; END IF;

  SELECT id,status INTO d FROM dcr_items WHERE dcr_ref='DCR-120' FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'DCR-120 missing'; END IF;
  old_status:=d.status;
  UPDATE dcr_items SET
    status='Manual UAT in progress – blocked at Registration Verification by DCR-122',
    retest_result='Manual journey PASS on WO-10046 / AB26 CDE: ACCEPT JOB persisted/stayed on job and advanced to START TRAVEL; START TRAVEL / EN ROUTE persisted/stayed on job and advanced to ARRIVED ON SITE; ARRIVED ON SITE persisted/stayed on job and advanced to CONFIRM REGISTRATION. Manual UAT stopped before confirming registration because the registration input was pre-populated, which does not provide genuine physical vehicle verification. Blocked by DCR-122.',
    updated_at=now()
  WHERE id=d.id;
  IF old_status IS DISTINCT FROM 'Manual UAT in progress – blocked at Registration Verification by DCR-122' THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d.id,old_status,'Manual UAT in progress – blocked at Registration Verification by DCR-122','Jon manually passed Accept, Start Travel / En Route and Arrived On Site on WO-10046 / AB26 CDE. Testing stopped at Confirm Registration before submission because the field was pre-populated.','Jon – Stage 6 UAT');
  END IF;

  SELECT id,status INTO d FROM dcr_items WHERE dcr_ref='DCR-117' FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'DCR-117 missing'; END IF;
  UPDATE dcr_items SET
    status='Ready to Test – dependent on corrected Technician journey',
    retest_result='DCR-117 remains open. DCR-120 guided journey has manually passed Accept, Travel and Arrived On Site but is blocked at Registration Verification by DCR-122.',
    updated_at=now()
  WHERE id=d.id;

  IF NOT EXISTS (SELECT 1 FROM dcr_items WHERE dcr_ref='DCR-119' AND status='Agreed – Awaiting Build') THEN
    RAISE EXCEPTION 'DCR-119 must remain Agreed – Awaiting Build / NOT built';
  END IF;

  SELECT id,status INTO d FROM dcr_items WHERE dcr_ref='DCR-122' FOR UPDATE;
  IF d.id IS NULL THEN
    INSERT INTO dcr_items(dcr_ref,area,description,item_type,priority,status,resolution,retest_result,deferred)
    VALUES(
      'DCR-122',
      'Technician Mobile / Vehicle Verification / Evidence Integrity',
      'Blocking DCR-120 UAT defect. At CONFIRM REGISTRATION the Technician must be asked to look at the physical vehicle and manually type the registration into a blank field. The Stage 6 server must normalise spaces/case and compare the typed value with the authoritative Work Order vehicle registration. A match must persist confirmed registration, Technician/user, date/time, Attendance linkage and audit, remain on the same job and advance to the next valid journey action. A mismatch must require a reason, must not permit Start Work, must flag Operations, must retain the original Work Order vehicle registration unchanged and must be audited. Where the existing Customer / Contract / Workflow / Task evidence configuration requires Registration evidence, only active server-confirmed media may satisfy the requirement; failed/local-only/removed media must not count and FINISH JOB must remain blocked. No universal registration photo requirement is to be introduced.',
      'UAT Defect / Vehicle Verification Integrity',
      'Blocking',
      'Blocking DCR-120 Manual UAT – Build Required',
      'Pre-build finding: the Stage 4 vehicleConfirmModal pre-populates vcReg with the authoritative registration and also displays that registration inside the confirmation sheet. This lets a Technician confirm without physically reading the vehicle. DCR-122 will replace the Stage 6 confirmation UX with a blank manual-entry field and retain server-authoritative comparison/persistence. Existing configured evidence rules will be reused for optional mandatory Registration-photo enforcement rather than creating a second evidence system.',
      'Awaiting build, full Stage 6 regression and one-step Jon manual retest on WO-10046 / AB26 CDE. Automated testing must not alter WO-10046.',
      false
    ) RETURNING id,status INTO d;
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d.id,NULL,'Blocking DCR-120 Manual UAT – Build Required','DCR-122 created before correction after manual UAT identified pre-populated registration confirmation. UAT-003 and Stage 7 remain blocked.','Jon – Stage 6 UAT');
  ELSE
    old_status:=d.status;
    UPDATE dcr_items SET
      status='Blocking DCR-120 Manual UAT – Build Required',
      priority='Blocking',
      deferred=false,
      updated_at=now()
    WHERE id=d.id;
    IF old_status IS DISTINCT FROM 'Blocking DCR-120 Manual UAT – Build Required' THEN
      INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
      VALUES(d.id,old_status,'Blocking DCR-120 Manual UAT – Build Required','DCR-122 held at blocking pre-build status before correction.','Stage 6 UAT');
    END IF;
  END IF;
END $$;
