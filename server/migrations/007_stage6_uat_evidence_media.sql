-- UAT-002 defect correction: persist Technician evidence media for Stage 6 acceptance.
ALTER TABLE evidence_metadata ADD COLUMN IF NOT EXISTS content_data bytea;

WITH ins AS (
  INSERT INTO dcr_items(dcr_ref,area,description,item_type,priority,status,resolution,retest_result,deferred)
  VALUES(
    'DCR-116',
    'Technician Mobile / Operations Evidence',
    'UAT-002: Technician photo/evidence captured against a Work Order/Attendance/Task was not visible in Operations/Desktop after sync/refresh.',
    'UAT Defect',
    'High',
    'Building',
    'Cause confirmed: Stage 4 capture retained filename/metadata only, Stage 6 persisted evidence metadata without binary content, and the Desktop Evidence tab rendered only a static placeholder instead of linked evidence. Minimum correction: persist compressed UAT image content in PostgreSQL, retain Work Order/Attendance/Task linkage, expose authorised content through a server endpoint, and render linked evidence in Operations/Desktop. Production object storage remains deferred.',
    'Pending deployed retest',
    false
  )
  ON CONFLICT (dcr_ref) DO NOTHING
  RETURNING id
)
INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
SELECT id,NULL,'Building','UAT-002 defect recorded before implementation. Existing Work Order and audit history must be preserved.','Stage 6 UAT'
FROM ins;
