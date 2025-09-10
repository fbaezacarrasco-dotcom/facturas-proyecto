import pkg from 'pg'
const { Pool } = pkg

const connectionString = process.env.DATABASE_URL || undefined

export const pool = new Pool(
  connectionString
    ? { connectionString }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'facturas',
      }
)

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS facturas (
      id SERIAL PRIMARY KEY,
      cliente SMALLINT NOT NULL,
      dia TEXT,
      fecha DATE NOT NULL,
      conductor_xp TEXT,
      camion TEXT,
      vueltas INTEGER,
      guia TEXT,
      local TEXT,
      kg NUMERIC,
      carga TEXT,
      observaciones TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS factura_archivos (
      id SERIAL PRIMARY KEY,
      factura_id INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Nueva columna 'estado' para facturas (si no existe)
  await pool.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS estado TEXT;`)

  // Historial de cambios por factura
  await pool.query(`
    CREATE TABLE IF NOT EXISTS factura_historial (
      id SERIAL PRIMARY KEY,
      factura_id INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
      changes JSONB NOT NULL,
      changed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
}

export async function query(text, params) {
  return pool.query(text, params)
}
