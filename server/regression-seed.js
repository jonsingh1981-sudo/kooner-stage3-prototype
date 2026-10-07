'use strict';

const {tx}=require('./db');

// Reconciles the approved Stage 3 fixed-maintenance regression scenario after the
// generic Stage 6 seed. It is idempotent and uses relational plan/rate/coverage data;
// October 2026 is not hard-coded into the calculator itself.
async function reconcileRegressionSeed(){
  return tx(async c=>{
    const customer=(await c.query("SELECT id FROM customers WHERE legacy_ref='C1'")).rows[0];
    const contract=(await c.query("SELECT id FROM contracts WHERE legacy_ref='CT1'")).rows[0];
    const v1=(await c.query("SELECT id FROM vehicles WHERE legacy_ref='V1'")).rows[0];
    const v2=(await c.query("SELECT id FROM vehicles WHERE legacy_ref='V2'")).rows[0];
    const v3=(await c.query("SELECT id FROM vehicles WHERE legacy_ref='V3'")).rows[0];
    if(!customer||!contract||!v1||!v2||!v3)throw new Error('Stage 3 fixed-maintenance regression seed requires C1/CT1/V1/V2/V3');

    const vehiclePlan=(await c.query(`INSERT INTO fixed_maintenance_plans(legacy_ref,customer_id,contract_id,name,coverage_level,pro_rata_rule,active,data)
      VALUES('FMP-C1-VEH',$1,$2,'Test Transport – Vehicle Maintenance Plan','Vehicle-specific','Daily pro-rata',true,'{"regression":"Stage 3 approved"}'::jsonb)
      ON CONFLICT(legacy_ref) DO UPDATE SET customer_id=EXCLUDED.customer_id,contract_id=EXCLUDED.contract_id,name=EXCLUDED.name,coverage_level=EXCLUDED.coverage_level,pro_rata_rule=EXCLUDED.pro_rata_rule,active=true,data=EXCLUDED.data
      RETURNING id`,[customer.id,contract.id])).rows[0].id;
    await c.query("DELETE FROM effective_rate_versions WHERE plan_id=$1",[vehiclePlan]);
    await c.query(`INSERT INTO effective_rate_versions(plan_id,version_no,effective_from,effective_to,monthly_rate,data) VALUES
      ($1,1,'2026-01-01','2026-06-30',210,'{"historical":true}'::jsonb),
      ($1,2,'2026-07-01',NULL,225,'{"approvedRegression":true}'::jsonb)`,[vehiclePlan]);

    const groupPlan=(await c.query(`INSERT INTO fixed_maintenance_plans(legacy_ref,customer_id,contract_id,name,coverage_level,pro_rata_rule,active,data)
      VALUES('FMP-C1-GRP',$1,$2,'Test Transport – Core Vans','Vehicle Group','Daily pro-rata',true,'{"group":"Core Vans","regression":"Stage 3 approved"}'::jsonb)
      ON CONFLICT(legacy_ref) DO UPDATE SET customer_id=EXCLUDED.customer_id,contract_id=EXCLUDED.contract_id,name=EXCLUDED.name,coverage_level=EXCLUDED.coverage_level,pro_rata_rule=EXCLUDED.pro_rata_rule,active=true,data=EXCLUDED.data
      RETURNING id`,[customer.id,contract.id])).rows[0].id;
    await c.query("DELETE FROM effective_rate_versions WHERE plan_id=$1",[groupPlan]);
    await c.query(`INSERT INTO effective_rate_versions(plan_id,version_no,effective_from,effective_to,monthly_rate,data) VALUES
      ($1,1,'2026-01-01','2026-06-30',170,'{"historical":true}'::jsonb),
      ($1,2,'2026-07-01',NULL,180,'{"approvedRegression":true}'::jsonb)`,[groupPlan]);

    await c.query(`INSERT INTO coverage_assignments(legacy_ref,plan_id,vehicle_id,group_ref,effective_from,effective_to,active,data)
      VALUES('CA-V1',$1,$2,NULL,'2026-01-01',NULL,true,'{"coverage":"Vehicle-specific"}'::jsonb)
      ON CONFLICT(legacy_ref) DO UPDATE SET plan_id=EXCLUDED.plan_id,vehicle_id=EXCLUDED.vehicle_id,group_ref=NULL,effective_from=EXCLUDED.effective_from,effective_to=NULL,active=true,data=EXCLUDED.data`,[vehiclePlan,v1.id]);
    await c.query(`INSERT INTO coverage_assignments(legacy_ref,plan_id,vehicle_id,group_ref,effective_from,effective_to,active,data)
      VALUES('CA-V2',$1,$2,'Core Vans','2026-01-01',NULL,true,'{"coverage":"Core Vans"}'::jsonb)
      ON CONFLICT(legacy_ref) DO UPDATE SET plan_id=EXCLUDED.plan_id,vehicle_id=EXCLUDED.vehicle_id,group_ref=EXCLUDED.group_ref,effective_from=EXCLUDED.effective_from,effective_to=NULL,active=true,data=EXCLUDED.data`,[groupPlan,v2.id]);
    await c.query(`INSERT INTO coverage_assignments(legacy_ref,plan_id,vehicle_id,group_ref,effective_from,effective_to,active,data)
      VALUES('CA-V3',$1,$2,'Core Vans','2026-01-01','2026-10-15',true,'{"coverage":"Core Vans","removedMidPeriod":true}'::jsonb)
      ON CONFLICT(legacy_ref) DO UPDATE SET plan_id=EXCLUDED.plan_id,vehicle_id=EXCLUDED.vehicle_id,group_ref=EXCLUDED.group_ref,effective_from=EXCLUDED.effective_from,effective_to=EXCLUDED.effective_to,active=true,data=EXCLUDED.data`,[groupPlan,v3.id]);

    // Keep the seeded consolidated invoice internally consistent and idempotent.
    const invoice=(await c.query("SELECT id FROM invoices WHERE legacy_ref='INV-9101'")).rows[0];
    if(invoice){
      await c.query('DELETE FROM invoice_lines WHERE invoice_id=$1',[invoice.id]);
      await c.query(`INSERT INTO invoice_lines(invoice_id,line_type,description,amount,source_ref,data)
        VALUES($1,'Fixed Maintenance','October 2026 approved fixed-maintenance regression',492.10,'FMP-OCT-2026','{"regression":true,"period":"2026-10"}'::jsonb)`,[invoice.id]);
      await c.query("UPDATE invoices SET net=492.10,vat=98.42,gross=590.52,data=jsonb_set(COALESCE(data,'{}'::jsonb),'{regression}', 'true'::jsonb,true) WHERE id=$1",[invoice.id]);
    }
    return {fixedMaintenanceRegression:'£492.10',vehiclePlan:'FMP-C1-VEH',groupPlan:'FMP-C1-GRP'};
  });
}

module.exports={reconcileRegressionSeed};
