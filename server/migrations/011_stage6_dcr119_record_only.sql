-- DCR-119: Technician Search, Work Order Visibility & Vehicle Repair History.
-- Requirement recording only. No Technician Mobile implementation is authorised by this migration.
-- Build order remains: finish DCR-118 phone retest, then DCR-117 manual UAT, then wait for Jon before building DCR-119.

DO $$
DECLARE
  d119 uuid;
  old119 text;
BEGIN
  SELECT id,status INTO d119,old119 FROM dcr_items WHERE dcr_ref='DCR-119' FOR UPDATE;

  IF d119 IS NULL THEN
    INSERT INTO dcr_items(
      dcr_ref,area,description,item_type,priority,status,resolution,retest_result,deferred
    )
    VALUES(
      'DCR-119',
      'Technician Mobile / Search / Vehicle History',
      'Technician usability requirement. (1) Show the Work Order reference clearly with the registration on My Day, Jobs, Current Job, Next Job and the individual job header, using registration as the primary visual identifier and Work Order reference as secondary, e.g. AB26 CDE · WO-10046. (2) Add phone-friendly Technician search by Registration or Work Order number, restricted to jobs/records the Technician is authorised to see under existing assignment and permission rules. (3) Add a Previous Kooner History section when a Technician opens a job, sourced only from the authoritative existing vehicle/Work Order/Attendance/Task data for the same vehicle. Show the latest five previous Kooner jobs newest first with Date, Work Order number, Issue/Fault and Outcome/Repair Summary, with View More only where further history exists and No previous Kooner repair history where none exists. Do not expose customer charge rates, Technician hourly costs, margin/profit, billing notes, commercial information or unrelated Customer data. Reuse existing final Technician/Operations repair outcomes where possible rather than creating duplicate disconnected history data. Do not redesign unrelated Technician Mobile areas.',
      'Usability Requirement',
      'High',
      'Agreed – Awaiting Build',
      'Recorded only during Technician Mobile UAT. No functionality is to be built until DCR-118 manual retest and DCR-117 Smart Technician Close manual UAT are completed and Jon separately authorises DCR-119.',
      'Not built. Awaiting future explicit build authorisation from Jon.',
      false
    )
    RETURNING id INTO d119;

    INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
    VALUES(
      d119,
      NULL,
      'Agreed – Awaiting Build',
      'DCR-119 recorded from Technician Mobile UAT. Requirement covers visible Work Order references, permission-scoped Technician search, and concise Previous Kooner vehicle repair history. Recording only; no implementation authorised. Build order remains DCR-118 manual retest → DCR-117 manual UAT → wait for Jon before DCR-119.',
      'Stage 6 UAT'
    );
  ELSE
    UPDATE dcr_items SET
      area='Technician Mobile / Search / Vehicle History',
      description='Technician usability requirement. (1) Show the Work Order reference clearly with the registration on My Day, Jobs, Current Job, Next Job and the individual job header, using registration as the primary visual identifier and Work Order reference as secondary, e.g. AB26 CDE · WO-10046. (2) Add phone-friendly Technician search by Registration or Work Order number, restricted to jobs/records the Technician is authorised to see under existing assignment and permission rules. (3) Add a Previous Kooner History section when a Technician opens a job, sourced only from the authoritative existing vehicle/Work Order/Attendance/Task data for the same vehicle. Show the latest five previous Kooner jobs newest first with Date, Work Order number, Issue/Fault and Outcome/Repair Summary, with View More only where further history exists and No previous Kooner repair history where none exists. Do not expose customer charge rates, Technician hourly costs, margin/profit, billing notes, commercial information or unrelated Customer data. Reuse existing final Technician/Operations repair outcomes where possible rather than creating duplicate disconnected history data. Do not redesign unrelated Technician Mobile areas.',
      item_type='Usability Requirement',
      priority='High',
      status='Agreed – Awaiting Build',
      resolution='Recorded only during Technician Mobile UAT. No functionality is to be built until DCR-118 manual retest and DCR-117 Smart Technician Close manual UAT are completed and Jon separately authorises DCR-119.',
      retest_result='Not built. Awaiting future explicit build authorisation from Jon.',
      deferred=false,
      updated_at=now()
    WHERE id=d119;

    IF old119 IS DISTINCT FROM 'Agreed – Awaiting Build' THEN
      INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by)
      VALUES(
        d119,
        old119,
        'Agreed – Awaiting Build',
        'DCR-119 returned to recorded-only status. No implementation authorised; continue DCR-118 and DCR-117 UAT first.',
        'Stage 6 UAT'
      );
    END IF;
  END IF;
END $$;
