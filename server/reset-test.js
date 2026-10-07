'use strict';

const {pool,query,assertDatabaseConfigured}=require('./db');
const {runMigrations}=require('./migrate');
const {seed}=require('./seed');
const {reconcileRegressionSeed}=require('./regression-seed');
const {reconcileStage6DcrStatus}=require('./stage6-status');

async function reset(){
  assertDatabaseConfigured();
  const env=String(process.env.APP_ENV||'').toLowerCase();
  if(env==='production')throw new Error('Development/Test Reset is disabled in production.');
  if(process.env.ALLOW_TEST_RESET!=='true')throw new Error('Set ALLOW_TEST_RESET=true to enable the Stage 6 test reset.');
  if(process.env.RESET_CONFIRM!=='KOONER_STAGE6_TEST_RESET')throw new Error('RESET_CONFIRM does not match the required explicit test-reset confirmation.');
  await query('DROP SCHEMA public CASCADE');
  await query('CREATE SCHEMA public');
  await query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
  const migration=await runMigrations();
  const seeded=await seed();
  const regressionSeed=await reconcileRegressionSeed();
  const dcrStatus=await reconcileStage6DcrStatus();
  console.log(JSON.stringify({level:'warn',event:'stage6_test_database_reset',environment:env,migration,seeded,regressionSeed,dcrStatus}));
}

reset().then(()=>pool.end()).catch(async e=>{console.error(JSON.stringify({level:'error',event:'stage6_test_database_reset_failed',message:e.message}));try{await pool.end()}catch{}process.exit(1)});
