-- UAT-002 / DCR-116 Technician photo UX correction + DCR-117 requirement capture.
-- DCR-117 is recorded only; no Smart Technician Close implementation is included here.

ALTER TABLE evidence_metadata ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE evidence_metadata ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES users(id);
ALTER TABLE evidence_metadata ADD COLUMN IF NOT EXISTS removal_reason text;
CREATE INDEX IF NOT EXISTS idx_evidence_active_work_order ON evidence_metadata(work_order_id,captured_at DESC) WHERE removed_at IS NULL;

DO $$
DECLARE
  d116 uuid;
  old116 text;
  d117 uuid;
BEGIN
  SELECT id,status INTO d116,old116 FROM dcr_items WHERE dcr_ref='DCR-116' FOR UPDATE;
  IF d116 IS NULL THEN
    INSERT INTO dcr_items(dcr_ref,area,description,item_type,priority,status,resolution,retest_result,deferred)
    VALUES(
      'DCR-116',
      'Technician Mobile / Operations Evidence',
      'UAT-002: Technician photo/evidence must auto-save when the photograph is taken/selected, compress and upload automatically, link to the current Work Order / Attendance / Task, display as a Technician thumbnail only after server confirmation, support audited removal via a thumbnail X, disappear from the active Operations Evidence view after removal, and remain compatible with Technician offline/retry behaviour. The original defect also covered Technician evidence not being visible in Operations/Desktop.',
      'UAT Defect',
      'High',
      'Building',
      'Minimum correction only: remove the separate evidence-save step; auto-compress/upload on photo selection; show server-confirmed thumbnails; retain failed/pending uploads locally where technically possible without passing required-photo gates; add authenticated audited photo removal; exclude removed media from active evidence views; retain Work Order/Attendance/Task linkage and Operations visibility. Production object/media storage remains deferred.',
      'Pending deployed DCR-116 UX retest',
      false
    ) RETURNING id INTO d116;
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d116,NULL,'Building','UAT-002 Technician photo UX correction added to DCR-116 before implementation.','Stage 6 UAT');
  ELSE
    UPDATE dcr_items SET
      area='Technician Mobile / Operations Evidence',
      description='UAT-002: Technician photo/evidence must auto-save when the photograph is taken/selected, compress and upload automatically, link to the current Work Order / Attendance / Task, display as a Technician thumbnail only after server confirmation, support audited removal via a thumbnail X, disappear from the active Operations Evidence view after removal, and remain compatible with Technician offline/retry behaviour. The original defect also covered Technician evidence not being visible in Operations/Desktop.',
      item_type='UAT Defect',
      priority='High',
      status='Building',
      resolution='Minimum correction only: remove the separate evidence-save step; auto-compress/upload on photo selection; show server-confirmed thumbnails; retain failed/pending uploads locally where technically possible without passing required-photo gates; add authenticated audited photo removal; exclude removed media from active evidence views; retain Work Order/Attendance/Task linkage and Operations visibility. Production object/media storage remains deferred.',
      retest_result='Pending deployed DCR-116 UX retest',
      deferred=false,
      updated_at=now()
    WHERE id=d116;
    IF old116 IS DISTINCT FROM 'Building' THEN
      INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
      VALUES(d116,old116,'Building','UAT-002 Technician photo UX correction added to DCR-116 for implementation/retest.','Stage 6 UAT');
    END IF;
  END IF;

  INSERT INTO dcr_items(dcr_ref,area,description,item_type,priority,status,resolution,retest_result,deferred)
  VALUES(
    'DCR-117',
    'Technician Mobile / Completion Usability',
    'Smart Technician Close / Simplified Job Completion. Technician should have one clear FINISH JOB action. The system must automatically check existing required controls and ask only for missing/relevant items; offer Job Complete, Follow-up Required, or Unable to Complete; auto-save safe actions; hide internal Work Order/Attendance/Task/Billing terminology; preserve safety, registration confirmation, required evidence/tasks, audit, actual time, commercial controls and Work Order/Attendance separation. Target: about 3 taps to finish a standard completed repair and under 60 seconds to close a Follow-up Required attendance correctly.',
    'Usability Change',
    'High',
    'Agreed – Awaiting Build',
    'Requirement recorded only. Do not build until DCR-116 / UAT-002 passes and explicit authorisation is given. This DCR must be the next Technician usability correction before deeper Technician completion UAT.',
    NULL,
    false
  )
  ON CONFLICT(dcr_ref) DO UPDATE SET
    area=EXCLUDED.area,
    description=EXCLUDED.description,
    item_type=EXCLUDED.item_type,
    priority=EXCLUDED.priority,
    status='Agreed – Awaiting Build',
    resolution=EXCLUDED.resolution,
    deferred=false,
    updated_at=now()
  RETURNING id INTO d117;

  IF NOT EXISTS(SELECT 1 FROM dcr_history WHERE dcr_id=d117 AND to_status='Agreed – Awaiting Build') THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d117,NULL,'Agreed – Awaiting Build','Requirement captured during UAT. No DCR-117 functionality has been implemented.','Stage 6 UAT');
  END IF;
END $$;
