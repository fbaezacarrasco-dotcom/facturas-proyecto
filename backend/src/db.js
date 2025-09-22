import pkg from 'pg'
import bcrypt from 'bcrypt'
import dotenv from 'dotenv';

dotenv.config();
// # Conexión a PostgreSQL usando un Pool de pg
// # Preferimos Pool para reutilizar conexiones y gestionar concurrencia.
const { Pool } = pkg

// Intenta usar DATABASE_URL si existe
const connectionString = process.env.DATABASE_URL;
console.log("USUARIO CONECTADO:", process.env.PGUSER || process.env.DATABASE_URL);

export const pool = new Pool(
  connectionString
    ? { connectionString }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
      }
);

export async function initDb() {
  // # Crea tablas si no existen (migración mínima en runtime)
  // # En producción conviene usar un sistema de migraciones, pero esto
  // # nos permite levantar el entorno de desarrollo sin fricción.
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

  // Resguardos (productos pendientes) y sus archivos
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resguardos (
      id SERIAL PRIMARY KEY,
      cantidad INTEGER NOT NULL,
      tipo TEXT NOT NULL,           -- seco | refrigerado | congelado
      nombre TEXT,                  -- nombre de producto(s)
      guia TEXT,                     -- N° de factura asociado
      cliente SMALLINT NOT NULL,     -- 1..4
      fecha_ingreso DATE NOT NULL,
      fecha_salida DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS resguardo_archivos (
      id SERIAL PRIMARY KEY,
      resguardo_id INTEGER NOT NULL REFERENCES resguardos(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Asegurar columna nombre en resguardos para despliegues anteriores
  await pool.query(`ALTER TABLE resguardos ADD COLUMN IF NOT EXISTS nombre TEXT;`)

  // Rendiciones (resumen de gastos/ingresos por día/chofer/camión)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rendiciones (
      id SERIAL PRIMARY KEY,
      fecha DATE NOT NULL,
      chofer TEXT,
      camion TEXT,
      total NUMERIC,
      observaciones TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Nuevas columnas para rendiciones (compatibilidad con despliegues previos)
  await pool.query(`ALTER TABLE rendiciones ADD COLUMN IF NOT EXISTS numero_pedido TEXT;`)
  await pool.query(`ALTER TABLE rendiciones ADD COLUMN IF NOT EXISTS numero_factura TEXT;`)
  await pool.query(`ALTER TABLE rendiciones ADD COLUMN IF NOT EXISTS valor_factura NUMERIC;` )
  await pool.query(`ALTER TABLE rendiciones ADD COLUMN IF NOT EXISTS condicion_pago TEXT;`)
  await pool.query(`ALTER TABLE rendiciones ADD COLUMN IF NOT EXISTS cantidad INTEGER;`)
  await pool.query(`ALTER TABLE rendiciones ADD COLUMN IF NOT EXISTS producto TEXT;`)
  await pool.query(`ALTER TABLE rendiciones ADD COLUMN IF NOT EXISTS local TEXT;`)
  await pool.query(`ALTER TABLE rendiciones ADD COLUMN IF NOT EXISTS correo_enviado BOOLEAN;`)

  // Índices recomendados para acelerar filtros y listados
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON facturas(cliente);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_facturas_guia ON facturas(guia);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rendiciones_fecha ON rendiciones(fecha);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rendiciones_chofer ON rendiciones(chofer);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_resguardos_fecha_ingreso ON resguardos(fecha_ingreso);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ruta_status_created_at ON ruta_status(created_at);`)

  // Status de rutas (efímero: se limpia por antigüedad desde el servidor)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ruta_status (
      id SERIAL PRIMARY KEY,
      route_code TEXT NOT NULL,    -- Ej: R1, R2, ...
      status_text TEXT NOT NULL,   -- Ej: EN ALC, CAMINO A ...
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Planificaciones: almacenamos el Excel procesado como un arreglo JSON de filas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS planificaciones (
      id SERIAL PRIMARY KEY,
      cliente INTEGER,
      fecha DATE,
      descripcion TEXT,
      rows JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
  // Asegurar columnas nuevas si la tabla ya existía
  await pool.query(`ALTER TABLE planificaciones ADD COLUMN IF NOT EXISTS cliente INTEGER;`)
  await pool.query(`ALTER TABLE planificaciones ADD COLUMN IF NOT EXISTS fecha DATE;`)
  await pool.query(`ALTER TABLE planificaciones ADD COLUMN IF NOT EXISTS descripcion TEXT;`)
}

export async function query(text, params) {
  // # Helper para ejecutar queries con parámetros posicionales ($1, $2, ...)
  // # Retorna el mismo resultado que pool.query.
  return pool.query(text, params)
}

export async function ensureSeed() {
  // Seed clients (if empty)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  const { rows: clientCount } = await pool.query('SELECT COUNT(*)::int AS c FROM clients')
  if (clientCount[0].c === 0) {
    const names = ['Brival','Nutrisco','Carnicero','Gourmet']
    for (const n of names) {
      await pool.query('INSERT INTO clients (name) VALUES ($1) ON CONFLICT DO NOTHING', [n])
    }
  }

  // Users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','viewer','editor')),
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Ampliar constraint del rol si la tabla ya existía (nombre por defecto users_role_check)
  await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`)
  await pool.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','viewer','editor'));`)

  // Seed admin if none and env provided
  const { rows: userCount } = await pool.query('SELECT COUNT(*)::int AS c FROM users')
  if (userCount[0].c === 0) {
    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD
    if (adminEmail && adminPassword) {
      const hash = await bcrypt.hash(adminPassword, 10)
      await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3)', [adminEmail, hash, 'admin'])
      // eslint-disable-next-line no-console
      console.log(`Admin seed created: ${adminEmail}`)
    } else {
      // eslint-disable-next-line no-console
      console.warn('No users found and no ADMIN_EMAIL/ADMIN_PASSWORD provided; create an admin via SQL or set env to seed.')
    }
  }
}
