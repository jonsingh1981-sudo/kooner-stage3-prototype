-- DCR-118: Technician Mobile bottom navigation obscured by the Stage 6 status banner.
-- Manual DCR-117 UAT has not failed; it is blocked until DCR-118 is manually retested.

DO $$
DECLARE
  d117 uuid;
  old117 text;
  d118 uuid;
  old118 text;
BEGIN
  SELECT id,status INTO d117,old117 FROM dcr_items WHERE dcr_ref='DCR-117' FOR UPDATE;
  IF d117 IS NULL THEN
    RAISE EXCEPTION 'DCR-117 must exist before DCR-118 can be recorded';
  END IF;

  UPDATE dcr_items SET
    status='Ready to Test – Manual UAT Blocked by DCR-118',
    retest_result='Manual DCR-117 UAT not started. Blocked by DCR-118 Technician Mobile bottom-navigation visibility defect.',
    updated_at=now()
  WHERE id=d117;
  IF old117 IS DISTINCT FROM 'Ready to Test – Manual UAT Blocked by DCR-118' THEN
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d117,old117,'Ready to Test – Manual UAT Blocked by DCR-118','Jon could not begin manual DCR-117 Smart Technician Close UAT because the fixed Stage 6 status banner obscured the Technician Mobile bottom navigation. DCR-117 is neither failed nor completed.','Stage 6 UAT');
  END IF;

  SELECT id,status INTO d118,old118 FROM dcr_items WHERE dcr_ref='DCR-118' FOR UPDATE;
  IF d118 IS NULL THEN
    INSERT INTO dcr_items(dcr_ref,area,description,item_type,priority,status,resolution,retest_result,deferred)
    VALUES(
      'DCR-118',
      'Technician Mobile / Navigation Layout',
      'Blocking UAT defect: Technician Mobile bottom navigation (My Day, Jobs, Sync, More) is present in the HTML but is obscured on a phone by the fixed Stage 6 DATABASE/API BACKED status banner. Correct the layout/layering so navigation remains fixed, visible and tappable; retain an unobtrusive Stage 6 backend/status indication; protect job content and modal actions; account for mobile safe-area/browser controls.',
      'UAT Defect',
      'Blocking',
      'Building',
      'Minimum safe correction only: preserve the existing Technician navigation and Stage 6 status indication, reserve vertical space for both, position the status indication above the navigation, keep it non-interactive, place it below modal layers, and use safe-area spacing. No unrelated Technician redesign.',
      'Pending deployed regression and Jon phone retest',
      false
    ) RETURNING id INTO d118;
    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(d118,NULL,'Building','DCR-118 recorded as the blocking defect preventing manual DCR-117 UAT.','Stage 6 UAT');
  ELSE
    UPDATE dcr_items SET
      area='Technician Mobile / Navigation Layout',
      description='Blocking UAT defect: Technician Mobile bottom navigation (My Day, Jobs, Sync, More) is present in the HTML but is obscured on a phone by the fixed Stage 6 DATABASE/API BACKED status banner. Correct the layout/layering so navigation remains fixed, visible and tappable; retain an unobtrusive Stage 6 backend/status indication; protect job content and modal actions; account for mobile safe-area/browser controls.',
      item_type='UAT Defect',
      priority='Blocking',
      status='Building',
      resolution='Minimum safe correction only: preserve the existing Technician navigation and Stage 6 status indication, reserve vertical space for both, position the status indication above the navigation, keep it non-interactive, place it below modal layers, and use safe-area spacing. No unrelated Technician redesign.',
      retest_result='Pending deployed regression and Jon phone retest',
      deferred=false,
      updated_at=now()
    WHERE id=d118;
    IF old118 IS DISTINCT FROM 'Building' THEN
      INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
      VALUES(d118,old118,'Building','DCR-118 reopened/held at Building for the current deployed correction and phone retest.','Stage 6 UAT');
    END IF;
  END IF;
END $$;
