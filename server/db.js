'use strict';
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const pool = new Pool({
  ...(hasDatabaseUrl?{connectionString:process.env.DATABASE_URL}:{}),
  ssl: hasDatabaseUrl ? (process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }) : false,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', err => console.error(JSON.stringify({level:'error',event:'postgres_pool_error',message:err.message})));

function assertDatabaseConfigured(){
  if(!process.env.DATABASE_URL)throw Object.assign(new Error('DATABASE_URL is required for Stage 6 database operations'),{code:'DATABASE_NOT_CONFIGURED'});
}
async function query(text, params=[]) { assertDatabaseConfigured(); return pool.query(text, params); }

async function tx(fn) {
  assertDatabaseConfigured();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getStateVersion(client=pool) {
  assertDatabaseConfigured();
  const r = await client.query("SELECT COALESCE((value->>'version')::bigint,1) version FROM system_meta WHERE key='state_version'");
  return Number(r.rows[0]?.version || 1);
}

async function bumpStateVersion(client) {
  assertDatabaseConfigured();
  const current = await getStateVersion(client);
  const next = current + 1;
  await client.query("INSERT INTO system_meta(key,value,updated_at) VALUES('state_version',jsonb_build_object('version',$1::bigint),now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",[next]);
  return next;
}

async function ping() { const r=await query('SELECT 1 ok'); return r.rows[0].ok===1; }

module.exports={pool,query,tx,getStateVersion,bumpStateVersion,ping,isProduction,assertDatabaseConfigured};
