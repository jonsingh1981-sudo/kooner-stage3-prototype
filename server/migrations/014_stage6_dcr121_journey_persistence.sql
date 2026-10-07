-- Stage 6 UAT: DCR-120 manual retest FAIL and DCR-121 creation.
-- Recorded BEFORE any DCR-121 correction is implemented.
-- Live logs showed repeated BUSINESS_RULE rejection: Invalid attendance transition: Planned → Accepted.
-- DCR-119 remains Agreed – Awaiting Build and is not authorised for implementation.

DO $$
DECLARE
  d117 uuid; old117 text;
  d119 uuid;
  d120 uuid; old120 text;
  d121 uuid; old121 text;
BEGIN
  SELECT id,status INTO d117,old117 FROM dcr_items WHERE dcr_ref='DCR-117' FOR UPDATE;
  IF d117 IS NULL THEN RAISE EXCEPTION 'DCR-117 missing'; END IF;
  UPDATE dcr_items SET
    status='Ready to Test – blocked by Technician journey correction',
    retest_result='DCR-117 Manual Test 1 remains failed/open. Retest is blocked by DCR-121 until Technician journey actions persist authoritatively and stay on the same Attendance screen.',
    updated_at=now()
  WHERE id=d117;
  IF old117 IS DISTINCT FROM 'Ready to Test – blocked by Technician journey correction' THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d117,old117,'Ready to Test – blocked by Technician journey correction','DCR-117 remains open. DCR-120 manual retest exposed a blocking persistence defect in the Technician journey; DCR-117 cannot continue until DCR-121 is corrected and manually retested.','Jon / Stage 6 UAT');
  END IF;

  SELECT id INTO d119 FROM dcr_items WHERE dcr_ref='DCR-119' FOR UPDATE;
  IF d119 IS NULL THEN RAISE EXCEPTION 'DCR-119 missing'; END IF;
  UPDATE dcr_items SET
    status='Agreed – Awaiting Build',
    retest_result='Not built. Explicitly excluded from DCR-121 correction.',
    updated_at=now()
  WHERE id=d119;

  SELECT id,status INTO d120,old120 FROM dcr_items WHERE dcr_ref='DCR-120' FOR UPDATE;
  IF d120 IS NULL THEN RAISE EXCEPTION 'DCR-120 missing'; END IF;
  UPDATE dcr_items SET
    status='Ready to Test – Manual Retest Failed / blocked by DCR-121',
    retest_result='Manual retest FAIL on WO-10046 / AB26 CDE. ACCEPT JOB briefly showed START TRAVEL / EN ROUTE, then Stage 6 rolled back/reloaded to My Day; reopening the same Work Order showed ACCEPT JOB again. Repeated three times. Live server logs recorded repeated BUSINESS_RULE errors: Invalid attendance transition: Planned → Accepted. DCR-120 is blocked by DCR-121.',
    updated_at=now()
  WHERE id=d120;
  IF old120 IS DISTINCT FROM 'Ready to Test – Manual Retest Failed / blocked by DCR-121' THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d120,old120,'Ready to Test – Manual Retest Failed / blocked by DCR-121','Jon DCR-120 manual retest FAIL on WO-10046 / AB26 CDE. Technician acceptance changed browser state first, then the authoritative server rejected Planned → Accepted; the compatibility bridge restored server state and reloaded.','Jon / Stage 6 UAT');
  END IF;

  SELECT id,status INTO d121,old121 FROM dcr_items WHERE dcr_ref='DCR-121' FOR UPDATE;
  IF d121 IS NULL THEN
    INSERT INTO dcr_items(
      dcr_ref,area,description,item_type,priority,status,resolution,retest_result,deferred
    ) VALUES (
      'DCR-121',
      'Technician Mobile / Journey Action Persistence / Stay-on-Job',
      'Blocking Stage 6 UAT defect. Technician journey actions must be explicit authenticated server/API commands: Technician taps action → server validates and saves authoritative Attendance/journey data → server confirms → UI updates to the next logical action while remaining on the same Work Order / Attendance screen. Applies to Accept Job, Start Travel / En Route, Arrived On Site, Confirm Registration, Safety Check, Start Work and Finish / Resolve outcomes. Failed server saves must not falsely advance the UI or silently return to My Day. A successful Accept must persist Attendance status Accepted, accepted timestamp, Technician/user and audit/history; Travel, On Site and Start Work must likewise persist authoritative journey timestamps. Repeat clicks must be idempotent. Automated tests must prove fresh bootstrap/session and refresh/relogin persistence, next-action derivation, stay-on-job UI flow, rejection behaviour and non-duplication, and must not mutate WO-10046 / AB26 CDE.',
      'UAT Defect / Server Persistence',
      'Blocking',
      'Blocking UAT Defect – Build Required',
      'Root cause confirmed from live logs before code change: the DCR-120 ACCEPT action called the older browser-state acceptJob() function, which changed a Planned Attendance directly to Accepted and persisted through the asynchronous compatibility snapshot. Stage 6 business rules allow Planned → Dispatched, not Planned → Accepted, so the authoritative gateway rejected the snapshot with BUSINESS_RULE “Invalid attendance transition: Planned → Accepted”. stage6-client then restored the last server state and reloaded, producing the brief false success and return to My Day. Correct by using an explicit Stage 6 Technician journey API with server-confirmed state before UI advancement; preserve the valid transition model and do not weaken it merely to accommodate the old browser shortcut.',
      'Awaiting build, full regression and Jon manual retest on WO-10046 / AB26 CDE. Do not manually alter that Work Order for automated testing.',
      false
    ) RETURNING id INTO d121;
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d121,NULL,'Blocking UAT Defect – Build Required','DCR-121 created after live-log root-cause confirmation and before correction. Build limited to authoritative Technician journey persistence/stay-on-job plus dedicated regression. UAT-003 and Stage 7 remain blocked.','Jon / Stage 6 UAT');
  ELSE
    UPDATE dcr_items SET
      area='Technician Mobile / Journey Action Persistence / Stay-on-Job',
      item_type='UAT Defect / Server Persistence',
      priority='Blocking',
      status='Blocking UAT Defect – Build Required',
      resolution='Root cause confirmed from live logs before code change: the DCR-120 ACCEPT action called the older browser-state acceptJob() function, which changed a Planned Attendance directly to Accepted and persisted through the asynchronous compatibility snapshot. Stage 6 business rules allow Planned → Dispatched, not Planned → Accepted, so the authoritative gateway rejected the snapshot with BUSINESS_RULE “Invalid attendance transition: Planned → Accepted”. stage6-client then restored the last server state and reloaded. Correct with explicit server-confirmed journey actions; do not weaken the transition model.',
      retest_result='Awaiting build, full regression and Jon manual retest on WO-10046 / AB26 CDE.',
      deferred=false,
      updated_at=now()
    WHERE id=d121;
    IF old121 IS DISTINCT FROM 'Blocking UAT Defect – Build Required' THEN
      INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
      VALUES(d121,old121,'Blocking UAT Defect – Build Required','DCR-121 held at blocking pre-build status before correction.','Stage 6 UAT');
    END IF;
  END IF;
END $$;
