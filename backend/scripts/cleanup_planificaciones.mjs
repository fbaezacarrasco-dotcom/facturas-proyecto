// Borra todos los registros de la tabla planificaciones (si existe)
// Uso: node scripts/cleanup_planificaciones.mjs [--drop]
//  --drop  Opcional: elimina la tabla en lugar de solo borrar filas

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

const DROP = process.argv.includes('--drop')

async function main() {
  try {
    if (DROP) {
      await pool.query('DROP TABLE IF EXISTS planificaciones')
      console.log('Tabla planificaciones eliminada (si existía).')
      return
    }
    // Verificar existencia
    const exists = await pool.query(
      `SELECT to_regclass('public.planificaciones') IS NOT NULL AS exists`)
    if (!exists.rows?.[0]?.exists) {
      console.log('La tabla planificaciones no existe. Nada que borrar.')
      return
    }
    const res = await pool.query('DELETE FROM planificaciones')
    console.log(`Registros eliminados en planificaciones: ${res.rowCount}`)
  } finally {
    await pool.end()
  }
}

main().catch(async (e) => { console.error('Error limpiando planificaciones:', e.message); try { await pool.end() } catch {} ; process.exit(1) })

