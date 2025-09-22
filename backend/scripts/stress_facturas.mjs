// Simple stress tool: logs in and creates N facturas (no files)
// Usage:
//   node scripts/stress_facturas.mjs [count]
// Environment:
//   BASE_URL=http://localhost:4000 (default)
//   ADMIN_EMAIL/ADMIN_PASSWORD (reads from backend/.env via dotenv)
//   STRESS_CONCURRENCY=10 (default)
// Notes:
// - Requires backend running and an admin/editor user.
// - Sends multipart/form-data without files (multer parses fields).

import 'dotenv/config'

const BASE = process.env.BASE_URL || 'http://localhost:4000'
const EMAIL = process.env.ADMIN_EMAIL
const PASSWORD = process.env.ADMIN_PASSWORD
const COUNT = Number(process.argv[2] || process.env.STRESS_COUNT || 1000)
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY || 10)

if (!EMAIL || !PASSWORD) {
  console.error('Missing ADMIN_EMAIL / ADMIN_PASSWORD in backend/.env')
  process.exit(1)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Login failed')
  return json.token
}

async function createFactura(i, token) {
  const fd = new FormData()
  const today = new Date().toISOString().slice(0, 10)
  // Required
  fd.set('cliente', String((i % 4) + 1))
  fd.set('fecha', today)
  // Optional sample fields
  fd.set('dia', ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date().getDay()])
  fd.set('guia', `ST-${today.replaceAll('-', '')}-${i}`)
  fd.set('conductorXp', `Chofer ${i % 30}`)
  fd.set('local', `Ruta ${i % 50}`)
  fd.set('camion', `Cam ${i % 20}`)
  fd.set('vueltas', String(i % 5))
  fd.set('kg', String((i % 200) * 10))
  fd.set('carga', ['seco','refrigerado','congelado','no aplica'][i % 4])
  fd.set('estado', ['entregado sin novedad','entregado con detalle','rechazado','reprogramado'][i % 4])
  fd.set('observaciones', `Carga sintética ${i}`)

  const res = await fetch(`${BASE}/api/facturas`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${txt}`)
  }
}

async function run() {
  console.log(`[stress] Base: ${BASE} | Count: ${COUNT} | Concurrency: ${CONCURRENCY}`)
  const token = await login()
  console.log('[stress] Logged in OK')

  let inFlight = 0
  let next = 0
  let ok = 0
  let fail = 0
  const started = Date.now()

  return await new Promise((resolve) => {
    const launch = async () => {
      while (inFlight < CONCURRENCY && next < COUNT) {
        const i = next++
        inFlight++
        createFactura(i + 1, token)
          .then(() => { ok++ })
          .catch((e) => { fail++; if (fail < 5) console.warn('[stress] error', e.message) })
          .finally(() => {
            inFlight--
            if ((ok + fail) % 100 === 0) {
              const dt = ((Date.now() - started) / 1000).toFixed(1)
              console.log(`[stress] Progress: ${ok+fail}/${COUNT} | ok=${ok} fail=${fail} | ${dt}s`)
            }
            if (ok + fail >= COUNT && inFlight === 0) {
              const total = ((Date.now() - started) / 1000).toFixed(2)
              console.log(`[stress] Done. ok=${ok}, fail=${fail}, time=${total}s, rps=${(COUNT/total).toFixed(1)}`)
              resolve()
            } else {
              // keep pumping
              launch()
            }
          })
      }
    }
    launch()
  })
}

run().catch(async (e) => {
  console.error('[stress] Fatal:', e)
  // brief delay to flush logs
  await sleep(50)
  process.exit(1)
})

