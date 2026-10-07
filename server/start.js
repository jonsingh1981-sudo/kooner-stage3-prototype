'use strict';
require('./state-syntax-hotfix');
const {runMigrations}=require('./migrate');
const {seed}=require('./seed');
const {reconcileRegressionSeed}=require('./regression-seed');
const {reconcileTestUserPasswords}=require('./test-user-passwords');
const {reconcileStage6DcrStatus}=require('./stage6-status');
const {runLiveAcceptance}=require('./live-acceptance');
const {runFinalAcceptance}=require('./live-acceptance-final');
const {runUat002Evidence}=require('./live-uat002-evidence');
const {runDcr117}=require('./live-dcr117');
const {runDcr118}=require('./live-dcr118');
const {runDcr120}=require('./live-dcr120');
const {runDcr121}=require('./live-dcr121');
const app=require('./stage6-root');
const {pool,assertDatabaseConfigured,tx}=require('./db');

async function preserveManualDcr121Pass(){
 return tx(async c=>{
  const d121=(await c.query("SELECT id,status,retest_result FROM dcr_items WHERE dcr_ref='DCR-121' FOR UPDATE")).rows[0];
  const manualPassed=!!d121&&d121.status==='Completed'&&/Manual Retest PASS/i.test(String(d121.retest_result||''));
  if(!manualPassed)return{manualPassed:false};

  const desired=[
   ['DCR-120','Ready to Test – Manual UAT resumed','DCR-121 manual retest PASS confirmed on WO-10046 / AB26 CDE. DCR-120 manual Technician journey UAT is resumed one action at a time; next action is START TRAVEL / EN ROUTE.'],
   ['DCR-117','Ready to Test – still dependent on successful completion of corrected Technician journey test','DCR-121 manual retest PASS confirmed. DCR-117 remains Ready to Test but is still dependent on successful completion of the corrected DCR-120 Technician journey test.']
  ];
  const out={manualPassed:true,dcr121:'Completed'};
  for(const [ref,target,retest] of desired){
   const d=(await c.query('SELECT id,status FROM dcr_items WHERE dcr_ref=$1 FOR UPDATE',[ref])).rows[0];
   if(!d)throw new Error(`${ref} missing while recording DCR-121 manual PASS`);
   await c.query('UPDATE dcr_items SET status=$2,retest_result=$3,updated_at=now() WHERE id=$1',[d.id,target,retest]);
   if(d.status!==target)await c.query('INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[
    d.id,d.status,target,
    ref==='DCR-120'?'DCR-121 manual retest passed. Resume DCR-120 manual UAT one Technician journey action at a time on WO-10046 / AB26 CDE.':'DCR-121 manual retest passed. DCR-117 remains dependent on successful completion of the corrected Technician journey test.',
    'Jon – Stage 6 UAT'
   ]);
   out[ref==='DCR-120'?'dcr120':'dcr117']=target;
  }
  const d119=(await c.query("SELECT status FROM dcr_items WHERE dcr_ref='DCR-119'")).rows[0];
  if(d119?.status!=='Agreed – Awaiting Build')throw new Error('DCR-119 must remain Agreed – Awaiting Build / NOT built');
  out.dcr119=d119.status;
  return out
 })
}

async function start(){
 assertDatabaseConfigured();
 const migration=await runMigrations();
 await seed();
 const regressionSeed=await reconcileRegressionSeed();
 const testCredentials=await reconcileTestUserPasswords();
 const dcrStatus=await reconcileStage6DcrStatus();
 const port=Number(process.env.PORT||10000);
 const server=app.listen(port,'0.0.0.0',()=>{
  console.log(JSON.stringify({level:'info',event:'server_started',service:'Kooner FMS Stage 6',port,migration,regressionSeed,testCredentials:{updated:testCredentials.updated||0,skipped:!!testCredentials.skipped},dcrStatus,environment:process.env.APP_ENV||'test'}));
  if((process.env.APP_ENV||'test')==='stage6-test'){
   runLiveAcceptance(port)
    .then(core=>runFinalAcceptance(port,core).then(final=>({core,final})))
    .then(({core,final})=>runUat002Evidence(port).then(evidence=>({core,final,evidence})))
    .then(({core,final,evidence})=>runDcr117(port,core,final,evidence).then(dcr117=>({core,final,evidence,dcr117})))
    .then(({core,final,evidence,dcr117})=>runDcr118(core,final,evidence,dcr117).then(dcr118=>({core,final,evidence,dcr117,dcr118})))
    .then(({core,final,evidence,dcr117,dcr118})=>runDcr120(port,core,final,evidence,dcr117,dcr118).then(dcr120=>({core,final,evidence,dcr117,dcr118,dcr120})))
    .then(async({core,final,evidence,dcr117,dcr118,dcr120})=>{
      const manual=await preserveManualDcr121Pass();
      if(manual.manualPassed){console.log(JSON.stringify({level:'info',event:'stage6_dcr121_manual_pass_preserved',...manual}));return manual}
      return runDcr121(port,core,final,evidence,dcr117,dcr118,dcr120)
    })
    .catch(e=>console.error(JSON.stringify({level:'error',event:'stage6_acceptance_failed',message:e.message,stack:e.stack})));
  }
 });
 const shutdown=signal=>{console.log(JSON.stringify({level:'info',event:'shutdown',signal}));server.close(async()=>{await pool.end();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()};
 process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
}
start().catch(e=>{console.error(JSON.stringify({level:'error',event:'startup_failed',code:e.code||null,message:e.message,stack:e.stack}));process.exit(1)});
