'use strict';

const {tx}=require('./db');

const DEFERRED=new Map([
  ['DCR-108','Production backup / restore verification remains a production dependency.'],
  ['DCR-115','External penetration testing and formal production security assurance remain a production dependency.']
]);

const STAGE6_REFS=Array.from({length:27},(_,i)=>`DCR-${String(89+i).padStart(3,'0')}`);

async function ensureStage5SecurityDependency(c){
  const r=await c.query("SELECT id,status,deferred FROM dcr_items WHERE dcr_ref='DCR-078'");
  if(!r.rowCount)return 0;
  const d=r.rows[0],target='Agreed / Deferred – Production Security Dependency';
  if(d.status===target&&d.deferred===true)return 0;
  await c.query(`UPDATE dcr_items SET status=$2,deferred=true,resolution=$3,retest_result=$4,updated_at=now() WHERE id=$1`,[
    d.id,target,
    'Stage 5 production authentication/MFA/server-side security dependency remains explicitly deferred. Stage 6 adds the platform foundation but does not close the production-security dependency.',
    'Deferred — retain for production security completion'
  ]);
  await c.query('INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[
    d.id,d.status,target,'Preserved the Stage 5 security dependency exactly as required while Stage 6 is built.','System Build'
  ]);
  return 1;
}

// Before each acceptance run, Stage 6 build items stay Building. This prevents seed
// data or evidence from an older deploy from making a new deploy look proven.
async function reconcileStage6DcrStatus(){
  return tx(async c=>{
    let changed=await ensureStage5SecurityDependency(c);
    const r=await c.query("SELECT id,dcr_ref,status,deferred FROM dcr_items WHERE dcr_ref ~ '^DCR-(08[9]|09[0-9]|10[0-9]|11[0-5])$' ORDER BY dcr_ref");
    for(const d of r.rows){
      const deferredReason=DEFERRED.get(d.dcr_ref);
      const target=deferredReason?'Agreed / Deferred Production Dependency':'Building';
      const deferred=!!deferredReason;
      if(d.status===target&&d.deferred===deferred)continue;
      await c.query('UPDATE dcr_items SET status=$2,deferred=$3,resolution=$4,retest_result=$5,updated_at=now() WHERE id=$1',[
        d.id,target,deferred,
        deferredReason||'Implementation is deployed but must pass the current Stage 6 acceptance evidence before being offered for user retest.',
        deferred?'N/A until dependency is completed':'Pending current-deploy Stage 6 acceptance evidence'
      ]);
      await c.query('INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[
        d.id,d.status,target,
        deferredReason||'Status reset to Building for current-deploy evidence; Ready to Test is never inherited blindly from a previous deploy.',
        'System Build'
      ]);
      changed++;
    }
    return {changed};
  });
}

// Called only after the core and extended deployed acceptance suites both finish with
// zero failures. "Ready to Test" means ready for Jon/user acceptance, not production
// sign-off. DCR-108 and DCR-115 intentionally remain deferred.
async function promoteStage6Ready(coreSummary,extendedSummary){
  const coreOk=!!coreSummary&&Number(coreSummary.failed)===0&&Number(coreSummary.total)>=24;
  const extendedOk=!!extendedSummary&&Number(extendedSummary.failed)===0&&Number(extendedSummary.total)>=29;
  if(!coreOk||!extendedOk)throw new Error('Stage 6 DCR promotion refused: deployed acceptance evidence is incomplete');
  return tx(async c=>{
    let changed=await ensureStage5SecurityDependency(c);
    const refs=STAGE6_REFS.filter(ref=>!DEFERRED.has(ref));
    const r=await c.query('SELECT id,dcr_ref,status FROM dcr_items WHERE dcr_ref=ANY($1::text[]) ORDER BY dcr_ref',[refs]);
    for(const d of r.rows){
      const target='Ready to Test';
      const resolution='Implemented in the shared Stage 6 PostgreSQL/API platform and supported by current-deploy automated acceptance evidence. Awaiting user acceptance/retest; this is not production sign-off.';
      if(d.status===target){await c.query('UPDATE dcr_items SET deferred=false,resolution=$2,retest_result=$3,updated_at=now() WHERE id=$1',[d.id,resolution,'Current deploy automated acceptance passed; user retest pending']);continue}
      await c.query('UPDATE dcr_items SET status=$2,deferred=false,resolution=$3,retest_result=$4,updated_at=now() WHERE id=$1',[d.id,target,resolution,'Current deploy automated acceptance passed; user retest pending']);
      await c.query('INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[
        d.id,d.status,target,'Core + extended Stage 6 acceptance suites passed on the deployed database/API build. Promoted for user retest only.','System Build'
      ]);
      changed++;
    }
    for(const [ref,reason] of DEFERRED){
      const d=(await c.query('SELECT id,status,deferred FROM dcr_items WHERE dcr_ref=$1',[ref])).rows[0];if(!d)continue;
      const target='Agreed / Deferred Production Dependency';
      if(d.status!==target||d.deferred!==true){await c.query('UPDATE dcr_items SET status=$2,deferred=true,resolution=$3,retest_result=$4,updated_at=now() WHERE id=$1',[d.id,target,reason,'N/A until production dependency is completed']);await c.query('INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[d.id,d.status,target,reason,'System Build']);changed++}
    }
    return {changed,ready:refs.length,deferred:[...DEFERRED.keys()]};
  });
}

module.exports={reconcileStage6DcrStatus,promoteStage6Ready};
