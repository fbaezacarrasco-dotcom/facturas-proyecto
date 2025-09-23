import "dotenv/config";
// # Servidor HTTP de la API: Express + CORS + Multer
// # Contiene rutas para crear/listar/editar facturas y servir archivos.
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { initDb, ensureSeed, query } from "./db.js";
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import xlsx from 'xlsx'
// # Modo demo sin DB: si SKIP_DB_INIT=1, no se conecta a Postgres y usa memoria
const SKIP_DB = String(process.env.SKIP_DB_INIT || "0").toLowerCase() === "1" || String(process.env.SKIP_DB_INIT || "").toLowerCase() === "true";

const app = express();

// # Middlewares básicos: CORS y parsers de JSON/urlencoded
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== CAPTCHA verify helper (Turnstile por defecto) =====
const CAPTCHA_ENABLED = String(process.env.CAPTCHA_ENABLED || '0').toLowerCase() === '1' || String(process.env.CAPTCHA_ENABLED || '').toLowerCase() === 'true'
const CAPTCHA_PROVIDER = (process.env.CAPTCHA_PROVIDER || 'turnstile').toLowerCase()
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || ''
const CAPTCHA_SIMPLE_TTL = process.env.CAPTCHA_SIMPLE_TTL || '120s'
const CAPTCHA_SIMPLE_SECRET = process.env.CAPTCHA_SIMPLE_SECRET || JWT_SECRET

async function verifyCaptcha(token, remoteip, answer) {
  try {
    if (!CAPTCHA_ENABLED) return true
    if (!token) return false
    if (CAPTCHA_PROVIDER === 'turnstile') {
      const form = new URLSearchParams()
      form.set('secret', CAPTCHA_SECRET)
      form.set('response', token)
      if (remoteip) form.set('remoteip', remoteip)
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
      const j = await r.json().catch(() => ({}))
      return !!j.success
    }
    if (CAPTCHA_PROVIDER === 'recaptcha') {
      const form = new URLSearchParams()
      form.set('secret', CAPTCHA_SECRET)
      form.set('response', token)
      if (remoteip) form.set('remoteip', remoteip)
      const r = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body: form })
      const j = await r.json().catch(() => ({}))
      return !!j.success
    }
    if (CAPTCHA_PROVIDER === 'simple') {
      try {
        const payload = jwt.verify(token, CAPTCHA_SIMPLE_SECRET)
        const a = Number(payload.a), b = Number(payload.b)
        const expected = a + b
        return Number(answer) === expected
      } catch {
        return false
      }
    }
    // Otros proveedores podrían añadirse aquí
    return false
  } catch {
    return false
  }
}

// # Ruta de prueba rápida
app.get("/", (req, res) => {
  res.send("🚀 Servidor funcionando!");
});

// # Healthcheck para frontend y monitoreo
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "API OK", timestamp: new Date().toISOString() });
});

// # GET /api/health/db — prueba de conectividad a la base de datos
app.get("/api/health/db", async (req, res) => {
  if (SKIP_DB) {
    return res.status(200).json({ ok: false, message: "SKIP_DB_INIT=1 (modo sin DB)" });
  }
  try {
    const { rows } = await query("SELECT 1 AS ok");
    return res.json({ ok: true, result: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "DB error", error: err.message });
  }
});

// # Auth helpers y middleware
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h' // configurable vía .env

function signToken(user) {
  // Firma JWT con expiración configurable (por defecto 8h)
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

function authMiddleware(req, _res, next) {
  const h = req.headers['authorization'] || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  if (m) {
    try { req.user = jwt.verify(m[1], JWT_SECRET) } catch { req.user = null }
  }
  next()
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, message: 'Auth requerida' })
  next()
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Auth requerida' })
    if (req.user.role !== role) return res.status(403).json({ ok: false, message: 'Permisos insuficientes' })
    next()
  }
}

// Acepta cualquiera de los roles especificados
function requireRoles(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Auth requerida' })
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, message: 'Permisos insuficientes' })
    next()
  }
}

app.use(authMiddleware)

// Listado de clientes activos para selects en el frontend
app.get('/api/clients', requireAuth, async (_req, res) => {
  try {
    if (SKIP_DB) {
      // En modo memoria devolvemos el seed por defecto
      return res.json({ ok: true, data: [
        { id: 1, name: 'Brival', active: true },
        { id: 2, name: 'Nutrisco', active: true },
        { id: 3, name: 'Carnicero', active: true },
        { id: 4, name: 'Gourmet', active: true },
      ] })
    }
    const { rows } = await query('SELECT id, name, active FROM clients WHERE active = true ORDER BY name ASC', [])
    res.json({ ok: true, data: rows })
  } catch (e) {
    res.status(500).json({ ok: false, message: 'Error al listar clientes' })
  }
})

// Historial de una ruta (todas las actualizaciones)
app.get('/api/rutas/status/historial', requireAuth, async (req, res) => {
  try {
    const route = String(req.query.route || '').trim()
    if (!route) return res.status(400).json({ ok: false, message: 'Parámetro route requerido' })
    if (SKIP_DB) {
      const items = memRutaStatusHistory
        .filter(h => h.route_code === route)
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
      return res.json({ ok: true, data: items })
    }
    const { rows } = await query('SELECT id, route_code, status_text, created_at FROM ruta_status_historial WHERE route_code=$1 ORDER BY created_at DESC', [route])
    return res.json({ ok: true, data: rows })
  } catch (e) {
    console.error('GET /api/rutas/status/historial error:', e)
    res.status(400).json({ ok: false, message: 'Error al obtener historial' })
  }
})

// # POST /auth/login — autenticar usuario y emitir JWT
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password, captchaToken, captchaAnswer } = req.body || {}
    if (!email || !password) return res.status(400).json({ ok: false, message: 'email y password requeridos' })
    // Verificación CAPTCHA (si está habilitado)
    const okCaptcha = await verifyCaptcha(captchaToken, req.ip, captchaAnswer)
    if (!okCaptcha) return res.status(400).json({ ok: false, message: 'CAPTCHA inválido' })
    if (SKIP_DB) return res.status(400).json({ ok: false, message: 'Auth no disponible en modo sin DB' })
    const { rows } = await query('SELECT id, email, password_hash, role, active FROM users WHERE email=$1', [email])
    if (!rows.length || rows[0].active === false) return res.status(401).json({ ok: false, message: 'Credenciales inválidas' })
    const u = rows[0]
    const ok = await bcrypt.compare(password, u.password_hash)
    if (!ok) return res.status(401).json({ ok: false, message: 'Credenciales inválidas' })
    const token = signToken({ id: u.id, role: u.role, email: u.email })
    res.json({ ok: true, token, user: { id: u.id, email: u.email, role: u.role } })
  } catch (err) {
    console.error('POST /auth/login error:', err)
    res.status(400).json({ ok: false, message: 'Error en login' })
  }
})

// Generar desafío CAPTCHA simple (suma) — solo si provider simple está activo
app.get('/auth/captcha', async (_req, res) => {
  if (!CAPTCHA_ENABLED || CAPTCHA_PROVIDER !== 'simple') return res.json({ ok: false, message: 'CAPTCHA simple no activo' })
  const a = 1 + Math.floor(Math.random() * 9)
  const b = 1 + Math.floor(Math.random() * 9)
  const token = jwt.sign({ a, b }, CAPTCHA_SIMPLE_SECRET, { expiresIn: CAPTCHA_SIMPLE_TTL })
  res.json({ ok: true, question: `${a} + ${b} = ?`, token, ttl: CAPTCHA_SIMPLE_TTL })
})

// ===== Admin endpoints: Users =====
app.get('/admin/users', requireRole('admin'), async (req, res) => {
  try {
    if (SKIP_DB) return res.json({ ok: true, data: [] })
    const { rows } = await query('SELECT id, email, role, active, created_at FROM users ORDER BY created_at DESC', [])
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error('GET /admin/users error:', err)
    res.status(500).json({ ok: false, message: 'Error al listar usuarios' })
  }
})

app.post('/admin/users', requireRole('admin'), async (req, res) => {
  try {
    if (SKIP_DB) return res.status(400).json({ ok: false, message: 'No disponible en modo sin DB' })
    const { email, password, role = 'viewer', active = true } = req.body || {}
    if (!email || !password || !['admin','viewer','editor'].includes(role)) {
      return res.status(400).json({ ok: false, message: 'email, password y role válidos son requeridos' })
    }
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await query('INSERT INTO users (email, password_hash, role, active) VALUES ($1,$2,$3,$4) RETURNING id, email, role, active, created_at', [email, hash, role, active])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error('POST /admin/users error:', err)
    res.status(400).json({ ok: false, message: err.message || 'Error al crear usuario' })
  }
})

app.patch('/admin/users/:id', requireRole('admin'), async (req, res) => {
  try {
    if (SKIP_DB) return res.status(400).json({ ok: false, message: 'No disponible en modo sin DB' })
    const id = Number(req.params.id)
    const { role, active } = req.body || {}
    const fields = []
    const values = []
    if (role) { if (!['admin','viewer','editor'].includes(role)) return res.status(400).json({ ok: false, message: 'role inválido' }); values.push(role); fields.push(`role = $${values.length}`) }
    if (typeof active === 'boolean') { values.push(active); fields.push(`active = $${values.length}`) }
    if (!fields.length) return res.status(400).json({ ok: false, message: 'Nada que actualizar' })
    values.push(id)
    const { rows } = await query(`UPDATE users SET ${fields.join(', ')} WHERE id=$${values.length} RETURNING id, email, role, active, created_at`, values)
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error('PATCH /admin/users/:id error:', err)
    res.status(400).json({ ok: false, message: 'Error al actualizar usuario' })
  }
})

app.patch('/admin/users/:id/password', requireRole('admin'), async (req, res) => {
  try {
    if (SKIP_DB) return res.status(400).json({ ok: false, message: 'No disponible en modo sin DB' })
    const id = Number(req.params.id)
    const { password } = req.body || {}
    if (!password) return res.status(400).json({ ok: false, message: 'password requerido' })
    const hash = await bcrypt.hash(password, 10)
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, id])
    res.json({ ok: true })
  } catch (err) {
    console.error('PATCH /admin/users/:id/password error:', err)
    res.status(400).json({ ok: false, message: 'Error al cambiar contraseña' })
  }
})

// ===== Admin endpoints: Clients =====
app.get('/admin/clients', requireRole('admin'), async (_req, res) => {
  try {
    if (SKIP_DB) return res.json({ ok: true, data: [] })
    const { rows } = await query('SELECT id, name, active, created_at FROM clients ORDER BY name ASC', [])
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error('GET /admin/clients error:', err)
    res.status(500).json({ ok: false, message: 'Error al listar clientes' })
  }
})

app.post('/admin/clients', requireRole('admin'), async (req, res) => {
  try {
    if (SKIP_DB) return res.status(400).json({ ok: false, message: 'No disponible en modo sin DB' })
    const { name } = req.body || {}
    if (!name) return res.status(400).json({ ok: false, message: 'name requerido' })
    const { rows } = await query('INSERT INTO clients (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name, active, created_at', [name])
    res.status(201).json({ ok: true, data: rows[0] || null })
  } catch (err) {
    console.error('POST /admin/clients error:', err)
    res.status(400).json({ ok: false, message: 'Error al crear cliente' })
  }
})

app.patch('/admin/clients/:id', requireRole('admin'), async (req, res) => {
  try {
    if (SKIP_DB) return res.status(400).json({ ok: false, message: 'No disponible en modo sin DB' })
    const id = Number(req.params.id)
    const { name, active } = req.body || {}
    const fields = []
    const values = []
    if (name) { values.push(name); fields.push(`name = $${values.length}`) }
    if (typeof active === 'boolean') { values.push(active); fields.push(`active = $${values.length}`) }
    if (!fields.length) return res.status(400).json({ ok: false, message: 'Nada que actualizar' })
    values.push(id)
    const { rows } = await query(`UPDATE clients SET ${fields.join(', ')} WHERE id=$${values.length} RETURNING id, name, active, created_at`, values)
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error('PATCH /admin/clients/:id error:', err)
    res.status(400).json({ ok: false, message: 'Error al actualizar cliente' })
  }
})

// # Configuración de subida de archivos para facturas (backend/uploads)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    const stamp = Date.now();
    cb(null, `${base}-${stamp}${ext}`);
  },
});

const allowedMimes = new Set([
  "image/png",
  "image/jpeg",
  "application/pdf",
]);

