DO $$
DECLARE
  d RECORD;
  old_status TEXT;
BEGIN
  SELECT id,status INTO d FROM dcr_items WHERE dcr_ref='DCR-121' FOR UPDATE;
  IF d.id IS NULL OR d.status <> 'Completed' THEN
    RAISE EXCEPTION 'DCR-121 must be Completed before DCR-120 manual UAT resumes';
  END IF;

  SELECT id,status INTO d FROM dcr_items WHERE dcr_ref='DCR-120' FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'DCR-120 missing'; END IF;
  old_status:=d.status;
  UPDATE dcr_items
     SET status='Ready to Test – Manual UAT resumed',
         retest_result='DCR-120 Manual Retest FAIL remains part of history. DCR-121 manual retest PASS confirmed on WO-10046 / AB26 CDE. Manual DCR-120 Technician journey UAT resumed one action at a time; next action is START TRAVEL / EN ROUTE.',
         updated_at=now()
   WHERE id=d.id;
  IF old_status <> 'Ready to Test – Manual UAT resumed' THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d.id,old_status,'Ready to Test – Manual UAT resumed','DCR-121 manual retest PASS. Resume DCR-120 manual Technician journey UAT one action at a time on WO-10046 / AB26 CDE.','Jon – Stage 6 UAT');
  END IF;

  SELECT id,status INTO d FROM dcr_items WHERE dcr_ref='DCR-117' FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'DCR-117 missing'; END IF;
  old_status:=d.status;
  UPDATE dcr_items
     SET status='Ready to Test – still dependent on successful completion of corrected Technician journey test',
         retest_result='Manual Test 1 FAIL remains part of history. DCR-121 manual retest PASS confirmed. DCR-117 remains Ready to Test but still depends on successful completion of the corrected DCR-120 Technician journey test.',
         updated_at=now()
   WHERE id=d.id;
  IF old_status <> 'Ready to Test – still dependent on successful completion of corrected Technician journey test' THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d.id,old_status,'Ready to Test – still dependent on successful completion of corrected Technician journey test','DCR-121 manual retest PASS. DCR-117 remains dependent on successful completion of the corrected Technician journey test.','Jon – Stage 6 UAT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM dcr_items WHERE dcr_ref='DCR-119' AND status='Agreed – Awaiting Build') THEN
    RAISE EXCEPTION 'DCR-119 must remain Agreed – Awaiting Build / NOT built';
  END IF;
END $$;
