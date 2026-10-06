'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {pool}=require('./db');

async function runMigrations(){
 const client=await pool.connect();
 try{
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir=path.join(__dirname,'migrations');
  const files=fs.readdirSync(dir).filter(f=>/^\d+.*\.sql$/.test(f)).sort();
  for(const file of files){
   const sql=fs.readFileSync(path.join(dir,file),'utf8');
   const checksum=crypto.createHash('sha256').update(sql).digest('hex');
   const prev=await client.query('SELECT checksum FROM schema_migrations WHERE version=$1',[file]);
   if(prev.rowCount){if(prev.rows[0].checksum!==checksum)throw new Error(`Migration ${file} changed after application`);continue}
   console.log(JSON.stringify({level:'info',event:'migration_start',migration:file}));
   await client.query('BEGIN');
   try{await client.query(sql);await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[file,checksum]);await client.query('COMMIT')}
   catch(e){await client.query('ROLLBACK');throw e}
   console.log(JSON.stringify({level:'info',event:'migration_complete',migration:file}));
  }
  const r=await client.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  return r.rows[0]?.version||'none';
 }finally{client.release()}
}
if(require.main===module){runMigrations().then(v=>{console.log(`Schema migration version: ${v}`);return pool.end()}).catch(e=>{console.error(e);process.exit(1)})}
module.exports={runMigrations};
