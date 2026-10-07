-- Stage 6 UAT: DCR-117 Manual Test 1 FAIL and DCR-120 creation.
-- This migration records the UAT result and requirement BEFORE any DCR-120 correction is implemented.
-- DCR-119 remains Agreed – Awaiting Build and is not authorised for implementation.

DO $$
DECLARE
  d117 uuid;
  old117 text;
  d119 uuid;
  d120 uuid;
  old120 text;
BEGIN
  SELECT id,status INTO d117,old117 FROM dcr_items WHERE dcr_ref='DCR-117' FOR UPDATE;
  IF d117 IS NULL THEN RAISE EXCEPTION 'DCR-117 missing'; END IF;

  UPDATE dcr_items SET
    status='Ready to Test – Manual Test 1 Failed / Correction Required',
    retest_result='Manual Test 1 FAIL on WO-10046 / AB26 CDE. FINISH JOB incorrectly acted as a catch-up wizard and displayed six journey prerequisites (Accept Job, Start Travel / En Route, Arrived On Site, Confirm Registration, Complete Safety Check, Start Work). Correction required so the Technician sees only the next logical journey action until Working; FINISH JOB must only become primary at Working and then check completion requirements only.',
    updated_at=now()
  WHERE id=d117;

  INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
  VALUES(
    d117,
    old117,
    'Ready to Test – Manual Test 1 Failed / Correction Required',
    'Jon manual DCR-117 Test 1 FAIL on WO-10046 / AB26 CDE. The completion control exposed the whole journey as missing prerequisites instead of guiding the Technician through one context-aware next action. DCR-117 remains open; no completion approval.',
    'Jon / Stage 6 UAT'
  );

  SELECT id INTO d119 FROM dcr_items WHERE dcr_ref='DCR-119' FOR UPDATE;
  IF d119 IS NULL THEN RAISE EXCEPTION 'DCR-119 missing'; END IF;
  UPDATE dcr_items SET
    status='Agreed – Awaiting Build',
    retest_result='Not built. Awaiting explicit future build authorisation from Jon after DCR-117/DCR-120 manual UAT.',
    updated_at=now()
  WHERE id=d119;

  SELECT id,status INTO d120,old120 FROM dcr_items WHERE dcr_ref='DCR-120' FOR UPDATE;
  IF d120 IS NULL THEN
    INSERT INTO dcr_items(
      dcr_ref,area,description,item_type,priority,status,resolution,retest_result,deferred
    ) VALUES (
      'DCR-120',
      'Technician Mobile / Guided Journey / Active Job / Mandatory Evidence',
      'DCR-117 UAT correction. Make the Technician journey context-aware: Assigned/Planned or Dispatched → Accept Job; Accepted → Start Travel / En Route where applicable; En Route → Arrived On Site; On Site → Confirm Registration → workflow-required Safety Check → Start Work; Working → FINISH JOB. FINISH JOB must only check genuine completion requirements, never act as a catch-up wizard for earlier journey steps. Enforce one active Technician Attendance at a time once En Route, On Site, In Progress/Working, Paused or Stopped for Safety; queued jobs may remain visible/accepted but a second active Attendance must be blocked with “Finish or resolve your current job before starting another.” and a Return to Current Job route. Operations/Admin exception override must require reason and remain audited. Mandatory photo/evidence completion controls must use the existing Customer / Contract / Workflow / Task requirements, not a universal photo list. Only active, server-confirmed stored evidence may satisfy a requirement; failed/local-only/removed evidence must not count. Missing required evidence must be shown specifically with a direct photo action and return the Technician to the completion check after successful upload. Preserve registration confirmation, safety, required Tasks, actual Technician time, audit, Work Order/Attendance separation and billing controls. Do not implement DCR-119, UAT-003 or Stage 7.',
      'UAT Defect / Usability Correction',
      'Blocking',
      'Agreed – Correction Required / Awaiting Build',
      'Record first, then apply the minimum Stage 6 correction to guided journey presentation, single-active-job enforcement and configured mandatory evidence completion controls. Automated testing must use temporary fixtures and must not mutate WO-10046 / AB26 CDE.',
      'Awaiting build and deployed regression. Jon manual retest required after deployment.',
      false
    ) RETURNING id INTO d120;

    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(
      d120,
      NULL,
      'Agreed – Correction Required / Awaiting Build',
      'DCR-120 created before correction following DCR-117 Manual Test 1 FAIL. Build order authorised by Jon: guided journey correction → single active Attendance enforcement → configured mandatory evidence enforcement → full regression → redeploy → stop for one short manual test on WO-10046 / AB26 CDE.',
      'Jon / Stage 6 UAT'
    );
  ELSE
    UPDATE dcr_items SET
      area='Technician Mobile / Guided Journey / Active Job / Mandatory Evidence',
      description='DCR-117 UAT correction. Make the Technician journey context-aware: Assigned/Planned or Dispatched → Accept Job; Accepted → Start Travel / En Route where applicable; En Route → Arrived On Site; On Site → Confirm Registration → workflow-required Safety Check → Start Work; Working → FINISH JOB. FINISH JOB must only check genuine completion requirements, never act as a catch-up wizard for earlier journey steps. Enforce one active Technician Attendance at a time once En Route, On Site, In Progress/Working, Paused or Stopped for Safety; queued jobs may remain visible/accepted but a second active Attendance must be blocked with “Finish or resolve your current job before starting another.” and a Return to Current Job route. Operations/Admin exception override must require reason and remain audited. Mandatory photo/evidence completion controls must use the existing Customer / Contract / Workflow / Task requirements, not a universal photo list. Only active, server-confirmed stored evidence may satisfy a requirement; failed/local-only/removed evidence must not count. Missing required evidence must be shown specifically with a direct photo action and return the Technician to the completion check after successful upload. Preserve registration confirmation, safety, required Tasks, actual Technician time, audit, Work Order/Attendance separation and billing controls. Do not implement DCR-119, UAT-003 or Stage 7.',
      item_type='UAT Defect / Usability Correction',
      priority='Blocking',
      status='Agreed – Correction Required / Awaiting Build',
      resolution='Record first, then apply the minimum Stage 6 correction to guided journey presentation, single-active-job enforcement and configured mandatory evidence completion controls. Automated testing must use temporary fixtures and must not mutate WO-10046 / AB26 CDE.',
      retest_result='Awaiting build and deployed regression. Jon manual retest required after deployment.',
      deferred=false,
      updated_at=now()
    WHERE id=d120;
    IF old120 IS DISTINCT FROM 'Agreed – Correction Required / Awaiting Build' THEN
      INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
      VALUES(d120,old120,'Agreed – Correction Required / Awaiting Build','DCR-120 held at pre-build status before the authorised correction is applied.','Stage 6 UAT');
    END IF;
  END IF;
END $$;
