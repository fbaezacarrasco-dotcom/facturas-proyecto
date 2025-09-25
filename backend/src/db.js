// Módulo de acceso a datos (PostgreSQL) y creación mínima de tablas.
// Expone:
// - pool: conexión compartida a PostgreSQL
// - initDb(): crea tablas y columnas faltantes (uso dev)
// - query(text, params): helper para ejecutar SQL parametrizado
// - ensureSeed(): crea datos base (clientes/usuario admin) si no existen
import pkg from 'pg'
import bcrypt from 'bcrypt'
import dotenv from 'dotenv';

dotenv.config();
// # Conexión a PostgreSQL usando un Pool de pg
// # Preferimos Pool para reutilizar conexiones y gestionar concurrencia.
const { Pool } = pkg

// Intenta usar DATABASE_URL si existe
// Si hay DATABASE_URL se usa como cadena completa de conexión (p. ej. en cloud)
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
  // Crea tablas y columnas necesarias si no existen.
  // Nota: esto es práctico en desarrollo; en producción es preferible un
  // sistema formal de migraciones (p. ej. Prisma, Knex, Flyway, etc.).
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
      peoneta TEXT,
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
  // Nueva columna 'peoneta' para facturas (si no existe)
  await pool.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS peoneta TEXT;`)

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
  // Nueva columna ruta para resguardos
  await pool.query(`ALTER TABLE resguardos ADD COLUMN IF NOT EXISTS ruta TEXT;`)

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

  // Status de rutas (efímero: se limpia por antigüedad desde el servidor)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ruta_status (
      id SERIAL PRIMARY KEY,
      route_code TEXT NOT NULL,    -- Ej: R1, R2, ...
      status_text TEXT NOT NULL,   -- Ej: EN ALC, CAMINO A ...
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
  // Índice después de asegurar existencia de la tabla
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ruta_status_created_at ON ruta_status(created_at);`)

  // Historial de cambios para ruta_status
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ruta_status_historial (
      id SERIAL PRIMARY KEY,
      route_code TEXT NOT NULL,
      status_text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Camiones y documentos
  await pool.query(`
    CREATE TABLE IF NOT EXISTS camiones (
      id SERIAL PRIMARY KEY,
      patente VARCHAR(6) UNIQUE NOT NULL,
      modelo TEXT,
      ano INTEGER,
      marca TEXT,
      kilometraje INTEGER,
      fecha_entrada DATE NOT NULL,
      fecha_salida DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS camion_documentos (
      id SERIAL PRIMARY KEY,
      camion_id INTEGER NOT NULL REFERENCES camiones(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_camiones_patente ON camiones(patente);`)

  // Registro de bajas de camiones (motivo de eliminación)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS camion_bajas (
      id SERIAL PRIMARY KEY,
      camion_id INTEGER,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Mantenciones de camiones
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mantenciones (
      id SERIAL PRIMARY KEY,
      camion_id INTEGER NOT NULL REFERENCES camiones(id) ON DELETE CASCADE,
      tarea TEXT NOT NULL,
      tipo_control TEXT NOT NULL CHECK (tipo_control IN ('preventivo','urgente')),
      fecha_control DATE NOT NULL,
      km_antiguo INTEGER,
      km_nuevo INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
  // Nueva columna intervalo_dias (si no existe)
  await pool.query(`ALTER TABLE mantenciones ADD COLUMN IF NOT EXISTS intervalo_dias INTEGER;`)

  // Proveedores
  await pool.query(`
    CREATE TABLE IF NOT EXISTS proveedores (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      rut TEXT,
      contacto TEXT,
      fono TEXT,
      email TEXT,
      direccion TEXT,
      rubro TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Órdenes de trabajo
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ordenes (
      id SERIAL PRIMARY KEY,
      camion_id INTEGER REFERENCES camiones(id) ON DELETE SET NULL,
      proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
      patente TEXT,
      fecha DATE NOT NULL,
      tipo TEXT,
      prioridad TEXT,
      responsable TEXT,
      descripcion TEXT,
      estado TEXT,
      costo_estimado NUMERIC,
      costo_real NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Planificaciones (cabecera + filas JSONB)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS planificaciones (
      id SERIAL PRIMARY KEY,
      cliente INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      fecha DATE,
      descripcion TEXT,
      rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_planificaciones_fecha ON planificaciones(fecha);`)

  // Conductores / Peonetas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drivers (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      rut TEXT UNIQUE,
      rol TEXT NOT NULL CHECK (rol IN ('conductor','peoneta')),
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_drivers_active ON drivers(active);`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orden_documentos (
      id SERIAL PRIMARY KEY,
      orden_id INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // (planificaciones eliminado)
}

export async function query(text, params) {
  // # Helper para ejecutar queries con parámetros posicionales ($1, $2, ...)
  // # Retorna el mismo resultado que pool.query.
  return pool.query(text, params)
}

export async function ensureSeed() {
  // Inserta datos base si las tablas están vacías.
  // 1) Tabla de clientes (si no existe) y seed inicial
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

  // 2) Tabla de usuarios y constraint de roles
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

  // 3) Usuario admin de arranque si no hay usuarios y se entregan credenciales vía env
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
