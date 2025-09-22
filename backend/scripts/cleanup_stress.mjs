// Cleanup tool: deletes stress-created facturas (guia LIKE 'ST-%')
// Usage:
//   node scripts/cleanup_stress.mjs
// Environment:
//   Reads Postgres config from backend/.env
//   STRESS_PREFIX=ST- (override if you changed the prefix)

import 'dotenv/config'
import pkg from 'pg'

const { Pool } = pkg
const connectionString = process.env.DATABASE_URL
const pool = new Pool(
  connectionString
    ? { connectionString }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
      }
)

const PREFIX = process.env.STRESS_PREFIX || 'ST-'

async function main() {
  console.log(`[cleanup] Deleting facturas with guia LIKE '${PREFIX}%'`)
  const { rows: cntRows } = await pool.query('SELECT COUNT(*)::int AS c FROM facturas WHERE guia LIKE $1', [PREFIX + '%'])
  const count = cntRows[0]?.c || 0
  console.log(`[cleanup] Found ${count} matching rows`)
  if (count === 0) {
    await pool.end()
    console.log('[cleanup] Nothing to do')
    return
  }
  const res = await pool.query('DELETE FROM facturas WHERE guia LIKE $1', [PREFIX + '%'])
  console.log(`[cleanup] Deleted ${res.rowCount} facturas (cascade will remove archivos/historial)`) 
  await pool.end()
}

main().catch(async (e) => { console.error('[cleanup] Error:', e); try { await pool.end() } catch {} ; process.exit(1) })

