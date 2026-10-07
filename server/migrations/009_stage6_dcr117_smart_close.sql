-- UAT-002 manual acceptance + DCR-117 build authorisation.
-- Stage 7 is deliberately not started by this migration.

DO $$
DECLARE
  d116 uuid;
  old116 text;
  d117 uuid;
  old117 text;
BEGIN
  SELECT id,status INTO d116,old116 FROM dcr_items WHERE dcr_ref='DCR-116' FOR UPDATE;
  IF d116 IS NULL THEN
    RAISE EXCEPTION 'DCR-116 is missing';
  END IF;

  UPDATE dcr_items SET
    status='Completed',
    resolution='Retest PASS / Completed. UAT-002 manual retest confirmed Technician evidence auto-save, server-confirmed thumbnail, Operations visibility and persistence, audited removal, active-view removal, replacement photo, Technician → Operations shared data and Operations → Technician shared data. Production object/media storage remains a separate deferred production dependency.',
    retest_result='PASS — Manual UAT-002 completed by Jon on 07/10/2026. Operations → Technician return-direction was proven on active Work Order WO-10046 / AB26 CDE because the earlier photo-test Work Order had progressed to billing.',
    deferred=false,
    updated_at=now()
  WHERE id=d116;

  IF old116 IS DISTINCT FROM 'Completed' THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d116,old116,'Completed','UAT-002 manual retest PASS. DCR-116 formally recorded as Retest PASS / Completed.','Jon / Stage 6 UAT');
  END IF;

  SELECT id,status INTO d117,old117 FROM dcr_items WHERE dcr_ref='DCR-117' FOR UPDATE;
  IF d117 IS NULL THEN
    RAISE EXCEPTION 'DCR-117 is missing';
  END IF;

  UPDATE dcr_items SET
    status='Building',
    resolution='Build authorised after UAT-002 PASS. Implement Smart Technician Close with one FINISH JOB action, missing-requirement guidance, Job Complete / Follow-up Required / Unable to Complete outcomes, safe auto-save behaviour, automatic time stop and server-authoritative Work Order / Attendance separation. Do not start Stage 7 and do not weaken existing Kooner controls.',
    retest_result='Build authorised — current-deploy automated regression and Jon manual retest required before completion.',
    deferred=false,
    updated_at=now()
  WHERE id=d117;

  IF old117 IS DISTINCT FROM 'Building' THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d117,old117,'Building','DCR-117 authorised after UAT-002 PASS. Smart Technician Close build started within Stage 6 only.','Jon / Stage 6 UAT');
  END IF;
END $$;

INSERT INTO system_meta(key,value,updated_at)
VALUES(
  'uat_002_result',
  jsonb_build_object(
    'status','PASS',
    'manualRetest',true,
    'dcr','DCR-116',
    'dcrStatus','Completed',
    'confirmedAt','2026-10-07',
    'confirmedBy','Jon',
    'operationsToTechnicianWorkOrder','WO-10046',
    'registration','AB26 CDE'
  ),
  now()
)
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();

INSERT INTO system_meta(key,value,updated_at)
VALUES(
  'primary_manual_uat_work_order',
  jsonb_build_object(
    'workOrder','WO-10046',
    'registration','AB26 CDE',
    'rule','Use this Work Order for upcoming manual UAT wherever reasonably possible. Do not silently switch records. If its state prevents a future test, explain that to Jon before another Work Order is used.'
  ),
  now()
)
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();