const upload = multer({
  storage,
  limits: { files: 5, fileSize: 15 * 1024 * 1024 }, // 15MB por archivo
  fileFilter: (_req, file, cb) => {
    if (allowedMimes.has(file.mimetype)) return cb(null, true);
    return cb(new Error("Tipo de archivo no permitido"));
  },
});

// Multer para Excel/CSV (planificación)
const uploadExcel = multer({
  storage,
  limits: { files: 1, fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const ok = ['.xlsx', '.xls', '.csv'].includes(ext)
    cb(ok ? null : new Error('Archivo no soportado (solo .xlsx/.xls/.csv)'), ok)
  }
})

// # Almacenamiento en memoria si SKIP_DB está activo (se pierde al reiniciar)
const memFacturas = [];
const memHistorial = [];
let memId = 1;
const memResguardos = [];
const memRendiciones = [];
const memRutaStatus = [];
const memRutaStatusHistory = [];
const memCamiones = [];
const memCamionBajas = [];
const memMantenciones = [];
const memProveedores = [];
const memOrdenes = [];

// # POST /api/facturas — Crear factura (DB o memoria)
app.post("/api/facturas", requireRoles(['admin','editor']), upload.array("archivos", 5), async (req, res) => {
  try {
    const b = req.body || {}
    const cliente = Number(b.cliente)
    const fecha = b.fecha
    if (!cliente || !fecha) {
      return res.status(400).json({ ok: false, message: "cliente y fecha son obligatorios" })
    }
    const files = req.files || []

    if (SKIP_DB) {
      const facturaId = memId++
      const record = {
        id: facturaId,
        cliente,
        dia: b.dia || null,
        fecha,
        conductor_xp: b.conductorXp || null,
        camion: b.camion || null,
        vueltas: b.vueltas ? Number(b.vueltas) : null,
        guia: b.guia || null,
        local: b.local || null,
        kg: b.kg ? Number(b.kg) : null,
        carga: b.carga || null,
        observaciones: b.observaciones || null,
        estado: b.estado || null,
        archivos: files.map((f) => ({ filename: f.filename, mimetype: f.mimetype, size: f.size })),
        created_at: new Date().toISOString(),
      }
      memFacturas.unshift(record)
      return res.status(201).json({ ok: true, message: "Factura creada (memoria)", id: facturaId })
    }

    const insertFactura = `
      INSERT INTO facturas (cliente, dia, fecha, conductor_xp, camion, vueltas, guia, local, kg, carga, observaciones, estado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id
    `
    const values = [
      cliente,
      b.dia || null,
      fecha,
      b.conductorXp || null,
      b.camion || null,
      b.vueltas ? Number(b.vueltas) : null,
      b.guia || null,
      b.local || null,
      b.kg ? Number(b.kg) : null,
      b.carga || null,
      b.observaciones || null,
      b.estado || null,
    ]

    const facturaRes = await query(insertFactura, values)
    const facturaId = facturaRes.rows[0].id

    if (files.length) {
      const insertArchivo = `
        INSERT INTO factura_archivos (factura_id, filename, mimetype, size)
        VALUES ($1,$2,$3,$4)
      `
      for (const f of files) {
        await query(insertArchivo, [facturaId, f.filename, f.mimetype, f.size])
      }
    }

    res.status(201).json({ ok: true, message: "Factura creada", id: facturaId })
  } catch (err) {
    console.error("POST /api/facturas error:", err)
    res.status(400).json({ ok: false, message: err.message || "Error al crear factura" })
  }
})

// # POST /api/resguardos — crear registro de resguardo (máx 5 imágenes)
app.post("/api/resguardos", requireRoles(['admin','editor']), upload.array("imagenes", 5), async (req, res) => {
  try {
    const b = req.body || {}
    const cantidad = b.cantidad ? Number(b.cantidad) : null
    const tipo = b.tipo || null
    const cliente = b.cliente ? Number(b.cliente) : null
    const fechaIngreso = b.fecha_ingreso
    if (!cantidad || !tipo || !cliente || !fechaIngreso) {
      return res.status(400).json({ ok: false, message: "cantidad, tipo, cliente y fecha_ingreso son obligatorios" })
    }
    const files = req.files || []

    if (SKIP_DB) {
      const id = memId++
      memResguardos.unshift({
        id,
        cantidad,
        tipo,
        nombre: b.nombre || null,
        guia: b.guia || null,
        cliente,
        ruta: b.ruta || null,
        fecha_ingreso: fechaIngreso,
        fecha_salida: b.fecha_salida || null,
        archivos: files.map((f) => ({ filename: f.filename, mimetype: f.mimetype, size: f.size })),
        created_at: new Date().toISOString(),
      })
      return res.status(201).json({ ok: true, id })
    }

    const sql = `
      INSERT INTO resguardos (cantidad, tipo, nombre, guia, cliente, fecha_ingreso, fecha_salida, ruta)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `
    const { rows } = await query(sql, [
      cantidad,
      tipo,
      b.nombre || null,
      b.guia || null,
      cliente,
      fechaIngreso,
      b.fecha_salida || null,
      b.ruta || null,
    ])
    const id = rows[0].id
    if (files.length) {
      const ins = `INSERT INTO resguardo_archivos (resguardo_id, filename, mimetype, size) VALUES ($1,$2,$3,$4)`
      for (const f of files) {
        await query(ins, [id, f.filename, f.mimetype, f.size])
      }
    }
    res.status(201).json({ ok: true, id })
  } catch (err) {
    console.error('POST /api/resguardos error:', err)
    res.status(400).json({ ok: false, message: err.message || 'Error al crear resguardo' })
  }
})

