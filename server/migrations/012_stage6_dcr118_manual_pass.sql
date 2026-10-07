-- DCR-118 manual phone retest PASS recorded by Jon during Stage 6 UAT.
-- DCR-117 manual Smart Close UAT may resume. DCR-119 remains recorded only and must not be built yet.

DO $$
DECLARE
  d118 uuid;
  old118 text;
  d117 uuid;
  old117 text;
  d119 uuid;
  old119 text;
BEGIN
  SELECT id,status INTO d118,old118 FROM dcr_items WHERE dcr_ref='DCR-118' FOR UPDATE;
  IF d118 IS NULL THEN RAISE EXCEPTION 'DCR-118 missing'; END IF;
  UPDATE dcr_items SET
    status='Completed',
    resolution='Minimum mobile layout correction deployed and manually verified on phone: My Day / Jobs / Sync / More remain fixed, visible and tappable; Stage 6 DATABASE/API BACKED indicator remains above navigation without covering it; scrolling and modal open/close preserve navigation.',
    retest_result='Manual Retest PASS – Jon confirmed all four bottom navigation buttons visible/open correctly, navigation fixed while scrolling, navigation retained after popup/modal, and Stage 6 indicator visible above navigation without obstruction.',
    deferred=false,
    updated_at=now()
  WHERE id=d118;
  IF old118 IS DISTINCT FROM 'Completed' THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d118,old118,'Completed','Manual phone retest PASS confirmed by Jon. DCR-118 is complete.','Jon / Stage 6 UAT');
  END IF;

  SELECT id,status INTO d117,old117 FROM dcr_items WHERE dcr_ref='DCR-117' FOR UPDATE;
  IF d117 IS NULL THEN RAISE EXCEPTION 'DCR-117 missing'; END IF;
  UPDATE dcr_items SET
    status='Ready to Test',
    retest_result='Automated DCR-117 acceptance remains passed. Manual Smart Technician Close UAT may resume now that DCR-118 has passed.',
    updated_at=now()
  WHERE id=d117;
  IF old117 IS DISTINCT FROM 'Ready to Test' THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d117,old117,'Ready to Test','DCR-118 manual phone retest passed; DCR-117 manual UAT can resume.','Jon / Stage 6 UAT');
  END IF;

  SELECT id,status INTO d119,old119 FROM dcr_items WHERE dcr_ref='DCR-119' FOR UPDATE;
  IF d119 IS NULL THEN RAISE EXCEPTION 'DCR-119 missing'; END IF;
  UPDATE dcr_items SET
    status='Agreed – Awaiting Build',
    retest_result='Not built. Awaiting explicit future build authorisation from Jon after DCR-117 manual UAT.',
    updated_at=now()
  WHERE id=d119;
  IF old119 IS DISTINCT FROM 'Agreed – Awaiting Build' THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d119,old119,'Agreed – Awaiting Build','DCR-119 remains recorded only. Do not build until Jon authorises after DCR-117 manual UAT.','Stage 6 UAT');
  END IF;
END $$;
