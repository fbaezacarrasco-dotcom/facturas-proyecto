import { useEffect, useMemo, useState } from 'react'

function PlanificacionCrear({ onClose, getAuthHeaders }) {
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0,10),
    descripcion: '',
  })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [clients, setClients] = useState([])

  const onChange = (e) => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  const importExcel = async () => {
    if (!file) { alert('Selecciona un archivo Excel'); return }
    try {
      setSaving(true); setResult(null)
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/planificaciones/import', { method: 'POST', headers: { ...(getAuthHeaders?.() || {}) }, body: fd })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json?.message || 'Error al procesar Excel')
      const imported = Array.isArray(json.data) ? json.data : []

      // 1) Normalización de encabezados a un conjunto canónico
      const canonical = [
        'conductor_xp','ruta','camion','factura','guia','cliente','direccion','comuna','hora','codigo','punto','observaciones','kg','carga',
        // Extras que queremos siempre
        'horario_entrega','forma_pago','monto','estado_entrega','observacion'
      ]
      const display = {
        conductor_xp: 'Conductor‑XP', ruta: 'Ruta', camion: 'Camión', factura: 'N° factura', guia: 'N° guía', cliente: 'Cliente',
        direccion: 'Dirección', comuna: 'Comuna', hora: 'Hora', codigo: 'Cod', punto: 'Pto', observaciones: 'Observaciones', kg: 'KG', carga: 'Carga',
        horario_entrega: 'Horario de entrega', forma_pago: 'Forma de pago', monto: 'Monto', estado_entrega: 'Entregado/Rechazado', observacion: 'Observación'
      }
      const normalize = (s) => String(s || '').toLowerCase().trim()
        .replaceAll('\n',' ').replaceAll('\t',' ').replaceAll('  ',' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const synonyms = new Map([
        // Excel posibles
        ['conductor - xp','conductor_xp'], ['conductor-xp','conductor_xp'], ['conductor xp','conductor_xp'],
        ['factura','factura'], ['n° factura','factura'], ['n factura','factura'], ['nfactura','factura'],
        ['guia','guia'], ['n° guia','guia'], ['n guia','guia'], ['nguia','guia'],
        ['cliente','cliente'], ['direccion','direccion'], ['comuna','comuna'], ['hora','hora'],
        ['cod','codigo'], ['codigo','codigo'], ['pto','punto'], ['punto','punto'],
        ['camion','camion'], ['patente','camion'], ['ruta','ruta'],
        ['observaciones','observaciones'], ['obs','observaciones'],
        ['peso','kg'], ['kg','kg'], ['carga','carga']
      ])

      const importedHeaders = new Set()
      const canonRows = imported.map(row => {
        const out = {}
        for (const [k, v] of Object.entries(row)) {
          const nk0 = normalize(k)
          const nk = synonyms.get(nk0) || nk0.replaceAll(' ', '_')
          out[nk] = v
          importedHeaders.add(nk)
        }
        return out
      })

      // 2) Asegurar columnas canónicas + extras (si no venían en Excel) y marcarlas editables
      const ensure = [...canonical]
      // Agrega también cualquier otra columna desconocida del Excel para no perderla
      for (const k of importedHeaders) if (!ensure.includes(k)) ensure.push(k)

      const enriched = canonRows.map(r => {
        const o = { ...r }
        for (const key of ensure) if (typeof o[key] === 'undefined') o[key] = ''
        return o
      })

      // Guardar
      setRows(enriched)
      setHeadersOverride({ order: ensure, display })
    } catch (e) { setResult({ ok: false, message: e.message }) }
    finally { setSaving(false) }
  }

  const savePlan = async () => {
    if (!rows.length) { alert('No hay datos para guardar'); return }
    if (!form.cliente) { setResult({ ok: false, message: 'Selecciona un cliente' }); return }
    if (!form.fecha) { setResult({ ok: false, message: 'Selecciona una fecha' }); return }
    try {
      setSaving(true); setResult(null)
      const res = await fetch('/api/planificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) },
        body: JSON.stringify({ rows, cliente: form.cliente || null, fecha: form.fecha || null, descripcion: form.descripcion || '' })
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json?.message || 'Error al guardar')
      setResult({ ok: true, message: `Planificación guardada (id=${json.data.id})` })
    } catch (e) { setResult({ ok: false, message: e.message }) }
    finally { setSaving(false) }
  }

  const [headersOverride, setHeadersOverride] = useState(null)
  const headers = useMemo(() => {
    if (headersOverride?.order?.length) return headersOverride.order
    const base = new Set()
    rows.forEach(r => Object.keys(r).forEach(k => base.add(k)))
    const extra = ['horario_entrega','forma_pago','monto','estado_entrega','observacion']
    const arr = Array.from(base)
    extra.forEach(e => { if (!arr.includes(e)) arr.push(e) })
    return arr
  }, [rows, headersOverride])

  // Cargar clientes activos para selector
  useEffect(() => {
    const loadClients = async () => {
      try {
        const res = await fetch('/api/clients', { headers: { ...(getAuthHeaders?.() || {}) } })
        const json = await res.json()
        if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error clientes')
        setClients(json.data || [])
        if (!form.cliente && (json.data || []).length) setForm(f => ({ ...f, cliente: String(json.data[0].id) }))
      } catch {}
    }
    loadClients()
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Crear planificación</h2>
        <button className="menu-button" style={{ width: 'auto' }} onClick={onClose}>Volver</button>
      </div>
      {result && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: result.ok ? '#e8f7ec' : '#fdeaea', color: result.ok ? '#1e6f3d' : '#9b1c1c', border: `1px solid ${result.ok ? '#bfe5c9' : '#f4c7c7'}` }}>
          {result.message}
        </div>
      )}
      <div className="factura-form">
        <div className="grid-2">
          <label>
            <span>Fecha</span>
            <input type="date" name="fecha" value={form.fecha} onChange={onChange} />
          </label>
          <label>
            <span>Cliente</span>
            <select name="cliente" value={form.cliente || ''} onChange={onChange}>
              {(clients || []).map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </label>
          <label className="full">
            <span>Descripción</span>
            <textarea name="descripcion" rows={3} value={form.descripcion} onChange={onChange} placeholder="Notas de planificación" />
          </label>
          <label className="full">
            <span>Archivo Excel (.xlsx/.xls/.csv)</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="menu-button" style={{ width: 'auto' }} onClick={importExcel} disabled={saving}>Procesar Excel</button>
          <button className="menu-button" style={{ width: 'auto' }} onClick={savePlan} disabled={saving || rows.length === 0}>Guardar planificación</button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                {headers.map(h => (<th key={h}>{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {headers.map(h => (
                    <td key={h}>
                      <input
                        value={row[h] ?? ''}
                        onChange={e => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [h]: e.target.value } : r))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PlanificacionCrear
