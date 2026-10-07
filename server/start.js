'use strict';
require('./state-syntax-hotfix');
const {runMigrations}=require('./migrate');
const {seed}=require('./seed');
const {reconcileRegressionSeed}=require('./regression-seed');
const {reconcileTestUserPasswords}=require('./test-user-passwords');
const {reconcileStage6DcrStatus}=require('./stage6-status');
const {runLiveAcceptance}=require('./live-acceptance');
const {runExtendedAcceptance}=require('./live-acceptance-extended');
const app=require('./stage6-root');
const {pool,assertDatabaseConfigured}=require('./db');

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
    .then(core=>runExtendedAcceptance(port,core))
    .catch(e=>console.error(JSON.stringify({level:'error',event:'stage6_acceptance_failed',message:e.message,stack:e.stack})));
  }
 });
 const shutdown=signal=>{console.log(JSON.stringify({level:'info',event:'shutdown',signal}));server.close(async()=>{await pool.end();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()};
 process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
}
start().catch(e=>{console.error(JSON.stringify({level:'error',event:'startup_failed',code:e.code||null,message:e.message,stack:e.stack}));process.exit(1)});
