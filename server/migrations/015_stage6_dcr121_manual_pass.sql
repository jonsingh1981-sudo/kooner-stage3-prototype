DO $$
DECLARE
  d RECORD;
BEGIN
  SELECT id,status INTO d FROM dcr_items WHERE dcr_ref='DCR-121' FOR UPDATE;
  IF d.id IS NULL THEN
    RAISE EXCEPTION 'DCR-121 missing';
  END IF;

  IF d.status <> 'Completed' THEN
    UPDATE dcr_items
       SET status='Completed',
           deferred=false,
           resolution='DCR-121 Technician Journey Action Persistence & Stay-on-Job correction is deployed. Jon manually retested ACCEPT JOB on WO-10046 / AB26 CDE: acceptance persisted, the Technician remained on the same job screen, and the primary action advanced to START TRAVEL / EN ROUTE.',
           retest_result='Manual Retest PASS – Jon confirmed DCR-121 on WO-10046 / AB26 CDE. ACCEPT JOB worked first time, persisted on the authoritative Stage 6 server, stayed on the same job screen, and advanced to START TRAVEL / EN ROUTE.',
           updated_at=now()
     WHERE id=d.id;

    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(
      d.id,
      d.status,
      'Completed',
      'Jon manual retest PASS on WO-10046 / AB26 CDE. ACCEPT JOB persisted first time; Technician stayed on the same Work Order / Attendance screen; next action became START TRAVEL / EN ROUTE. DCR-120 manual UAT may resume one action at a time.',
      'Jon – Stage 6 UAT'
    );
  ELSE
    UPDATE dcr_items
       SET deferred=false,
           resolution='DCR-121 Technician Journey Action Persistence & Stay-on-Job correction is deployed. Jon manually retested ACCEPT JOB on WO-10046 / AB26 CDE: acceptance persisted, the Technician remained on the same job screen, and the primary action advanced to START TRAVEL / EN ROUTE.',
           retest_result='Manual Retest PASS – Jon confirmed DCR-121 on WO-10046 / AB26 CDE. ACCEPT JOB worked first time, persisted on the authoritative Stage 6 server, stayed on the same job screen, and advanced to START TRAVEL / EN ROUTE.',
           updated_at=now()
     WHERE id=d.id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM dcr_items WHERE dcr_ref='DCR-119' AND status='Agreed – Awaiting Build') THEN
    RAISE EXCEPTION 'DCR-119 must remain Agreed – Awaiting Build';
  END IF;
END $$;