// ===== Rendiciones =====
// POST /api/rendiciones — crear rendición
app.post('/api/rendiciones', requireRoles(['admin','editor']), async (req, res) => {
  try {
    const b = req.body || {}
    const fecha = b.fecha
    if (!fecha) return res.status(400).json({ ok: false, message: 'fecha es obligatoria' })

    if (SKIP_DB) {
      const id = memId++
      const rec = {
        id,
        fecha,
        chofer: b.chofer || null,
        camion: b.camion || null,
        numero_pedido: b.numeroPedido || b.numero_pedido || null,
        numero_factura: b.numeroFactura || b.numero_factura || null,
        valor_factura: b.valorFactura != null ? Number(b.valorFactura) : (b.valor_factura != null ? Number(b.valor_factura) : null),
        condicion_pago: b.condicionPago || b.condicion_pago || null,
        cantidad: b.cantidad != null ? Number(b.cantidad) : null,
        producto: b.producto || null,
        local: b.local || null,
        correo_enviado: (typeof b.correo_enviado !== 'undefined' || typeof b.correoEnviado !== 'undefined') ? ['true','1','on','yes'].includes(String(b.correo_enviado ?? b.correoEnviado).toLowerCase()) : null,
        total: b.total != null ? Number(b.total) : null,
        observaciones: b.observaciones || null,
        created_at: new Date().toISOString(),
      }
      memRendiciones.unshift(rec)
      return res.status(201).json({ ok: true, data: { id } })
    }

    const { rows } = await query(
      `INSERT INTO rendiciones (fecha, chofer, camion, numero_pedido, numero_factura, valor_factura, condicion_pago, cantidad, producto, local, correo_enviado, total, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        fecha,
        b.chofer || null,
        b.camion || null,
        b.numeroPedido || b.numero_pedido || null,
        b.numeroFactura || b.numero_factura || null,
        b.valorFactura != null ? Number(b.valorFactura) : (b.valor_factura != null ? Number(b.valor_factura) : null),
        b.condicionPago || b.condicion_pago || null,
        b.cantidad != null ? Number(b.cantidad) : null,
        b.producto || null,
        b.local || null,
        (typeof b.correo_enviado !== 'undefined' || typeof b.correoEnviado !== 'undefined') ? ['true','1','on','yes'].includes(String(b.correo_enviado ?? b.correoEnviado).toLowerCase()) : null,
        b.total != null ? Number(b.total) : null,
        b.observaciones || null,
      ]
    )
    return res.status(201).json({ ok: true, data: { id: rows[0].id } })
  } catch (err) {
    console.error('POST /api/rendiciones error:', err)
    res.status(400).json({ ok: false, message: 'Error al crear rendición' })
  }
})

// ===== Rutas: Status efímero (24h) =====
// Limpieza periódica de status antiguos (> 24h)
function cleanupRutaStatusMemory() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (let i = memRutaStatus.length - 1; i >= 0; i--) {
    const t = new Date(memRutaStatus[i].created_at || memRutaStatus[i].createdAt).getTime()
    if (isFinite(t) && t < cutoff) memRutaStatus.splice(i, 1)
  }
}

async function cleanupRutaStatusDb() {
  try {
    await query("DELETE FROM ruta_status WHERE created_at < NOW() - INTERVAL '1 day'")
  } catch (e) {
    console.error('cleanup ruta_status error:', e.message)
  }
}

// GET /api/rutas/status — lista últimos 24h
app.get('/api/rutas/status', requireAuth, async (_req, res) => {
  try {
    if (SKIP_DB) {
      cleanupRutaStatusMemory()
      // ordenar por created_at DESC
      const rows = memRutaStatus.slice().sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
      return res.json({ ok: true, data: rows })
    }
    await cleanupRutaStatusDb()
    const { rows } = await query(`
      SELECT * FROM ruta_status
      WHERE created_at >= NOW() - INTERVAL '1 day'
      ORDER BY created_at DESC
    `, [])
    return res.json({ ok: true, data: rows })
  } catch (e) {
    console.error('GET /api/rutas/status error:', e)
    res.status(500).json({ ok: false, message: 'Error al listar status' })
  }
})

// POST /api/rutas/status — crear un status (admin/editor)
app.post('/api/rutas/status', requireRoles(['admin','editor']), async (req, res) => {
  try {
    const b = req.body || {}
    const route_code = b.route_code ?? b.routeCode
    const status_text = b.status_text ?? b.statusText
    if (!route_code || !status_text) return res.status(400).json({ ok: false, message: 'route_code y status_text son requeridos' })

    if (SKIP_DB) {
      const row = { id: memId++, route_code: String(route_code), status_text: String(status_text), created_at: new Date().toISOString() }
      memRutaStatus.unshift(row)
      // Registrar en historial
      memRutaStatusHistory.unshift({ id: memId++, route_code: row.route_code, status_text: row.status_text, created_at: row.created_at })
      return res.status(201).json({ ok: true, data: row })
    }

    const { rows } = await query('INSERT INTO ruta_status (route_code, status_text) VALUES ($1,$2) RETURNING *', [String(route_code), String(status_text)])
    // Registrar en historial
    await query('INSERT INTO ruta_status_historial (route_code, status_text) VALUES ($1,$2)', [String(route_code), String(status_text)])
    return res.status(201).json({ ok: true, data: rows[0] })
  } catch (e) {
    console.error('POST /api/rutas/status error:', e)
    res.status(400).json({ ok: false, message: 'Error al crear status' })
  }
})

// POST /api/rutas/status/generar — genera lote por defecto (admin/editor)
app.post('/api/rutas/status/generar', requireRoles(['admin','editor']), async (_req, res) => {
  try {
    const defaults = [
      { route_code: 'R1', status_text: 'EN ALC' },
      { route_code: 'R2', status_text: 'EN PM' },
      { route_code: 'R3', status_text: 'PN, CAMINO A PB' },
      { route_code: 'R4', status_text: 'EN CC' },
      { route_code: 'R5', status_text: 'CAMINO A PLD' },
      { route_code: 'R6', status_text: 'CAMINO A CURRACARIBS' },
      { route_code: 'R7', status_text: 'EGAÑA' },
      { route_code: 'R8', status_text: 'CAMINO A TOB' },
      { route_code: 'R9', status_text: 'CAMINO A PQA' },
      { route_code: 'R10', status_text: 'CAMINO A VSP' },
    ]
    const nowIso = new Date().toISOString()

    if (SKIP_DB) {
      // Limpiar previos de más de 24h y reemplazar set actual
      cleanupRutaStatusMemory()
      // Opcional: quitar duplicados por route_code antes de insertar
      for (let i = memRutaStatus.length - 1; i >= 0; i--) {
        if (defaults.find(d => d.route_code === memRutaStatus[i].route_code)) memRutaStatus.splice(i,1)
      }
      for (const d of defaults) {
        const row = { id: memId++, ...d, created_at: nowIso }
        memRutaStatus.unshift(row)
        memRutaStatusHistory.unshift({ id: memId++, route_code: row.route_code, status_text: row.status_text, created_at: row.created_at })
      }
      return res.status(201).json({ ok: true, inserted: defaults.length })
    }

    // DB: insert simple por lote (sin upsert; son efímeros)
    const values = []
    const params = []
    let i = 1
    for (const d of defaults) {
      params.push(d.route_code, d.status_text)
      values.push(`($${i++}, $${i++})`)
    }
    await query(`INSERT INTO ruta_status (route_code, status_text) VALUES ${values.join(',')}`, params)
    await query(`INSERT INTO ruta_status_historial (route_code, status_text) VALUES ${values.join(',')}`, params)
    await cleanupRutaStatusDb()
    return res.status(201).json({ ok: true, inserted: defaults.length })
  } catch (e) {
    console.error('POST /api/rutas/status/generar error:', e)
    res.status(400).json({ ok: false, message: 'Error al generar status' })
  }
})

// PUT /api/rutas/status/:id — editar código o texto del status (admin/editor)
app.put('/api/rutas/status/:id', requireRoles(['admin','editor']), async (req, res) => {
  const id = Number(req.params.id)
  try {
    const b = req.body || {}
    const route_code = b.route_code ?? b.routeCode
    const status_text = b.status_text ?? b.statusText

    if (SKIP_DB) {
      const idx = memRutaStatus.findIndex(r => r.id === id)
      if (idx === -1) return res.status(404).json({ ok: false, message: 'Status no encontrado' })
      const prev = memRutaStatus[idx]
      const next = { ...prev }
      if (route_code != null) next.route_code = String(route_code)
      if (status_text != null) next.status_text = String(status_text)
      memRutaStatus[idx] = next
      // Registrar en historial
      memRutaStatusHistory.unshift({ id: memId++, route_code: next.route_code, status_text: next.status_text, created_at: new Date().toISOString() })
      return res.json({ ok: true, data: next })
    }

    // DB update
    const fields = []
    const params = []
    if (route_code != null) { params.push(String(route_code)); fields.push(`route_code = $${params.length}`) }
    if (status_text != null) { params.push(String(status_text)); fields.push(`status_text = $${params.length}`) }
    if (!fields.length) return res.status(400).json({ ok: false, message: 'Nada para actualizar' })
    params.push(id)
    const { rows } = await query(`UPDATE ruta_status SET ${fields.join(', ')} WHERE id=$${params.length} RETURNING *`, params)
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Status no encontrado' })
    const updated = rows[0]
    await query('INSERT INTO ruta_status_historial (route_code, status_text) VALUES ($1,$2)', [updated.route_code, updated.status_text])
    return res.json({ ok: true, data: updated })
  } catch (e) {
    console.error('PUT /api/rutas/status/:id error:', e)
    res.status(400).json({ ok: false, message: 'Error al actualizar status' })
  }
})

// DELETE /api/rutas/status/:id — eliminar status (admin/editor)
app.delete('/api/rutas/status/:id', requireRoles(['admin','editor']), async (req, res) => {
  const id = Number(req.params.id)
  try {
    if (SKIP_DB) {
      const idx = memRutaStatus.findIndex(r => r.id === id)
      if (idx === -1) return res.status(404).json({ ok: false, message: 'Status no encontrado' })
      memRutaStatus.splice(idx, 1)
      return res.json({ ok: true })
    }
    const { rowCount } = await query('DELETE FROM ruta_status WHERE id=$1', [id])
    if (!rowCount) return res.status(404).json({ ok: false, message: 'Status no encontrado' })
    return res.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/rutas/status/:id error:', e)
    res.status(400).json({ ok: false, message: 'Error al eliminar status' })
  }
})

// GET /api/rendiciones — listar con filtros simples
app.get('/api/rendiciones', requireAuth, async (req, res) => {
  try {
    const { fecha, chofer, q, correo, limit = 50, offset = 0 } = req.query
    const parseBool = (v) => {
      if (v == null) return null
      const s = String(v).toLowerCase()
      if (['1','true','si','sí','on','yes'].includes(s)) return true
      if (['0','false','no','off'].includes(s)) return false
      return null
    }
    const correoVal = parseBool(correo)
    if (SKIP_DB) {
      let rows = memRendiciones.slice()
      if (fecha) rows = rows.filter(r => String(r.fecha) === String(fecha))
      if (chofer) rows = rows.filter(r => (r.chofer || '').toLowerCase().includes(String(chofer).toLowerCase()))
      if (correoVal !== null) rows = rows.filter(r => r.correo_enviado === correoVal)
      if (q) {
        const n = String(q).toLowerCase()
        rows = rows.filter(r => [r.chofer, r.camion, r.observaciones].map(x => String(x||'').toLowerCase()).some(v => v.includes(n)))
      }
      const start = Number(offset) || 0
      const end = start + Math.min(200, Number(limit) || 50)
      return res.json({ ok: true, data: rows.slice(start, end) })
    }

    const conds = []
    const params = []
    if (fecha) { params.push(fecha); conds.push(`fecha = $${params.length}`) }
    if (chofer) { params.push(`%${chofer}%`); conds.push(`chofer ILIKE $${params.length}`) }
    if (correoVal !== null) { params.push(correoVal); conds.push(`correo_enviado = $${params.length}`) }
    if (q) { params.push(`%${q}%`); conds.push(`(chofer ILIKE $${params.length} OR camion ILIKE $${params.length} OR observaciones ILIKE $${params.length})`) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    params.push(Math.min(200, Number(limit)))
    params.push(Number(offset))
    const sql = `
      SELECT * FROM rendiciones
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `
    const { rows } = await query(sql, params)
    return res.json({ ok: true, data: rows })
  } catch (err) {
    console.error('GET /api/rendiciones error:', err)
    res.status(500).json({ ok: false, message: 'Error al listar rendiciones' })
  }
})

// PUT /api/rendiciones/:id — editar rendición
app.put('/api/rendiciones/:id', requireRoles(['admin','editor']), async (req, res) => {
  const id = Number(req.params.id)
  try {
    const b = req.body || {}
    if (SKIP_DB) {
      const idx = memRendiciones.findIndex(r => r.id === id)
      if (idx === -1) return res.status(404).json({ ok: false, message: 'Rendición no encontrada' })
      const prev = memRendiciones[idx]
      const next = {
        ...prev,
        fecha: b.fecha ?? prev.fecha,
        chofer: b.chofer ?? prev.chofer,
        camion: b.camion ?? prev.camion,
        total: b.total != null ? Number(b.total) : prev.total,
        observaciones: b.observaciones ?? prev.observaciones,
      }
      memRendiciones[idx] = next
      return res.json({ ok: true, data: next })
    }

    // Fetch prev to keep consistent types
    const { rows: prevRows } = await query('SELECT * FROM rendiciones WHERE id=$1', [id])
    if (!prevRows.length) return res.status(404).json({ ok: false, message: 'Rendición no encontrada' })
    const prev = prevRows[0]
    const values = {
      fecha: b.fecha ?? prev.fecha,
      chofer: b.chofer ?? prev.chofer,
      camion: b.camion ?? prev.camion,
      numero_pedido: (b.numeroPedido ?? b.numero_pedido) ?? prev.numero_pedido,
      numero_factura: (b.numeroFactura ?? b.numero_factura) ?? prev.numero_factura,
      valor_factura: (b.valorFactura != null ? Number(b.valorFactura) : (b.valor_factura != null ? Number(b.valor_factura) : prev.valor_factura)),
      condicion_pago: (b.condicionPago ?? b.condicion_pago) ?? prev.condicion_pago,
      cantidad: b.cantidad != null ? Number(b.cantidad) : prev.cantidad,
      producto: b.producto ?? prev.producto,
      local: b.local ?? prev.local,
      correo_enviado: (typeof b.correo_enviado !== 'undefined' || typeof b.correoEnviado !== 'undefined') ? ['true','1','on','yes'].includes(String(b.correo_enviado ?? b.correoEnviado).toLowerCase()) : prev.correo_enviado,
      total: b.total != null ? Number(b.total) : prev.total,
      observaciones: b.observaciones ?? prev.observaciones,
    }
    const { rows } = await query(
      'UPDATE rendiciones SET fecha=$1, chofer=$2, camion=$3, numero_pedido=$4, numero_factura=$5, valor_factura=$6, condicion_pago=$7, cantidad=$8, producto=$9, local=$10, correo_enviado=$11, total=$12, observaciones=$13 WHERE id=$14 RETURNING *',
      [values.fecha, values.chofer, values.camion, values.numero_pedido, values.numero_factura, values.valor_factura, values.condicion_pago, values.cantidad, values.producto, values.local, values.correo_enviado, values.total, values.observaciones, id]
    )
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error('PUT /api/rendiciones/:id error:', err)
    res.status(400).json({ ok: false, message: 'Error al actualizar rendición' })
  }
})

// DELETE /api/rendiciones/:id — eliminar rendición
app.delete('/api/rendiciones/:id', requireRoles(['admin','editor']), async (req, res) => {
  const id = Number(req.params.id)
  try {
    if (SKIP_DB) {
      const idx = memRendiciones.findIndex(r => r.id === id)
      if (idx === -1) return res.status(404).json({ ok: false, message: 'Rendición no encontrada' })
      memRendiciones.splice(idx, 1)
      return res.json({ ok: true })
    }
    const { rowCount } = await query('DELETE FROM rendiciones WHERE id=$1', [id])
    if (!rowCount) return res.status(404).json({ ok: false, message: 'Rendición no encontrada' })
    return res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/rendiciones/:id error:', err)
    res.status(400).json({ ok: false, message: 'Error al eliminar rendición' })
  }
})

// # GET /api/resguardos — listar resguardos con filtros básicos (auth requerida)
app.get('/api/resguardos', requireAuth, async (req, res) => {
  try {
    const { cliente, fecha, guia, q, limit = 50, offset = 0 } = req.query
    if (SKIP_DB) {
      let rows = memResguardos.slice()
      if (cliente) rows = rows.filter(r => String(r.cliente) === String(cliente))
      if (fecha) rows = rows.filter(r => String(r.fecha_ingreso) === String(fecha))
      if (guia) rows = rows.filter(r => String(r.guia || '').toLowerCase() === String(guia).toLowerCase())
      if (q) {
        const n = String(q).toLowerCase()
        rows = rows.filter(r => [r.tipo, r.guia, r.cantidad, r.fecha_salida].map(x => String(x||'').toLowerCase()).some(v => v.includes(n)))
      }
      const start = Number(offset) || 0
      const end = start + Math.min(200, Number(limit) || 50)
      return res.json({ ok: true, data: rows.slice(start, end) })
    }

    const conds = []
    const params = []
    if (cliente) { params.push(Number(cliente)); conds.push(`r.cliente = $${params.length}`) }
    if (fecha) { params.push(fecha); conds.push(`r.fecha_ingreso = $${params.length}`) }
    if (guia) { params.push(guia); conds.push(`r.guia = $${params.length}`) }
    if (q) {
      params.push(`%${q}%`)
      conds.push(`(r.tipo ILIKE $${params.length} OR r.guia ILIKE $${params.length})`)
    }
    params.push(Math.min(200, Number(limit)))
    params.push(Number(offset))
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const sql = `
      SELECT r.*,
        COALESCE(json_agg(json_build_object('filename', ra.filename, 'mimetype', ra.mimetype, 'size', ra.size))
          FILTER (WHERE ra.id IS NOT NULL), '[]') AS archivos
      FROM resguardos r
      LEFT JOIN resguardo_archivos ra ON ra.resguardo_id = r.id
      ${where}
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `
    const { rows } = await query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error('GET /api/resguardos error:', err)
    res.status(500).json({ ok: false, message: 'Error al listar resguardos' })
  }
})

// # GET /api/facturas/export — exporta CSV con los mismos filtros que el listado
app.get('/api/facturas/export', requireAuth, async (req, res) => {
  try {
    const { cliente, from: fromDate, to: toDate, fecha, guia, sort = '', q } = req.query

    const toCsv = (rows) => {
      const cols = [
        'fecha','guia','conductor_xp','local','estado','cliente','kg','vueltas','camion','carga','observaciones','archivos'
      ]
      const esc = (v) => {
        const s = v == null ? '' : String(v)
        const need = /[",\n]/.test(s)
        return need ? '"' + s.replaceAll('"','""') + '"' : s
      }
      const header = cols.join(',')
      const clientMap = { 1: 'Brival', 2: 'Nutrisco', 3: 'Carnicero', 4: 'Gourmet' }
      const lines = rows.map(r => {
        const files = (r.archivos || []).map(a => a.filename).join(';')
        const clienteNombre = r.cliente_name || clientMap[Number(r.cliente)] || r.cliente || ''
        return [r.fecha, r.guia, r.conductor_xp, r.local, r.estado, clienteNombre, r.kg, r.vueltas, r.camion, r.carga, r.observaciones, files]
          .map(esc).join(',')
      })
      return [header, ...lines].join('\n')
    }

    if (SKIP_DB) {
      let rows = memFacturas.slice();
      if (cliente) rows = rows.filter((f) => String(f.cliente) === String(cliente));
      if (fromDate) rows = rows.filter((f) => f.fecha >= fromDate);
      if (toDate) rows = rows.filter((f) => f.fecha <= toDate);
      if (fecha) rows = rows.filter((f) => String(f.fecha) === String(fecha));
      if (guia) rows = rows.filter((f) => String(f.guia || '').toLowerCase() === String(guia).toLowerCase());
      if (q) {
        const needle = String(q).toLowerCase();
        rows = rows.filter((f) =>
          [f.guia, f.conductor_xp, f.camion, f.local, f.carga, f.observaciones]
            .map((x) => (x || "").toLowerCase())
            .some((v) => v.includes(needle))
        );
      }
      if (sort === 'guia_asc' || sort === 'guia_desc') {
        const dir = sort === 'guia_asc' ? 1 : -1;
        const num = (s) => {
          const n = parseInt(String(s || '').replace(/\D/g, ''), 10);
          if (Number.isFinite(n)) return n;
          return dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
        };
        rows.sort((a, b) => (num(a.guia) - num(b.guia)) * dir);
      }
      const csv = toCsv(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="facturas-export-${Date.now()}.csv"`)
      return res.send('\uFEFF' + csv) // BOM para Excel
    }

    const conds = []
    const params = []
    if (cliente) { params.push(Number(cliente)); conds.push(`cliente = $${params.length}`) }
    if (fromDate) { params.push(fromDate); conds.push(`fecha >= $${params.length}`) }
    if (toDate) { params.push(toDate); conds.push(`fecha <= $${params.length}`) }
    if (fecha) { params.push(fecha); conds.push(`fecha = $${params.length}`) }
    if (guia) { params.push(guia); conds.push(`guia = $${params.length}`) }
    if (q) {
      params.push(`%${q}%`)
      conds.push(`(
        guia ILIKE $${params.length} OR
        conductor_xp ILIKE $${params.length} OR
        camion ILIKE $${params.length} OR
        local ILIKE $${params.length} OR
        carga ILIKE $${params.length} OR
        observaciones ILIKE $${params.length}
      )`)
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    let orderClause = 'ORDER BY f.created_at DESC'
    // Evitar error de casteo con guías vacías: usar NULLIF(...,'')::bigint
    const guiaNumExpr = "NULLIF(regexp_replace(COALESCE(f.guia,''), '\\D','','g'), '')::bigint"
    if (String(sort) === 'guia_asc') orderClause = `ORDER BY ${guiaNumExpr} ASC NULLS LAST`
    else if (String(sort) === 'guia_desc') orderClause = `ORDER BY ${guiaNumExpr} DESC NULLS LAST`

    const sql = `
      SELECT f.*, c.name AS cliente_name,
        COALESCE(json_agg(json_build_object('filename', fa.filename, 'mimetype', fa.mimetype, 'size', fa.size))
          FILTER (WHERE fa.id IS NOT NULL), '[]') AS archivos
      FROM facturas f
      LEFT JOIN factura_archivos fa ON fa.factura_id = f.id
      LEFT JOIN clients c ON c.id = f.cliente
      ${where}
      GROUP BY f.id, c.name
      ${orderClause}
    `
    const { rows } = await query(sql, params)
    const csv = toCsv(rows)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="facturas-export-${Date.now()}.csv"`)
    return res.send('\uFEFF' + csv)
  } catch (err) {
    console.error('GET /api/facturas/export error:', err)
    res.status(500).json({ ok: false, message: 'Error al exportar facturas' })
  }
})

// # GET /api/resguardos/export — exporta CSV de resguardos
app.get('/api/resguardos/export', requireAuth, async (req, res) => {
  try {
    const { cliente, fecha, guia, q } = req.query
    const toCsv = (rows) => {
      const cols = ['fecha_ingreso','cliente','nombre','guia','cantidad','tipo','fecha_salida','archivos']
      const esc = (v) => {
        const s = v == null ? '' : String(v)
        const need = /[",\n]/.test(s)
        return need ? '"' + s.replaceAll('"','""') + '"' : s
      }
      const header = cols.join(',')
      const clientMap = { 1: 'Brival', 2: 'Nutrisco', 3: 'Carnicero', 4: 'Gourmet' }
      const lines = rows.map(r => {
        const files = (r.archivos || []).map(a => a.filename).join(';')
        const clienteNombre = r.cliente_name || clientMap[Number(r.cliente)] || r.cliente || ''
        return [r.fecha_ingreso, clienteNombre, r.nombre, r.guia, r.cantidad, r.tipo, r.fecha_salida, files].map(esc).join(',')
      })
      return [header, ...lines].join('\n')
    }

    if (SKIP_DB) {
      let rows = memResguardos.slice()
      if (cliente) rows = rows.filter(r => String(r.cliente) === String(cliente))
      if (fecha) rows = rows.filter(r => String(r.fecha_ingreso) === String(fecha))
      if (guia) rows = rows.filter(r => String(r.guia || '').toLowerCase() === String(guia).toLowerCase())
      if (q) {
        const n = String(q).toLowerCase()
        rows = rows.filter(r => [r.tipo, r.guia, r.nombre, r.cantidad, r.fecha_salida].map(x => String(x||'').toLowerCase()).some(v => v.includes(n)))
      }
      const csv = toCsv(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="resguardos-export-${Date.now()}.csv"`)
      return res.send('\uFEFF' + csv)
    }

    const conds = []
    const params = []
    if (cliente) { params.push(Number(cliente)); conds.push(`r.cliente = $${params.length}`) }
    if (fecha) { params.push(fecha); conds.push(`r.fecha_ingreso = $${params.length}`) }
    if (guia) { params.push(guia); conds.push(`r.guia = $${params.length}`) }
    if (q) { params.push(`%${q}%`); conds.push(`(r.tipo ILIKE $${params.length} OR r.guia ILIKE $${params.length} OR r.nombre ILIKE $${params.length})`) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const sql = `
      SELECT r.*, c.name AS cliente_name,
        COALESCE(json_agg(json_build_object('filename', ra.filename, 'mimetype', ra.mimetype, 'size', ra.size))
          FILTER (WHERE ra.id IS NOT NULL), '[]') AS archivos
      FROM resguardos r
      LEFT JOIN resguardo_archivos ra ON ra.resguardo_id = r.id
      LEFT JOIN clients c ON c.id = r.cliente
      ${where}
      GROUP BY r.id, c.name
      ORDER BY r.created_at DESC
    `
    const { rows } = await query(sql, params)
    const csv = toCsv(rows)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="resguardos-export-${Date.now()}.csv"`)
    return res.send('\uFEFF' + csv)
  } catch (err) {
    console.error('GET /api/resguardos/export error:', err)
    res.status(500).json({ ok: false, message: 'Error al exportar resguardos' })
  }
})

// # GET /api/facturas/stats — métricas simples por estado (filtros: cliente, fecha, estado)
// Lenguaje simple: cuenta cuántas facturas hay y cuántas están “entregadas”.
// Lenguaje técnico: agrega por columna estado (CASE-insensitive) y sintetiza
//   total y la suma de estados que empiezan por 'entregado%'. Acepta query
//   string "cliente" para filtrar por cliente (SMALLINT 1..4 en este proyecto).
//   Además soporta "fecha" (YYYY-MM-DD) y "estado" (nombre exacto). Si
//   "estado" se envía, se cuenta solo ese estado; si no, se agrupa por
//   prefijo 'entregado%'.
app.get('/api/facturas/stats', requireAuth, async (req, res) => {
  try {
    const { cliente, fecha, estado } = req.query

    if (SKIP_DB) {
      // Modo memoria: trabajamos sobre el arreglo memFacturas
      let rows = memFacturas.slice()
      if (cliente) rows = rows.filter(f => String(f.cliente) === String(cliente))
      if (fecha) rows = rows.filter(f => String(f.fecha) === String(fecha))
      const by_estado = {}
      for (const f of rows) {
        const e = (f.estado || '').trim().toLowerCase()
        by_estado[e] = (by_estado[e] || 0) + 1
      }
      const total = rows.length
      const entregada = estado
        ? (by_estado[String(estado).toLowerCase()] || 0)
        : Object.entries(by_estado)
            .filter(([k]) => k.startsWith('entregado'))
            .reduce((a, [, v]) => a + v, 0)
      return res.json({ ok: true, data: { total, entregada, by_estado } })
    }

    // Modo DB: un GROUP BY y post-procesado en Node para armar el shape final
    const conds = []
    const params = []
    if (cliente) { params.push(Number(cliente)); conds.push(`cliente = $${params.length}`) }
    if (fecha) { params.push(fecha); conds.push(`fecha = $${params.length}`) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const sql = `
      SELECT COALESCE(estado,'') AS estado, COUNT(*)::int AS c
      FROM facturas
      ${where}
      GROUP BY COALESCE(estado,'')
    `
    const { rows } = await query(sql, params)
    const by_estado = {}
    let total = 0
    for (const r of rows) { by_estado[String(r.estado).toLowerCase()] = r.c; total += r.c }
    const entregada = estado
      ? (by_estado[String(estado).toLowerCase()] || 0)
      : Object.entries(by_estado)
          .filter(([k]) => k.startsWith('entregado'))
          .reduce((a, [, v]) => a + v, 0)
    return res.json({ ok: true, data: { total, entregada, by_estado } })
  } catch (err) {
    console.error('GET /api/facturas/stats error:', err)
    res.status(500).json({ ok: false, message: 'Error al obtener estadísticas' })
  }
})

// # GET /api/rendiciones/export — exporta CSV con filtros fecha/chofer/q
app.get('/api/rendiciones/export', requireAuth, async (req, res) => {
  try {
    const { fecha, chofer, q } = req.query

    const toCsv = (rows) => {
      const cols = ['fecha','chofer','camion','producto','cantidad','local','numero_pedido','numero_factura','valor_factura','condicion_pago','correo','total','observaciones']
      const esc = (v) => {
        const s = v == null ? '' : String(v)
        const need = /[",\n]/.test(s)
        return need ? '"' + s.replaceAll('"','""') + '"' : s
      }
      const header = cols.join(',')
      const lines = rows.map(r => [
        r.fecha,
        r.chofer,
        r.camion,
        r.producto,
        r.cantidad,
        r.local,
        r.numero_pedido,
        r.numero_factura,
        r.valor_factura,
        r.condicion_pago,
        (r.correo_enviado === true ? 'correcto' : r.correo_enviado === false ? 'incorrecto' : ''),
        r.total,
        r.observaciones,
      ].map(esc).join(','))
      return [header, ...lines].join('\n')
    }

    if (SKIP_DB) {
      let rows = memRendiciones.slice()
      if (fecha) rows = rows.filter(r => String(r.fecha) === String(fecha))
      if (chofer) rows = rows.filter(r => (r.chofer || '').toLowerCase().includes(String(chofer).toLowerCase()))
      if (q) {
        const n = String(q).toLowerCase()
        rows = rows.filter(r => [r.chofer, r.camion, r.observaciones, r.numero_pedido, r.numero_factura, r.condicion_pago]
          .map(x => String(x||'').toLowerCase()).some(v => v.includes(n)))
      }
      const csv = toCsv(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="rendiciones-export-${Date.now()}.csv"`)
      return res.send('\uFEFF' + csv)
    }

    const conds = []
    const params = []
    if (fecha) { params.push(fecha); conds.push(`fecha = $${params.length}`) }
    if (chofer) { params.push(`%${chofer}%`); conds.push(`chofer ILIKE $${params.length}`) }
    if (q) { params.push(`%${q}%`); conds.push(`(chofer ILIKE $${params.length} OR camion ILIKE $${params.length} OR observaciones ILIKE $${params.length} OR numero_pedido ILIKE $${params.length} OR numero_factura ILIKE $${params.length} OR condicion_pago ILIKE $${params.length})`) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const sql = `SELECT fecha, chofer, camion, producto, cantidad, local, numero_pedido, numero_factura, valor_factura, condicion_pago, correo_enviado, total, observaciones FROM rendiciones ${where} ORDER BY created_at DESC`
    const { rows } = await query(sql, params)
    const csv = toCsv(rows)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="rendiciones-export-${Date.now()}.csv"`)
    return res.send('\uFEFF' + csv)
  } catch (err) {
    console.error('GET /api/rendiciones/export error:', err)
    res.status(500).json({ ok: false, message: 'Error al exportar rendiciones' })
  }
})

// # PUT /api/resguardos/:id — editar campos básicos del resguardo
app.put('/api/resguardos/:id', requireRoles(['admin','editor']), async (req, res) => {
  const id = Number(req.params.id)
  try {
    const b = req.body || {}
    if (SKIP_DB) {
      const idx = memResguardos.findIndex(r => r.id === id)
      if (idx === -1) return res.status(404).json({ ok: false, message: 'Resguardo no encontrado' })
      const prev = memResguardos[idx]
      const next = {
        ...prev,
        cantidad: b.cantidad != null ? Number(b.cantidad) : prev.cantidad,
        tipo: b.tipo ?? prev.tipo,
        nombre: b.nombre ?? prev.nombre,
        guia: b.guia ?? prev.guia,
        cliente: b.cliente != null ? Number(b.cliente) : prev.cliente,
        fecha_ingreso: b.fecha_ingreso ?? prev.fecha_ingreso,
        fecha_salida: b.fecha_salida ?? prev.fecha_salida,
        ruta: b.ruta ?? prev.ruta,
      }
      memResguardos[idx] = next
      return res.json({ ok: true, data: next })
    }

    const { rows: prevRows } = await query('SELECT * FROM resguardos WHERE id=$1', [id])
    if (!prevRows.length) return res.status(404).json({ ok: false, message: 'Resguardo no encontrado' })
    const prev = prevRows[0]
    const values = {
      cantidad: b.cantidad != null ? Number(b.cantidad) : prev.cantidad,
      tipo: b.tipo ?? prev.tipo,
      nombre: b.nombre ?? prev.nombre,
      guia: b.guia ?? prev.guia,
      cliente: b.cliente != null ? Number(b.cliente) : prev.cliente,
      fecha_ingreso: b.fecha_ingreso ?? prev.fecha_ingreso,
      fecha_salida: b.fecha_salida ?? prev.fecha_salida,
      ruta: b.ruta ?? prev.ruta,
    }
    const sql = `
      UPDATE resguardos
      SET cantidad=$1, tipo=$2, nombre=$3, guia=$4, cliente=$5, fecha_ingreso=$6, fecha_salida=$7, ruta=$8
      WHERE id=$9
      RETURNING *
    `
    const { rows } = await query(sql, [
      values.cantidad,
      values.tipo,
      values.nombre,
      values.guia,
      values.cliente,
      values.fecha_ingreso,
      values.fecha_salida,
      values.ruta,
      id,
    ])
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error('PUT /api/resguardos/:id error:', err)
    res.status(400).json({ ok: false, message: err.message || 'Error al editar resguardo' })
  }
})

// # DELETE /api/resguardos/:id — eliminar resguardo y sus archivos
app.delete('/api/resguardos/:id', requireRoles(['admin','editor']), async (req, res) => {
  const id = Number(req.params.id)
  try {
    if (SKIP_DB) {
      const idx = memResguardos.findIndex(r => r.id === id)
      if (idx === -1) return res.status(404).json({ ok: false, message: 'Resguardo no encontrado' })
      // intentar borrar archivos físicos si existen
      try {
        const files = memResguardos[idx].archivos || []
        for (const f of files) {
          const p = path.join(uploadsDir, f.filename)
          try { fs.unlinkSync(p) } catch {}
        }
      } catch {}
      memResguardos.splice(idx, 1)
      return res.json({ ok: true })
    }

    // Obtener archivos para borrarlos del disco
    const { rows: files } = await query('SELECT filename FROM resguardo_archivos WHERE resguardo_id=$1', [id])
    await query('DELETE FROM resguardos WHERE id=$1', [id])
    for (const row of files) {
      const p = path.join(uploadsDir, row.filename)
      try { fs.unlinkSync(p) } catch {}
    }
    return res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/resguardos/:id error:', err)
    res.status(400).json({ ok: false, message: err.message || 'Error al eliminar resguardo' })
  }
})

// # GET /api/facturas — Listado de facturas con filtros (cliente, fecha exacta, guia exacta, búsqueda general)
app.get("/api/facturas", requireAuth, async (req, res) => {
  try {
    const {
      cliente,
      from: fromDate,
      to: toDate,
      fecha,
      guia,
      sort = '',
      q,
      limit = 50,
      offset = 0,
    } = req.query

    if (SKIP_DB) {
      let rows = memFacturas.slice();
      if (cliente) rows = rows.filter((f) => String(f.cliente) === String(cliente));
      if (fromDate) rows = rows.filter((f) => f.fecha >= fromDate);
      if (toDate) rows = rows.filter((f) => f.fecha <= toDate);
      if (fecha) rows = rows.filter((f) => String(f.fecha) === String(fecha));
      if (guia) rows = rows.filter((f) => String(f.guia || '').toLowerCase() === String(guia).toLowerCase());
      if (q) {
        const needle = String(q).toLowerCase();
        rows = rows.filter((f) =>
          [f.guia, f.conductor_xp, f.camion, f.local, f.carga, f.observaciones]
            .map((x) => (x || "").toLowerCase())
            .some((v) => v.includes(needle))
        );
      }
      // Orden en modo memoria
      if (sort === 'guia_asc' || sort === 'guia_desc') {
        const dir = sort === 'guia_asc' ? 1 : -1;
        const num = (s) => {
          const n = parseInt(String(s || '').replace(/\D/g, ''), 10);
          if (Number.isFinite(n)) return n;
          // Empujar vacíos al final/principio según dirección
          return dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
        };
        rows.sort((a, b) => (num(a.guia) - num(b.guia)) * dir);
      } else if (sort === 'kg_asc' || sort === 'kg_desc') {
        const dir = sort === 'kg_asc' ? 1 : -1
        rows.sort((a, b) => {
          const av = Number(a.kg); const bv = Number(b.kg)
          const aa = Number.isFinite(av) ? av : (dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
          const bb = Number.isFinite(bv) ? bv : (dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
          return (aa - bb) * dir
        })
      } else if (sort === 'vueltas_asc' || sort === 'vueltas_desc') {
        const dir = sort === 'vueltas_asc' ? 1 : -1
        rows.sort((a, b) => {
          const av = Number(a.vueltas); const bv = Number(b.vueltas)
          const aa = Number.isFinite(av) ? av : (dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
          const bb = Number.isFinite(bv) ? bv : (dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
          return (aa - bb) * dir
        })
      } else if (sort === 'fecha_asc' || sort === 'fecha_desc') {
        const dir = sort === 'fecha_asc' ? 1 : -1
        rows.sort((a, b) => {
          const av = String(a.fecha || '')
          const bv = String(b.fecha || '')
          if (av === bv) return 0
          return (av < bv ? -1 : 1) * dir
        })
      }
      const start = Number(offset) || 0;
      const end = start + Math.min(200, Number(limit) || 50);
      return res.json({ ok: true, data: rows.slice(start, end) });
    }

    const conds = []
    const params = []

    if (cliente) {
      params.push(Number(cliente))
      conds.push(`cliente = $${params.length}`)
    }
    if (fromDate) {
      params.push(fromDate)
      conds.push(`fecha >= $${params.length}`)
    }
    if (toDate) {
      params.push(toDate)
      conds.push(`fecha <= $${params.length}`)
    }
    if (fecha) {
      params.push(fecha)
      conds.push(`fecha = $${params.length}`)
    }
    if (guia) {
      params.push(guia)
      conds.push(`guia = $${params.length}`)
    }
    if (q) {
      params.push(`%${q}%`)
      conds.push(`(
        guia ILIKE $${params.length} OR
        conductor_xp ILIKE $${params.length} OR
        camion ILIKE $${params.length} OR
        local ILIKE $${params.length} OR
        carga ILIKE $${params.length} OR
        observaciones ILIKE $${params.length}
      )`)
    }

    params.push(Math.min(200, Number(limit)))
    params.push(Number(offset))

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : ""
    // Orden solicitado; por defecto fecha de creación
    const sortParam = String(sort || '')
    let orderClause = 'ORDER BY f.created_at DESC'
    // Evitar casteo inválido: si no hay dígitos, usar NULL y ordenar con NULLS LAST
    const guiaNumExpr = "NULLIF(regexp_replace(COALESCE(f.guia,''), '\\D','','g'), '')::bigint"
    if (sortParam === 'guia_asc') {
      orderClause = `ORDER BY ${guiaNumExpr} ASC NULLS LAST`
    } else if (sortParam === 'guia_desc') {
      orderClause = `ORDER BY ${guiaNumExpr} DESC NULLS LAST`
    } else if (sortParam === 'kg_asc') {
      orderClause = 'ORDER BY f.kg ASC NULLS LAST'
    } else if (sortParam === 'kg_desc') {
      orderClause = 'ORDER BY f.kg DESC NULLS LAST'
    } else if (sortParam === 'vueltas_asc') {
      orderClause = 'ORDER BY f.vueltas ASC NULLS LAST'
    } else if (sortParam === 'vueltas_desc') {
      orderClause = 'ORDER BY f.vueltas DESC NULLS LAST'
    } else if (sortParam === 'fecha_asc') {
      orderClause = 'ORDER BY f.fecha ASC NULLS LAST'
    } else if (sortParam === 'fecha_desc') {
      orderClause = 'ORDER BY f.fecha DESC NULLS LAST'
    }
    const sql = `
      SELECT f.*,
        COALESCE(json_agg(json_build_object('filename', fa.filename, 'mimetype', fa.mimetype, 'size', fa.size))
          FILTER (WHERE fa.id IS NOT NULL), '[]') AS archivos
      FROM facturas f
      LEFT JOIN factura_archivos fa ON fa.factura_id = f.id
      ${where}
      GROUP BY f.id
      ${orderClause}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `
    const { rows } = await query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error("GET /api/facturas error:", err)
    res.status(500).json({ ok: false, message: "Error al listar facturas" })
  }
})

// # POST /api/facturas/bulk-delete — elimina facturas por filtros (solo admin/editor)
// Seguridad: requiere al menos un filtro (cliente/fecha/from/to/guia/q) para evitar borrar todo.
app.post('/api/facturas/bulk-delete', requireRoles(['admin','editor']), async (req, res) => {
  try {
    const { cliente, from: fromDate, to: toDate, fecha, guia, q } = req.body || {}

    // Validación: no permitir borrado sin filtros
    if (!cliente && !fromDate && !toDate && !fecha && !guia && !q) {
      return res.status(400).json({ ok: false, message: 'Debes especificar al menos un filtro para eliminar (cliente, fecha, rango, guía o búsqueda).' })
    }

    if (SKIP_DB) {
      // Filtrar en memoria, recolectar archivos y eliminar
      let rows = memFacturas.slice();
      if (cliente) rows = rows.filter((f) => String(f.cliente) === String(cliente));
      if (fromDate) rows = rows.filter((f) => f.fecha >= fromDate);
      if (toDate) rows = rows.filter((f) => f.fecha <= toDate);
      if (fecha) rows = rows.filter((f) => String(f.fecha) === String(fecha));
      if (guia) rows = rows.filter((f) => String(f.guia || '').toLowerCase() === String(guia).toLowerCase());
      if (q) {
        const needle = String(q).toLowerCase();
        rows = rows.filter((f) =>
          [f.guia, f.conductor_xp, f.camion, f.local, f.carga, f.observaciones]
            .map((x) => (x || "").toLowerCase())
            .some((v) => v.includes(needle))
        );
      }
      const ids = new Set(rows.map(r => r.id))
      // Borrar archivos físicos asociados
      for (const r of rows) {
        try {
          for (const a of (r.archivos || [])) {
            const p = path.join(uploadsDir, a.filename)
            try { fs.unlinkSync(p) } catch {}
          }
        } catch {}
      }
      // Eliminar del arreglo
      let kept = 0
      for (let i = memFacturas.length - 1; i >= 0; i--) {
        if (ids.has(memFacturas[i].id)) memFacturas.splice(i, 1)
        else kept++
      }
      return res.json({ ok: true, deleted: rows.length })
    }

    // DB mode: construir condiciones como en el listado
    const conds = []
    const params = []
    if (cliente) { params.push(Number(cliente)); conds.push(`cliente = $${params.length}`) }
    if (fromDate) { params.push(fromDate); conds.push(`fecha >= $${params.length}`) }
    if (toDate) { params.push(toDate); conds.push(`fecha <= $${params.length}`) }
    if (fecha) { params.push(fecha); conds.push(`fecha = $${params.length}`) }
    if (guia) { params.push(guia); conds.push(`guia = $${params.length}`) }
    if (q) {
      params.push(`%${q}%`)
      conds.push(`(
        guia ILIKE $${params.length} OR
        conductor_xp ILIKE $${params.length} OR
        camion ILIKE $${params.length} OR
        local ILIKE $${params.length} OR
        carga ILIKE $${params.length} OR
        observaciones ILIKE $${params.length}
      )`)
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    // Obtener IDs a eliminar
    const { rows: idRows } = await query(`SELECT id FROM facturas ${where}`, params)
    const ids = idRows.map(r => r.id)
    if (!ids.length) return res.json({ ok: true, deleted: 0 })

    // Obtener archivos físicos para borrarlos del disco
    const { rows: fileRows } = await query('SELECT filename FROM factura_archivos WHERE factura_id = ANY($1::int[])', [ids])
    for (const row of fileRows) {
      const p = path.join(uploadsDir, row.filename)
      try { fs.unlinkSync(p) } catch {}
    }

    // Eliminar facturas (cascade: archivos + historial)
    await query('DELETE FROM facturas WHERE id = ANY($1::int[])', [ids])
    return res.json({ ok: true, deleted: ids.length })
  } catch (err) {
    console.error('POST /api/facturas/bulk-delete error:', err)
    res.status(400).json({ ok: false, message: err.message || 'Error al eliminar facturas' })
  }
})

// Descargar archivos subidos forzando descarga
app.get("/files/:filename", (req, res) => {
  const name = path.basename(req.params.filename || "")
  const filePath = path.join(uploadsDir, name)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, message: "Archivo no encontrado" })
  }
  return res.download(filePath, name)
})

// ===== Planificaciones: importar Excel -> JSON =====
app.post('/api/planificaciones/import', requireRoles(['admin','editor']), uploadExcel.single('file'), async (req, res) => {
  try {
    const filePath = req.file?.path
    if (!filePath) return res.status(400).json({ ok: false, message: 'Archivo requerido' })
    // Leer Excel preservando fechas como objetos y formatos de celda
    const wb = xlsx.readFile(filePath, { cellDates: true, cellNF: true, cellText: false })
    const sheetName = wb.SheetNames[0]
    const sheet = wb.Sheets[sheetName]
    // Convertir a JSON respetando formato de celda (raw:false usa la representación formateada)
    const rowsRaw = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false })

    // Normalizar fechas/horas que puedan venir como números seriales
    const DATE_KEYS = new Set(['fecha','fecha despacho','fecha de despacho','fecha_despacho'])
    const TIME_KEYS = new Set(['hora','hora despacho','hora de despacho','hora_despacho'])
    const pad2 = (n) => String(n).padStart(2, '0')
    const normalize = (k, v) => {
      if (typeof v !== 'number') return v
      const dc = xlsx.SSF.parse_date_code(v)
      if (!dc) return v
      const key = k.toLowerCase().trim()
      if (DATE_KEYS.has(key) && Number.isFinite(dc.y)) {
        return `${dc.y}-${pad2(dc.m)}-${pad2(dc.d)}`
      }
      if (TIME_KEYS.has(key)) {
        return `${pad2(dc.H)}:${pad2(dc.M)}`
      }
      return v
    }
    const rows = rowsRaw.map(r => {
      const o = { }
      for (const [k, v] of Object.entries(r)) o[k] = normalize(k, v)
      return o
    })
    // Limpieza del archivo físico (no necesitamos guardarlo)
    try { fs.unlinkSync(filePath) } catch {}
    return res.json({ ok: true, data: rows })
  } catch (e) {
    console.error('POST /api/planificaciones/import error:', e)
    return res.status(400).json({ ok: false, message: 'Error al procesar Excel' })
  }
})

// Guardar planificación (Excel + campos extra) en DB
app.post('/api/planificaciones', requireRoles(['admin','editor']), async (req, res) => {
  try {
    const rows = req.body?.rows
    const cliente = req.body?.cliente ? Number(req.body.cliente) : null
    const fecha = req.body?.fecha || null
    const descripcion = req.body?.descripcion || null
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ ok: false, message: 'rows requerido (array)' })
    const { rows: r } = await query('INSERT INTO planificaciones (cliente, fecha, descripcion, rows) VALUES ($1,$2,$3,$4::jsonb) RETURNING id, version, created_at, updated_at', [cliente, fecha, descripcion, JSON.stringify(rows)])
    return res.status(201).json({ ok: true, data: r[0] })
  } catch (e) {
    console.error('POST /api/planificaciones error:', e)
    return res.status(400).json({ ok: false, message: 'Error al guardar planificación' })
  }
})

// Listar planificaciones (filtros: cliente, fecha)
app.get('/api/planificaciones', requireAuth, async (req, res) => {
  try {
    if (SKIP_DB) return res.json({ ok: true, data: [] })
    const { cliente, fecha, limit = 50, offset = 0 } = req.query
    const conds = []
    const params = []
    if (cliente) { params.push(Number(cliente)); conds.push(`p.cliente = $${params.length}`) }
    if (fecha) { params.push(fecha); conds.push(`p.fecha = $${params.length}`) }
    params.push(Math.min(200, Number(limit)))
    params.push(Number(offset))
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const sql = `
      SELECT p.id, p.cliente, c.name AS cliente_name, p.fecha, p.descripcion, p.version, p.created_at, p.updated_at,
             COALESCE(jsonb_array_length(p.rows), 0) AS items
      FROM planificaciones p
      LEFT JOIN clients c ON c.id = p.cliente
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `
    const { rows } = await query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (e) {
    console.error('GET /api/planificaciones error:', e)
    res.status(500).json({ ok: false, message: 'Error al listar planificaciones' })
  }
})

// Obtener detalle (incluye filas JSON)
app.get('/api/planificaciones/:id', requireAuth, async (req, res) => {
  try {
    if (SKIP_DB) return res.status(404).json({ ok: false, message: 'No disponible en modo sin DB' })
    const id = Number(req.params.id)
    const { rows } = await query('SELECT id, cliente, fecha, descripcion, rows, version, created_at, updated_at FROM planificaciones WHERE id=$1', [id])
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Planificación no encontrada' })
    res.json({ ok: true, data: rows[0] })
  } catch (e) {
    console.error('GET /api/planificaciones/:id error:', e)
    res.status(500).json({ ok: false, message: 'Error al obtener planificación' })
  }
})

// Exportar CSV de una planificación (detalle de filas)
app.get('/api/planificaciones/:id/export', requireAuth, async (req, res) => {
  try {
    if (SKIP_DB) return res.status(404).json({ ok: false, message: 'No disponible en modo sin DB' })
    const id = Number(req.params.id)
    const { rows } = await query('SELECT rows FROM planificaciones WHERE id=$1', [id])
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Planificación no encontrada' })
    const data = rows[0].rows || []
    if (!Array.isArray(data) || data.length === 0) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="planificacion-${id}.csv"`)
      return res.send('\uFEFF')
    }
    // headers: unión de todas las claves
    const keys = Array.from(data.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s }, new Set()))
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s }
    const header = keys.join(',')
    const lines = data.map(r => keys.map(k => esc(r[k])).join(','))
    const csv = [header, ...lines].join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="planificacion-${id}.csv"`)
    return res.send('\uFEFF' + csv)
  } catch (e) {
    console.error('GET /api/planificaciones/:id/export error:', e)
    res.status(500).json({ ok: false, message: 'Error al exportar planificación' })
  }
})

// Actualizar planificación (filas y/o metadatos)
app.put('/api/planificaciones/:id', requireRoles(['admin','editor']), async (req, res) => {
  try {
    if (SKIP_DB) return res.status(404).json({ ok: false, message: 'No disponible en modo sin DB' })
    const id = Number(req.params.id)
    const { rows: prev } = await query('SELECT id, version FROM planificaciones WHERE id=$1', [id])
    if (!prev.length) return res.status(404).json({ ok: false, message: 'Planificación no encontrada' })
    const currentVersion = prev[0].version
    const sentVersion = req.body?.version != null ? Number(req.body.version) : null
    if (sentVersion == null) return res.status(400).json({ ok: false, message: 'version requerida' })
    if (sentVersion !== currentVersion) {
      return res.status(409).json({ ok: false, message: 'Conflicto de versión: la planificación fue actualizada por otro usuario', currentVersion })
    }

    const fields = []
    const params = []
    if (typeof req.body?.cliente !== 'undefined') { params.push(req.body.cliente == null ? null : Number(req.body.cliente)); fields.push(`cliente = $${params.length}`) }
    if (typeof req.body?.fecha !== 'undefined')   { params.push(req.body.fecha || null); fields.push(`fecha = $${params.length}`) }
    if (typeof req.body?.descripcion !== 'undefined') { params.push(req.body.descripcion || null); fields.push(`descripcion = $${params.length}`) }
    if (Array.isArray(req.body?.rows)) { params.push(JSON.stringify(req.body.rows)); fields.push(`rows = $${params.length}::jsonb`) }
    // Bump version y updated_at
    fields.push(`version = ${currentVersion + 1}`)
    fields.push(`updated_at = NOW()`)
    if (!fields.length) return res.status(400).json({ ok: false, message: 'Nada para actualizar' })
    params.push(id)
    const { rows } = await query(`UPDATE planificaciones SET ${fields.join(', ')} WHERE id=$${params.length} RETURNING id, cliente, fecha, descripcion, version, created_at, updated_at`, params)
    res.json({ ok: true, data: rows[0] })
  } catch (e) {
    console.error('PUT /api/planificaciones/:id error:', e)
    res.status(400).json({ ok: false, message: 'Error al actualizar planificación' })
  }
})

// Eliminar planificación
app.delete('/api/planificaciones/:id', requireRoles(['admin','editor']), async (req, res) => {
  try {
    if (SKIP_DB) return res.status(404).json({ ok: false, message: 'No disponible en modo sin DB' })
    const id = Number(req.params.id)
    const { rowCount } = await query('DELETE FROM planificaciones WHERE id=$1', [id])
    if (!rowCount) return res.status(404).json({ ok: false, message: 'Planificación no encontrada' })
    res.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/planificaciones/:id error:', e)
    res.status(400).json({ ok: false, message: 'Error al eliminar planificación' })
  }
})

// Servir archivo inline para previsualización (imagen/pdf)
app.get("/files/inline/:filename", (req, res) => {
  const name = path.basename(req.params.filename || "")
  const filePath = path.join(uploadsDir, name)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, message: "Archivo no encontrado" })
  }
  return res.sendFile(filePath)
})

// ===== Camiones =====
// Listar camiones con documentos
app.get('/api/camiones', requireAuth, async (req, res) => {
  try {
    if (SKIP_DB) {
      const rows = memCamiones.slice().sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
      return res.json({ ok: true, data: rows })
    }
    const { rows } = await query(`
      SELECT c.*,
        COALESCE(json_agg(json_build_object('filename', d.filename, 'mimetype', d.mimetype, 'size', d.size))
          FILTER (WHERE d.id IS NOT NULL), '[]') AS documentos
      FROM camiones c
      LEFT JOIN camion_documentos d ON d.camion_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `, [])
    return res.json({ ok: true, data: rows })
  } catch (e) {
    console.error('GET /api/camiones error:', e)
    res.status(500).json({ ok: false, message: 'Error al listar camiones' })
  }
})

// Crear camión con documentos
app.post('/api/camiones', requireRoles(['admin','editor']), upload.array('documentos', 5), async (req, res) => {
  try {
    const b = req.body || {}
    const patente = String(b.patente || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    const modelo = String(b.modelo || '').trim()
    const ano = b.ano ? Number(String(b.ano).replace(/\D/g,'')) : null
    const marca = String(b.marca || '').trim()
    const kilometraje = b.kilometraje != null ? Number(String(b.kilometraje).replace(/\D/g,'')) : null
    const fecha_entrada = b.fecha_entrada || b.fechaEntrada || null
    const fecha_salida = b.fecha_salida || b.fechaSalida || null

    // Validaciones
    if (!patente || patente.length !== 6) return res.status(400).json({ ok: false, message: 'Patente debe tener 6 caracteres' })
    if (modelo && /[^a-zA-ZÁÉÍÓÚÑáéíóúñ\s-]/.test(modelo)) return res.status(400).json({ ok: false, message: 'Modelo solo letras' })
    if (ano != null && (!/^[0-9]{1,4}$/.test(String(b.ano)))) return res.status(400).json({ ok: false, message: 'Año debe ser numérico (máx 4)' })
    if (marca && /[^a-zA-ZÁÉÍÓÚÑáéíóúñ\s-]/.test(marca)) return res.status(400).json({ ok: false, message: 'Marca solo letras' })
    if (kilometraje != null && !Number.isFinite(kilometraje)) return res.status(400).json({ ok: false, message: 'Kilometraje debe ser numérico' })
    if (!fecha_entrada) return res.status(400).json({ ok: false, message: 'Fecha de entrada requerida' })

    const files = req.files || []

    if (SKIP_DB) {
      const row = {
        id: memId++, patente, modelo: modelo || null, ano: ano || null, marca: marca || null,
        kilometraje: kilometraje || 0, fecha_entrada, fecha_salida: fecha_salida || null,
        documentos: files.map(f => ({ filename: f.filename, mimetype: f.mimetype, size: f.size })),
        created_at: new Date().toISOString(),
      }
      memCamiones.unshift(row)
      return res.status(201).json({ ok: true, data: row })
    }

    const { rows: inserted } = await query(
      'INSERT INTO camiones (patente, modelo, ano, marca, kilometraje, fecha_entrada, fecha_salida) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [patente, modelo || null, ano || null, marca || null, kilometraje || 0, fecha_entrada, fecha_salida || null]
    )
    const cam = inserted[0]
    if (files.length) {
      for (const f of files) {
        await query('INSERT INTO camion_documentos (camion_id, filename, mimetype, size) VALUES ($1,$2,$3,$4)', [cam.id, f.filename, f.mimetype, f.size])
      }
    }
    return res.status(201).json({ ok: true, data: cam })
  } catch (e) {
    console.error('POST /api/camiones error:', e)
    res.status(400).json({ ok: false, message: e.message || 'Error al crear camión' })
  }
})

// Actualizar datos de camión
app.put('/api/camiones/:id', requireRoles(['admin','editor']), async (req, res) => {
  const id = Number(req.params.id)
  try {
    const b = req.body || {}
    const fields = {}
    if (b.patente != null) {
      const p = String(b.patente).trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (p.length !== 6) return res.status(400).json({ ok: false, message: 'Patente debe tener 6 caracteres' })
      fields.patente = p
    }
    if (b.modelo != null) {
      const m = String(b.modelo).replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ\s-]/g,'')
      fields.modelo = m
    }
    if (b.ano != null) {
      const a = String(b.ano).replace(/\D/g,'').slice(0,4)
      if (a && !/^[0-9]{1,4}$/.test(a)) return res.status(400).json({ ok: false, message: 'Año inválido' })
      fields.ano = a ? Number(a) : null
    }
    if (b.marca != null) {
      const mk = String(b.marca).replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ\s-]/g,'').trim()
      fields.marca = mk
    }
    if (b.kilometraje != null) {
      const km = Number(String(b.kilometraje).replace(/\D/g,''))
      if (!Number.isFinite(km)) return res.status(400).json({ ok: false, message: 'Kilometraje inválido' })
      fields.kilometraje = km
    }
    if (b.fecha_entrada != null) fields.fecha_entrada = b.fecha_entrada
    if (b.fecha_salida != null) fields.fecha_salida = b.fecha_salida || null

    if (SKIP_DB) {
      const idx = memCamiones.findIndex(c => c.id === id)
      if (idx === -1) return res.status(404).json({ ok: false, message: 'Camión no encontrado' })
      memCamiones[idx] = { ...memCamiones[idx], ...fields }
      return res.json({ ok: true, data: memCamiones[idx] })
    }

    const sets = []
    const params = []
    for (const [k, v] of Object.entries(fields)) {
      params.push(v)
      sets.push(`${k} = $${params.length}`)
    }
    if (!sets.length) return res.status(400).json({ ok: false, message: 'Nada para actualizar' })
    params.push(id)
    const { rows } = await query(`UPDATE camiones SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`, params)
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Camión no encontrado' })
    return res.json({ ok: true, data: rows[0] })
  } catch (e) {
    console.error('PUT /api/camiones/:id error:', e)
    res.status(400).json({ ok: false, message: e.message || 'Error al actualizar camión' })
  }
})

// Eliminar camión (requiere motivo)
app.delete('/api/camiones/:id', requireRoles(['admin','editor']), async (req, res) => {
  const id = Number(req.params.id)
  try {
    const reason = (req.body && req.body.reason) ? String(req.body.reason).trim() : ''
    if (!reason) return res.status(400).json({ ok: false, message: 'Motivo de eliminación requerido' })

    if (SKIP_DB) {
      const idx = memCamiones.findIndex(c => c.id === id)
      if (idx === -1) return res.status(404).json({ ok: false, message: 'Camión no encontrado' })
      try {
        for (const d of (memCamiones[idx].documentos || [])) {
          const p = path.join(uploadsDir, d.filename)
          try { fs.unlinkSync(p) } catch {}
        }
      } catch {}
      memCamionBajas.unshift({ id: memId++, camion_id: id, reason, created_at: new Date().toISOString() })
      memCamiones.splice(idx, 1)
      return res.json({ ok: true })
    }

    const { rows: files } = await query('SELECT filename FROM camion_documentos WHERE camion_id=$1', [id])
    await query('INSERT INTO camion_bajas (camion_id, reason) VALUES ($1,$2)', [id, reason])
    const { rowCount } = await query('DELETE FROM camiones WHERE id=$1', [id])
    if (!rowCount) return res.status(404).json({ ok: false, message: 'Camión no encontrado' })
    for (const r of files) {
      const p = path.join(uploadsDir, r.filename)
      try { fs.unlinkSync(p) } catch {}
    }
    return res.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/camiones/:id error:', e)
    res.status(400).json({ ok: false, message: e.message || 'Error al eliminar camión' })
  }
})

// ===== Mantenciones =====
// Crear mantención
app.post('/api/mantenciones', requireRoles(['admin','editor']), async (req, res) => {
  try {
    const b = req.body || {}
    let camionId = b.camion_id ? Number(b.camion_id) : null
    const patente = String(b.patente || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')
    const tarea = String(b.tarea || '').trim()
    const tipo = String(b.tipo_control || b.tipo || '').toLowerCase()
    const fecha = b.fecha_control || b.fecha
    let km_antiguo = b.km_antiguo != null ? Number(b.km_antiguo) : null
    const km_nuevo = b.km_nuevo != null ? Number(b.km_nuevo) : null
    const intervalo_dias = b.intervalo_dias != null ? Number(b.intervalo_dias) : null

    if (!camionId && patente) {
      if (SKIP_DB) {
        const c = memCamiones.find(x => x.patente === patente)
        if (c) camionId = c.id
      } else {
        const { rows } = await query('SELECT id, kilometraje FROM camiones WHERE patente=$1', [patente])
        if (rows.length) {
          camionId = rows[0].id
          if (km_antiguo == null) km_antiguo = rows[0].kilometraje
        }
      }
    }

    if (!camionId) return res.status(400).json({ ok: false, message: 'camion_id o patente requeridos' })
    if (!tarea) return res.status(400).json({ ok: false, message: 'tarea requerida' })
    if (!['preventivo','urgente'].includes(tipo)) return res.status(400).json({ ok: false, message: 'tipo_control debe ser preventivo o urgente' })
    if (!fecha) return res.status(400).json({ ok: false, message: 'fecha_control requerida' })
    if (!intervalo_dias || !Number.isFinite(intervalo_dias) || intervalo_dias <= 0) return res.status(400).json({ ok: false, message: 'intervalo_dias requerido (>0)' })

    if (SKIP_DB) {
      if (km_antiguo == null) {
        const c = memCamiones.find(x => x.id === camionId)
        km_antiguo = c?.kilometraje ?? null
      }
      const row = { id: memId++, camion_id: camionId, tarea, tipo_control: tipo, fecha_control: fecha, km_antiguo, km_nuevo, intervalo_dias, created_at: new Date().toISOString() }
      memMantenciones.unshift(row)
      return res.status(201).json({ ok: true, data: row })
    }

    if (km_antiguo == null) {
      const { rows } = await query('SELECT kilometraje FROM camiones WHERE id=$1', [camionId])
      km_antiguo = rows.length ? rows[0].kilometraje : null
    }
    const { rows } = await query(
      'INSERT INTO mantenciones (camion_id, tarea, tipo_control, fecha_control, km_antiguo, km_nuevo, intervalo_dias) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [camionId, tarea, tipo, fecha, km_antiguo, km_nuevo, intervalo_dias]
    )
    return res.status(201).json({ ok: true, data: rows[0] })
  } catch (e) {
    console.error('POST /api/mantenciones error:', e)
    res.status(400).json({ ok: false, message: e.message || 'Error al crear mantención' })
  }
})

// Listar mantenciones (últimas)
app.get('/api/mantenciones', requireAuth, async (req, res) => {
  try {
    if (SKIP_DB) {
      const rows = memMantenciones.map(m => ({ ...m, patente: (memCamiones.find(c => c.id === m.camion_id)?.patente) || '' }))
      return res.json({ ok: true, data: rows })
    }
    const { rows } = await query(`
      SELECT m.*, c.patente FROM mantenciones m
      LEFT JOIN camiones c ON c.id = m.camion_id
      ORDER BY m.created_at DESC
      LIMIT 200
    `, [])
    return res.json({ ok: true, data: rows })
  } catch (e) {
    console.error('GET /api/mantenciones error:', e)
    res.status(500).json({ ok: false, message: 'Error al listar mantenciones' })
  }
})

// Camiones con mantención vencida (según última mantención + intervalo)
app.get('/api/mantenciones/due', requireAuth, async (_req, res) => {
  try {
    if (SKIP_DB) {
      // tomar última mantención por camión
      const last = new Map()
      for (const m of memMantenciones) {
        const prev = last.get(m.camion_id)
        if (!prev || new Date(m.fecha_control) > new Date(prev.fecha_control)) last.set(m.camion_id, m)
      }
      const today = new Date().toISOString().slice(0,10)
      const rows = []
      for (const [camion_id, m] of last.entries()) {
        const int = Number(m.intervalo_dias || 0)
        if (!int) continue
        const due = new Date(m.fecha_control)
        due.setDate(due.getDate() + int)
        const overdue = (new Date(today) - due) / (1000*60*60*24)
        if (overdue >= 0) {
          const c = memCamiones.find(x => x.id === camion_id)
          rows.push({ camion_id, patente: c?.patente || '', fecha_control: m.fecha_control, intervalo_dias: int, dias_vencidos: Math.floor(overdue) })
        }
      }
      return res.json({ ok: true, data: rows })
    }
    const { rows } = await query(`
      WITH last_m AS (
        SELECT DISTINCT ON (camion_id) camion_id, tarea, tipo_control, fecha_control, intervalo_dias
        FROM mantenciones
        ORDER BY camion_id, fecha_control DESC
      )
      SELECT c.id as camion_id, c.patente, l.fecha_control, l.intervalo_dias,
        GREATEST(0, (CURRENT_DATE - (l.fecha_control + (l.intervalo_dias || 0) * INTERVAL '1 day'))::int) AS dias_vencidos
      FROM camiones c
      JOIN last_m l ON l.camion_id = c.id
      WHERE l.intervalo_dias IS NOT NULL AND CURRENT_DATE >= (l.fecha_control + l.intervalo_dias * INTERVAL '1 day')
      ORDER BY dias_vencidos DESC, c.patente ASC
    `, [])
    return res.json({ ok: true, data: rows })
  } catch (e) {
    console.error('GET /api/mantenciones/due error:', e)
    res.status(500).json({ ok: false, message: 'Error al calcular vencidos' })
  }
})

// ===== Proveedores =====
app.get('/api/proveedores', requireAuth, async (_req, res) => {
  try {
    if (SKIP_DB) return res.json({ ok: true, data: memProveedores.slice().sort((a,b) => a.nombre.localeCompare(b.nombre)) })
    const { rows } = await query('SELECT * FROM proveedores WHERE active = TRUE ORDER BY nombre ASC', [])
    return res.json({ ok: true, data: rows })
  } catch (e) {
    console.error('GET /api/proveedores error:', e)
    res.status(500).json({ ok: false, message: 'Error al listar proveedores' })
  }
})

app.post('/api/proveedores', requireRoles(['admin','editor']), async (req, res) => {
  try {
    const b = req.body || {}
    const nombre = String(b.nombre || '').trim()
    if (!nombre) return res.status(400).json({ ok: false, message: 'nombre requerido' })
    const payload = {
      nombre,
      rut: b.rut || null,
      contacto: b.contacto || null,
      fono: b.fono || null,
      email: b.email || null,
      direccion: b.direccion || null,
      rubro: b.rubro || null,
    }
    if (SKIP_DB) {
      const row = { id: memId++, ...payload, active: true, created_at: new Date().toISOString() }
      memProveedores.push(row)
      return res.status(201).json({ ok: true, data: row })
    }
    const { rows } = await query('INSERT INTO proveedores (nombre, rut, contacto, fono, email, direccion, rubro) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [payload.nombre, payload.rut, payload.contacto, payload.fono, payload.email, payload.direccion, payload.rubro])
    return res.status(201).json({ ok: true, data: rows[0] })
  } catch (e) {
    console.error('POST /api/proveedores error:', e)
    res.status(400).json({ ok: false, message: e.message || 'Error al crear proveedor' })
  }
})

// ===== Órdenes =====
app.get('/api/ordenes', requireAuth, async (_req, res) => {
  try {
    if (SKIP_DB) {
      const rows = memOrdenes.map(o => ({ ...o, proveedor_nombre: memProveedores.find(p => p.id === o.proveedor_id)?.nombre || null, patente: o.patente || memCamiones.find(c => c.id === o.camion_id)?.patente || null }))
      return res.json({ ok: true, data: rows })
    }
    const { rows } = await query(`
      SELECT o.*, p.nombre AS proveedor_nombre, c.patente
      FROM ordenes o
      LEFT JOIN proveedores p ON p.id = o.proveedor_id
      LEFT JOIN camiones c ON c.id = o.camion_id
      ORDER BY o.created_at DESC
      LIMIT 200
    `, [])
    return res.json({ ok: true, data: rows })
  } catch (e) {
    console.error('GET /api/ordenes error:', e)
    res.status(500).json({ ok: false, message: 'Error al listar órdenes' })
  }
})

app.post('/api/ordenes', requireRoles(['admin','editor']), upload.array('adjuntos', 5), async (req, res) => {
  try {
    const b = req.body || {}
    let camionId = b.camion_id ? Number(b.camion_id) : null
    const patente = String(b.patente || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')
    const fecha = b.fecha
    const tipo = b.tipo || ''
    const prioridad = b.prioridad || ''
    const responsable = b.responsable || ''
    const descripcion = b.descripcion || ''
    const estado = b.estado || 'abierta'
    const proveedorId = b.proveedor_id ? Number(b.proveedor_id) : null
    const costo_estimado = b.costo_estimado != null ? Number(b.costo_estimado) : null
    const costo_real = b.costo_real != null ? Number(b.costo_real) : null
    const files = req.files || []

    if (!camionId && patente) {
      if (SKIP_DB) {
        const c = memCamiones.find(x => x.patente === patente)
        camionId = c?.id || null
      } else {
        const { rows } = await query('SELECT id FROM camiones WHERE patente=$1', [patente])
        camionId = rows[0]?.id || null
      }
    }

    if (!fecha) return res.status(400).json({ ok: false, message: 'fecha requerida' })

    if (SKIP_DB) {
      const row = { id: memId++, camion_id: camionId, proveedor_id: proveedorId || null, patente: patente || null, fecha, tipo, prioridad, responsable, descripcion, estado, costo_estimado, costo_real, adjuntos: files.map(f => ({ filename: f.filename, mimetype: f.mimetype, size: f.size })), created_at: new Date().toISOString() }
      memOrdenes.unshift(row)
      return res.status(201).json({ ok: true, data: row })
    }
    const { rows } = await query('INSERT INTO ordenes (camion_id, proveedor_id, patente, fecha, tipo, prioridad, responsable, descripcion, estado, costo_estimado, costo_real) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *', [camionId, proveedorId || null, patente || null, fecha, tipo, prioridad, responsable, descripcion, estado, costo_estimado, costo_real])
    const ord = rows[0]
    if (files.length) {
      for (const f of files) {
        await query('INSERT INTO orden_documentos (orden_id, filename, mimetype, size) VALUES ($1,$2,$3,$4)', [ord.id, f.filename, f.mimetype, f.size])
      }
    }
    return res.status(201).json({ ok: true, data: ord })
  } catch (e) {
    console.error('POST /api/ordenes error:', e)
    res.status(400).json({ ok: false, message: e.message || 'Error al crear orden' })
  }
})
// Editar factura y registrar historial
app.put("/api/facturas/:id", requireRoles(['admin','editor']), async (req, res) => {
  const id = Number(req.params.id)
  try {
    const b = req.body || {}

    if (SKIP_DB) {
      const idx = memFacturas.findIndex((f) => f.id === id)
      if (idx === -1) return res.status(404).json({ ok: false, message: 'Factura no encontrada' })
      const prev = memFacturas[idx]
      const next = {
        ...prev,
        cliente: b.cliente ? Number(b.cliente) : prev.cliente,
        dia: b.dia ?? prev.dia,
        fecha: b.fecha ?? prev.fecha,
        conductor_xp: b.conductorXp ?? prev.conductor_xp,
        camion: b.camion ?? prev.camion,
        vueltas: b.vueltas != null ? Number(b.vueltas) : prev.vueltas,
        guia: b.guia ?? prev.guia,
        local: b.local ?? prev.local,
        kg: b.kg != null ? Number(b.kg) : prev.kg,
        carga: b.carga ?? prev.carga,
        observaciones: b.observaciones ?? prev.observaciones,
        estado: b.estado ?? prev.estado,
      }
      // compute changes
      const diff = {}
      for (const k of Object.keys(next)) {
        if (['archivos','id','created_at'].includes(k)) continue
        if (prev[k] !== next[k]) diff[k] = { from: prev[k] ?? null, to: next[k] ?? null }
      }
      memFacturas[idx] = next
      memHistorial.push({ factura_id: id, changes: diff, changed_at: new Date().toISOString() })
      return res.json({ ok: true, message: 'Factura actualizada', data: next })
    }

    // DB mode
    const { rows: prevRows } = await query('SELECT * FROM facturas WHERE id = $1', [id])
    if (!prevRows.length) return res.status(404).json({ ok: false, message: 'Factura no encontrada' })
    const prev = prevRows[0]

    const values = {
      cliente: b.cliente != null ? Number(b.cliente) : prev.cliente,
      dia: b.dia ?? prev.dia,
      fecha: b.fecha ?? prev.fecha,
      conductor_xp: b.conductorXp ?? prev.conductor_xp,
      camion: b.camion ?? prev.camion,
      vueltas: b.vueltas != null ? Number(b.vueltas) : prev.vueltas,
      guia: b.guia ?? prev.guia,
      local: b.local ?? prev.local,
      kg: b.kg != null ? Number(b.kg) : prev.kg,
      carga: b.carga ?? prev.carga,
      observaciones: b.observaciones ?? prev.observaciones,
      estado: b.estado ?? prev.estado,
    }
    const sql = `
      UPDATE facturas
      SET cliente=$1, dia=$2, fecha=$3, conductor_xp=$4, camion=$5, vueltas=$6, guia=$7, local=$8, kg=$9, carga=$10, observaciones=$11, estado=$12
      WHERE id=$13
      RETURNING *
    `
    const { rows } = await query(sql, [
      values.cliente,
      values.dia,
      values.fecha,
      values.conductor_xp,
      values.camion,
      values.vueltas,
      values.guia,
      values.local,
      values.kg,
      values.carga,
      values.observaciones,
      values.estado,
      id,
    ])
    const next = rows[0]

    const diff = {}
    for (const k of Object.keys(values)) {
      if (prev[k] !== next[k]) diff[k] = { from: prev[k] ?? null, to: next[k] ?? null }
    }
    if (Object.keys(diff).length) {
      await query('INSERT INTO factura_historial (factura_id, changes) VALUES ($1, $2::jsonb)', [id, JSON.stringify(diff)])
    }
    return res.json({ ok: true, message: 'Factura actualizada', data: next })
  } catch (err) {
    console.error('PUT /api/facturas/:id error:', err)
    res.status(400).json({ ok: false, message: err.message || 'Error al actualizar factura' })
  }
})

// Obtener historial de cambios de una factura
app.get('/api/facturas/:id/historial', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  try {
    if (SKIP_DB) {
      const items = memHistorial.filter((h) => h.factura_id === id)
      return res.json({ ok: true, data: items })
    }
    const { rows } = await query('SELECT id, factura_id, changes, changed_at FROM factura_historial WHERE factura_id=$1 ORDER BY changed_at DESC', [id])
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error('GET /api/facturas/:id/historial error:', err)
    res.status(400).json({ ok: false, message: 'Error al obtener historial' })
  }
})

// Eliminar una factura por ID (y sus archivos asociados)
app.delete('/api/facturas/:id', requireRoles(['admin','editor']), async (req, res) => {
  const id = Number(req.params.id)
  try {
    if (SKIP_DB) {
      const idx = memFacturas.findIndex(f => f.id === id)
      if (idx === -1) return res.status(404).json({ ok: false, message: 'Factura no encontrada' })
      // Borrar archivos físicos asociados
      try {
        const files = memFacturas[idx].archivos || []
        for (const a of files) {
          const p = path.join(uploadsDir, a.filename)
          try { fs.unlinkSync(p) } catch {}
        }
      } catch {}
      memFacturas.splice(idx, 1)
      // Limpiar historial en memoria
      for (let i = memHistorial.length - 1; i >= 0; i--) {
        if (memHistorial[i].factura_id === id) memHistorial.splice(i, 1)
      }
      return res.json({ ok: true })
    }

    // Obtener archivos para borrarlos del disco
    const { rows: files } = await query('SELECT filename FROM factura_archivos WHERE factura_id=$1', [id])
    // Eliminar factura (cascade borra archivos e historial)
    const { rowCount } = await query('DELETE FROM facturas WHERE id=$1', [id])
    if (!rowCount) return res.status(404).json({ ok: false, message: 'Factura no encontrada' })
    // Borrar archivos físicos
    for (const row of files) {
      const p = path.join(uploadsDir, row.filename)
      try { fs.unlinkSync(p) } catch {}
    }
    return res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/facturas/:id error:', err)
    res.status(400).json({ ok: false, message: err.message || 'Error al eliminar factura' })
  }
})

// Solo en modo sin DB: reset de datos y limpieza de archivos subidos (para desarrollo)
app.delete('/api/__dev/reset', async (req, res) => {
  if (!SKIP_DB) return res.status(400).json({ ok: false, message: 'Disponible solo en modo sin DB (SKIP_DB_INIT=1)' })
  try {
    // Vaciar memoria
    memFacturas.length = 0
    memHistorial.length = 0
    // Borrar archivos en uploads
    try {
      const files = fs.readdirSync(uploadsDir)
      for (const f of files) {
        const p = path.join(uploadsDir, f)
        try { fs.unlinkSync(p) } catch {}
      }
    } catch {}
    res.json({ ok: true, message: 'Datos de memoria y archivos limpiados' })
  } catch (err) {
    console.error('DELETE /api/__dev/reset error:', err)
    res.status(500).json({ ok: false, message: 'Error al limpiar' })
  }
})

// Arrancar servidor después de init DB (o en modo sin DB)
const PORT = Number(process.env.PORT) || 4000;
;(async () => {
  try {
    if (!SKIP_DB) {
      await initDb()
      await ensureSeed()
      console.log("Base de datos conectada e inicializada correctamente")
    } else {
      console.log("SKIP_DB_INIT activo: corriendo en modo sin base de datos")
    }
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error("Error inicializando DB:", err)
    process.exit(1)
  }
})()
