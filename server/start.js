'use strict';
const {runMigrations}=require('./migrate');
const {seed}=require('./seed');
const {reconcileStage6DcrStatus}=require('./stage6-status');
const app=require('./stage6-root');
const {pool,assertDatabaseConfigured}=require('./db');

async function start(){
 assertDatabaseConfigured();
 const migration=await runMigrations();
 await seed();
 const dcrStatus=await reconcileStage6DcrStatus();
 const port=Number(process.env.PORT||10000);
 const server=app.listen(port,'0.0.0.0',()=>console.log(JSON.stringify({level:'info',event:'server_started',service:'Kooner FMS Stage 6',port,migration,dcrStatus,environment:process.env.APP_ENV||'test'})));
 const shutdown=signal=>{console.log(JSON.stringify({level:'info',event:'shutdown',signal}));server.close(async()=>{await pool.end();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()};
 process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
}
start().catch(e=>{console.error(JSON.stringify({level:'error',event:'startup_failed',code:e.code||null,message:e.message,stack:e.stack}));process.exit(1)});
