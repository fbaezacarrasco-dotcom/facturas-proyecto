import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { initDb, query } from "./db.js";
const SKIP_DB = String(process.env.SKIP_DB_INIT || "0").toLowerCase() === "1" || String(process.env.SKIP_DB_INIT || "").toLowerCase() === "true";

const app = express();

// Middlewares básicos
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de prueba
app.get("/", (req, res) => {
  res.send("🚀 Servidor funcionando!");
});

// Healthcheck para frontend y monitoreo
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "API OK", timestamp: new Date().toISOString() });
});

// Configuración de subida de archivos para facturas
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

// Almacenamiento en memoria si SKIP_DB está activo
const memFacturas = [];
const memHistorial = [];
let memId = 1;

// Endpoint para crear factura (DB o memoria)
app.post("/api/facturas", upload.array("archivos", 5), async (req, res) => {
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

// Listado de facturas con filtros básicos
app.get("/api/facturas", async (req, res) => {
  try {
    const {
      cliente,
      from: fromDate,
      to: toDate,
      fecha,
      guia,
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
    const sql = `
      SELECT f.*,
        COALESCE(json_agg(json_build_object('filename', fa.filename, 'mimetype', fa.mimetype, 'size', fa.size))
          FILTER (WHERE fa.id IS NOT NULL), '[]') AS archivos
      FROM facturas f
      LEFT JOIN factura_archivos fa ON fa.factura_id = f.id
      ${where}
      GROUP BY f.id
      ORDER BY f.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `
    const { rows } = await query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error("GET /api/facturas error:", err)
    res.status(500).json({ ok: false, message: "Error al listar facturas" })
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

// Servir archivo inline para previsualización (imagen/pdf)
app.get("/files/inline/:filename", (req, res) => {
  const name = path.basename(req.params.filename || "")
  const filePath = path.join(uploadsDir, name)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, message: "Archivo no encontrado" })
  }
  return res.sendFile(filePath)
})

// Editar factura y registrar historial
app.put("/api/facturas/:id", async (req, res) => {
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
app.get('/api/facturas/:id/historial', async (req, res) => {
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
