'use strict';

const {tx}=require('./db');

const DEFERRED=new Map([
  ['DCR-108','Production backup / restore verification remains a production dependency.'],
  ['DCR-115','External penetration testing and formal production security assurance remain a production dependency.']
]);

// Stage 6 build items stay Building until the deployed API/database environment has
// actually passed the acceptance evidence for that item. This deliberately prevents
// seed data from making the build look more complete than it is.
async function reconcileStage6DcrStatus(){
  return tx(async c=>{
    const r=await c.query("SELECT id,dcr_ref,status,deferred FROM dcr_items WHERE dcr_ref ~ '^DCR-(08[9]|09[0-9]|10[0-9]|11[0-5])$' ORDER BY dcr_ref");
    let changed=0;
    for(const d of r.rows){
      const deferredReason=DEFERRED.get(d.dcr_ref);
      const target=deferredReason?'Agreed / Deferred Production Dependency':'Building';
      const deferred=!!deferredReason;
      if(d.status===target&&d.deferred===deferred)continue;
      await c.query('UPDATE dcr_items SET status=$2,deferred=$3,resolution=$4,retest_result=$5,updated_at=now() WHERE id=$1',[
        d.id,target,deferred,
        deferredReason||'Implementation is in progress. Ready to Test will only be set after deployed Stage 6 evidence exists.',
        deferred?'N/A until dependency is completed':'Pending deployed Stage 6 acceptance evidence'
      ]);
      await c.query('INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[
        d.id,d.status,target,
        deferredReason||'Status normalised during Stage 6 build control so incomplete/unproven work is not shown as Ready to Test.',
        'System Build'
      ]);
      changed++;
    }
    return {changed};
  });
}

module.exports={reconcileStage6DcrStatus};
