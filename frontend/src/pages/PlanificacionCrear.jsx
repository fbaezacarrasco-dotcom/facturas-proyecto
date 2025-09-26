// Pantalla para crear una planificación a partir de un Excel/CSV.
// Permite:
// - Importar una planilla y transformarla en filas/columnas editables
// - Reordenar y eliminar columnas
// - Elegir una columna para asignación de personal (conductores/peonetas)
// - Buscar texto en cualquier columna
// - Ver resúmenes (mini-dashboard) por distintos criterios
// - Guardar la planificación en el backend
import { useEffect, useMemo, useRef, useState } from 'react'

// Helpers: clientes y drivers
const useClientes = (getAuthHeaders) => {
  // Obtiene lista de clientes activos desde el backend y la normaliza para <select>
  const [list, setList] = useState([])
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/clients', { headers: { ...(getAuthHeaders?.() || {}) } })
        const j = await r.json()
        if (r.ok && j?.ok) setList((j.data || []).map(c => ({ value: String(c.id), label: c.name })))
      } catch {}
    }
    load()
  }, [])
  return list
}

const useDrivers = (getAuthHeaders) => {
  // Obtiene lista de conductores/peonetas para asignación de personal en una columna
  const [list, setList] = useState([])
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/drivers', { headers: { ...(getAuthHeaders?.() || {}) } })
        const j = await r.json()
        if (r.ok && j?.ok) setList((j.data || []).map(d => ({ value: String(d.id), label: `${d.nombre} ${d.apellido}`, rol: d.rol })))
      } catch {}
    }
    load()
  }, [])
  return list
}

function PlanificacionCrear({ getAuthHeaders, onClose }) {

  const [showInfo, setShowInfo] = useState(false)

  const limpiarTodo = () => {
    if (!window.confirm('¿Seguro que deseas limpiar toda la información?')) return
    setMeta({ cliente: '', fecha: '', descripcion: '' })
    setRows([])
    setColumns([])
    setPersonalCol('')
    setMsg('')
    setStats({ total: 0, by_estado: {}, by_conductor: {} })
    setShowGraphs({ estado: true, pago: false, carga: false, ambiente: false, conductor: false })
    setWidths({})
    setQuery('')
    setShowFull(false)
    setNewCol('')
    try { localStorage.removeItem('draft_plan') } catch {}
  }

  // Hooks de datos para selects
  const clientes = useClientes(getAuthHeaders)
  const drivers = useDrivers(getAuthHeaders)
  // Metadatos de la planificación (cabecera)
  const [meta, setMeta] = useState({ cliente: '', fecha: '', descripcion: '' })
  // Filas y columnas de la planilla importada/creada
  const [rows, setRows] = useState([])
  const [columns, setColumns] = useState([]) // array de nombres de columnas en orden
  const [personalCol, setPersonalCol] = useState('') // nombre de columna con dropdown (conductores/peonetas)
  // Referencia al input file para disparar el diálogo de archivos
  const inputRef = useRef(null)
  // Estado de carga y mensajes de feedback
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  // Estadísticas calculadas por el backend para mini-dashboard
  const [stats, setStats] = useState({ total: 0, by_estado: {}, by_conductor: {} })
  // Alternar la visualización de resúmenes
  const [showGraphs, setShowGraphs] = useState({ estado: true, pago: false, carga: false, ambiente: false, conductor: false })
  // Anchos personalizados por columna (opcional)
  const [widths, setWidths] = useState({}) // anchos por columna
  // Búsqueda de texto libre
  const [query, setQuery] = useState('') // búsqueda rápida
  // Modal con la planilla completa (sin recortar)
  const [showFull, setShowFull] = useState(false) // modal de planilla completa
  // Slide bar / desplazamiento horizontal
  const wrapRef = useRef(null)
  const [scrollX, setScrollX] = useState(0)
  const [maxScrollX, setMaxScrollX] = useState(0)

  const unionColumns = (data) => {
    // Une todas las llaves presentes en las filas para generar el set de columnas
    const set = new Set()
    data.forEach((r) => Object.keys(r).forEach(k => { if (!set.has(k)) set.add(k) }))
    return Array.from(set)
  }

  const onImport = async (file) => {
    // Importa un archivo .xlsx/.xls/.csv y pide al backend que lo convierta en JSON
    // Luego solicita un análisis inicial para alimentar el mini-dashboard
    if (!file) return
    try {
      setLoading(true); setMsg('')
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/planificaciones/import', { method: 'POST', headers: { ...(getAuthHeaders?.() || {}) }, body: fd })
      const j = await r.json()
      if (!r.ok || !j?.ok) throw new Error(j?.message || 'Error al procesar Excel')
      const data = j.data || []
      setRows(data)
      setColumns(unionColumns(data))
      // solicitar análisis inicial
      try {
        const ar = await fetch('/api/planificaciones/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) }, body: JSON.stringify({ rows: data }) })
        const aj = await ar.json(); if (ar.ok && aj?.ok) setStats(aj.data)
      } catch {}
    } catch (e) { setMsg(e.message) } finally { setLoading(false) }
  }

  const addColumn = (name) => {
    // Agrega una nueva columna vacía a la planilla
    const n = name.trim()
    if (!n) return
    if (columns.includes(n)) return alert('La columna ya existe')
    setColumns(cols => [...cols, n])
    setRows(rs => rs.map(r => ({ ...r, [n]: '' })))
  }

  const removeColumn = (name) => {
    // Elimina una columna y sus valores de todas las filas
    if (!confirm(`¿Eliminar columna "${name}"?`)) return
    setColumns(cols => cols.filter(c => c !== name))
    setRows(rs => rs.map(({ [name]: _omit, ...rest }) => rest))
    if (personalCol === name) setPersonalCol('')
  }

  const moveColumn = (name, dir) => {
    // Mueve una columna a la izquierda/derecha dentro del arreglo de columnas
    setColumns(cols => {
      const i = cols.indexOf(name)
      if (i === -1) return cols
      const j = i + (dir === 'left' ? -1 : 1)
      if (j < 0 || j >= cols.length) return cols
      const copy = cols.slice()
      const [sp] = copy.splice(i, 1)
      copy.splice(j, 0, sp)
      return copy
    })
  }

  const setCell = (rIdx, col, value) => {
    // Actualiza el valor de una celda específica (fila rIdx, columna col)
    setRows(rs => rs.map((r, i) => i === rIdx ? { ...r, [col]: value } : r))
  }

  // Medir scroll horizontal máximo y sincronizar slider
  const measureScroll = () => {
    // Calcula el máximo desplazamiento horizontal disponible
    const el = wrapRef.current
    if (!el) return
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    setMaxScrollX(max)
    setScrollX(el.scrollLeft)
  }
  useEffect(() => {
    // Inicializa y escucha cambios de tamaño de la ventana para recalcular el scroll
    measureScroll()
    const onResize = () => measureScroll()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => { measureScroll() }, [columns, rows, personalCol, widths])
  const onScrollWrap = () => { const el = wrapRef.current; if (el) setScrollX(el.scrollLeft) }
  const onSlide = (v) => { const el = wrapRef.current; if (el) { el.scrollLeft = Number(v); setScrollX(Number(v)) } }

  // Drag to pan
  useEffect(() => {
    // Permite desplazar la tabla arrastrando con el mouse (UX tipo "hand scroll")
    const el = wrapRef.current
    if (!el) return
    let isDown = false; let startX = 0; let startLeft = 0
    const down = (e) => { isDown = true; startX = e.pageX; startLeft = el.scrollLeft; el.style.cursor = 'grabbing' }
    const move = (e) => { if (!isDown) return; el.scrollLeft = startLeft - (e.pageX - startX) }
    const up = () => { isDown = false; el.style.cursor = 'auto' }
    el.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { el.removeEventListener('mousedown', down); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [])

  // Re-analizar cuando cambien filas (debounce simple)
  useEffect(() => {
    // Envía las filas al backend para recalcular estadísticas cada 300ms de inactividad
    const t = setTimeout(async () => {
      try {
        if (!rows.length) { setStats({ total: 0, by_estado: {}, by_conductor: {} }); return }
        const r = await fetch('/api/planificaciones/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) }, body: JSON.stringify({ rows }) })
        const j = await r.json(); if (r.ok && j?.ok) setStats(j.data)
      } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [rows])

  const onSave = async () => {
    // Guarda la planificación: meta (cliente/fecha/descripcion) + filas
    try {
      if (!rows.length) return alert('Importa una planilla primero')
      setLoading(true); setMsg('')
      const payload = { cliente: meta.cliente ? Number(meta.cliente) : null, fecha: meta.fecha || null, descripcion: meta.descripcion || null, rows }
      const r = await fetch('/api/planificaciones', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) }, body: JSON.stringify(payload) })
      const j = await r.json()
      if (!r.ok || !j?.ok) throw new Error(j?.message || 'Error al guardar')
      setMsg(`Guardado OK (id=${j.data.id})`)
      try { localStorage.removeItem('draft_plan') } catch {}
    } catch (e) { setMsg(e.message) } finally { setLoading(false) }
  }

  const [newCol, setNewCol] = useState('')

  // Borrador: cargar y guardar automáticamente
  useEffect(() => {
    // Al montar, intenta restaurar un borrador guardado en localStorage
    try {
      const raw = localStorage.getItem('draft_plan')
      if (raw) {
        const d = JSON.parse(raw)
        if (d) {
          if (d.meta) setMeta(d.meta)
          if (Array.isArray(d.rows)) setRows(d.rows)
          if (Array.isArray(d.columns)) setColumns(d.columns)
          if (d.personalCol) setPersonalCol(d.personalCol)
          if (d.widths) setWidths(d.widths)
        }
      }
    } catch {}
  }, [])
  useEffect(() => {
    // Cada cambio guarda un borrador en localStorage (con debounce de 400ms)
    const t = setTimeout(() => {
      try { localStorage.setItem('draft_plan', JSON.stringify({ meta, rows, columns, personalCol, widths })) } catch {}
    }, 400)
    return () => clearTimeout(t)
  }, [meta, rows, columns, personalCol, widths])
  
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Crear planificación</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="menu-button" style={{ width: 'auto' }} onClick={() => inputRef.current?.click()} disabled={loading}>📄 Importar Excel</button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => onImport(e.target.files?.[0])} />
          <button className="menu-button" style={{ width: 'auto' }} onClick={onSave} disabled={loading || !rows.length}>{loading ? 'Guardando…' : '💾 Guardar'}</button>
          <button className="menu-button" style={{ width: 'auto' }} onClick={limpiarTodo} disabled={loading}>🧹 Limpiar todo</button>
          <button className="menu-button" style={{ width: 'auto' }} onClick={() => setShowInfo(true)}>ℹ️</button>
          <button className="menu-button" style={{ width: 'auto' }} onClick={onClose}>Volver</button>
        </div>
      </div>

      {msg && <div style={{ marginBottom: 8, color: msg.includes('OK') ? '#166534' : '#9b1c1c' }}>{msg}</div>}

      {/* Controles de visualización de gráficos */}
      <div className="factura-form" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#0c0b0bff' }}>Mostrar:</div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showGraphs.estado} onChange={e => setShowGraphs(s => ({ ...s, estado: e.target.checked }))} />
            <span>Estado</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showGraphs.pago} onChange={e => setShowGraphs(s => ({ ...s, pago: e.target.checked }))} />
            <span>Pago</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showGraphs.carga} onChange={e => setShowGraphs(s => ({ ...s, carga: e.target.checked }))} />
            <span>Carga</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showGraphs.ambiente} onChange={e => setShowGraphs(s => ({ ...s, ambiente: e.target.checked }))} />
            <span>Ambiente</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showGraphs.conductor} onChange={e => setShowGraphs(s => ({ ...s, conductor: e.target.checked }))} />
            <span>Conductor</span>
          </label>
        </div>
      </div>

      {/* Resumen / mini-dashboard por Estado */}
      {showGraphs.estado && (
        <div className="factura-form" style={{ marginBottom: 12 }}>
          <div className="grid-2">
            <label>
              <span>Total filas</span>
              <input readOnly value={stats.total || 0} />
            </label>
            <label>
              <span>Entregado sin novedad</span>
              <input readOnly value={stats.by_estado?.['entregado sin novedad'] || 0} />
            </label>
            <label>
              <span>Entregado con detalle</span>
              <input readOnly value={stats.by_estado?.['entregado con detalle'] || 0} />
            </label>
            <label>
              <span>Rechazado</span>
              <input readOnly value={stats.by_estado?.['rechazado'] || 0} />
            </label>
            <label>
              <span>Reprogramado</span>
              <input readOnly value={stats.by_estado?.['reprogramado'] || 0} />
            </label>
          </div>
        </div>
      )}

      {/* Otros resúmenes: Pago, Carga, Ambiente, Conductor */}
      {showGraphs.pago && (
        <div className="factura-form" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Por condición de pago</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(stats.by_pago || {}).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([k,v]) => (
              <div key={k} className="badge badge-gray">{k || '(vacío)'}: {v}</div>
            ))}
            {!Object.keys(stats.by_pago || {}).length && (<div style={{ color: '#666' }}>Sin datos</div>)}
          </div>
        </div>
      )}
      {showGraphs.carga && (
        <div className="factura-form" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Por tipo de carga</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(stats.by_carga || {}).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([k,v]) => (
              <div key={k} className="badge badge-gray">{k || '(vacío)'}: {v}</div>
            ))}
            {!Object.keys(stats.by_carga || {}).length && (<div style={{ color: '#666' }}>Sin datos</div>)}
          </div>
        </div>
      )}
      {showGraphs.ambiente && (
        <div className="factura-form" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Por ambiente</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(stats.by_ambiente || {}).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([k,v]) => (
              <div key={k} className="badge badge-gray">{k || '(vacío)'}: {v}</div>
            ))}
            {!Object.keys(stats.by_ambiente || {}).length && (<div style={{ color: '#666' }}>Sin datos</div>)}
          </div>
        </div>
      )}
      {showGraphs.conductor && (
        <div className="factura-form" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Por conductor</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(stats.by_conductor || {}).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([k,v]) => (
              <div key={k} className="badge badge-gray">{k || '(vacío)'}: {v}</div>
            ))}
            {!Object.keys(stats.by_conductor || {}).length && (<div style={{ color: '#666' }}>Sin datos</div>)}
          </div>
        </div>
      )}

      <div className="factura-form" style={{ marginBottom: 12 }}>
        <div className="grid-2">
          <label>
            <span>Cliente</span>
            <select value={meta.cliente} onChange={e => setMeta(m => ({ ...m, cliente: e.target.value }))}>
              <option value="">—</option>
              {clientes.map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}
            </select>
          </label>
          <label>
            <span>Fecha</span>
            <input type="date" value={meta.fecha} onChange={e => setMeta(m => ({ ...m, fecha: e.target.value }))} />
          </label>
          <label className="full">
            <span>Descripción</span>
            <input value={meta.descripcion} onChange={e => setMeta(m => ({ ...m, descripcion: e.target.value }))} placeholder="Opcional" />
          </label>
        </div>
      </div>

      {!rows.length ? (
        <div className="content-placeholder">Importa una planilla Excel para comenzar</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <input value={newCol} onChange={e => setNewCol(e.target.value)} placeholder="Nueva columna" />
            <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => { addColumn(newCol); setNewCol('') }}>➕ Agregar columna</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Columna de personal:</span>
              <select value={personalCol} onChange={e => setPersonalCol(e.target.value)}>
                <option value="">—</option>
                {columns.map(c => (<option key={c} value={c}>{c}</option>))}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Buscar</span>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="texto en cualquier columna" />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Desplazamiento</span>
              <input type="range" min={0} max={Math.max(0, maxScrollX)} value={Math.min(scrollX, maxScrollX)} onChange={e => onSlide(e.target.value)} style={{ width: 260 }} />
            </label>
            <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => setShowFull(true)}>🗖 Ver planilla completa</button>
          </div>
          <div ref={wrapRef} className="table-wrapper" onScroll={onScrollWrap} style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table className="table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      title={c}
                      style={{
                        minWidth: 80,
                        maxWidth: widths[c] || undefined,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontWeight: personalCol === c ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{c}</span>
                        <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => moveColumn(c, 'left')}>←</button>
                        <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => moveColumn(c, 'right')}>→</button>
                        <button className="menu-button btn-sm" title="Eliminar columna" style={{ width: 'auto', borderColor: '#fca5a5', background: '#fee2e2' }} onClick={() => removeColumn(c)}>✕</button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter(r => {
                    if (!query) return true
                    const q = query.toLowerCase()
                    return Object.values(r || {}).some(v => String(v ?? '').toLowerCase().includes(q))
                  })
                  .map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td
                        key={c}
                        style={{
                          minWidth: 80,
                          maxWidth: widths[c] || undefined,
                          whiteSpace: 'normal',
                          overflowWrap: 'anywhere',
                          overflow: 'hidden',
                        }}
                      >
                        {personalCol === c ? (
                          <select value={r[c] || ''} onChange={e => setCell(i, c, e.target.value)}>
                            <option value="">—</option>
                            {drivers.map(d => (<option key={d.value} value={`${d.label}`}>{d.label}</option>))}
                          </select>
                        ) : (
                          <input value={r[c] ?? ''} onChange={e => setCell(i, c, e.target.value)} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showInfo && (
            <div className="modal-overlay" role="dialog" aria-modal="true">
              <div className="modal-card" style={{ maxWidth: 480 }}>
                <div className="modal-header">
                  <h3>Instrucciones</h3>
                  <button className="menu-button" style={{ width: 'auto' }} onClick={() => setShowInfo(false)}>Cerrar</button>
                </div>
                <div className="modal-body" style={{ fontSize: 15 }}>
                  <ul>
                    <li>Importa un archivo Excel o CSV para comenzar.</li>
                    <li>Puedes agregar, eliminar y mover columnas según tu necesidad.</li>
                    <li>Asigna la columna de personal para seleccionar conductores o peonetas.</li>
                    <li>Utiliza el botón "Guardar" para almacenar la planificación.</li>
                    <li>El botón "Limpiar todo" borra la información actual y el borrador.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {showFull && (
            <div className="modal-overlay" role="dialog" aria-modal="true">
              <div className="modal-card" style={{ width: 'min(1200px, 96vw)', maxHeight: '90vh' }}>
                <div className="modal-header">
                  <h3>Planilla completa (vista ampliada)</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => setShowFull(false)}>Cerrar</button>
                  </div>
                </div>
                <div className="modal-body" style={{ padding: 0 }}>
                  <div style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>Buscar</span>
                      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="texto en cualquier columna" />
                    </label>
                  </div>
                  <div className="table-wrapper" style={{ maxHeight: '70vh', overflow: 'auto' }}>
                    <table className="table" style={{ tableLayout: 'auto', width: 'max-content' }}>
                      <thead>
                        <tr>
                          {columns.map((c) => (
                            <th key={c} title={c} style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                <span style={{ fontWeight: personalCol === c ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{c}</span>
                              {/* Botones para mover y eliminar columna */}
                              <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => moveColumn(c, 'left')}>←</button>
                              <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => moveColumn(c, 'right')}>→</button>
                              <button
                                className="menu-button btn-sm"
                                title="Eliminar columna"
                                style={{ width: 'auto', borderColor: '#fca5a5', background: '#fee2e2' }}
                                onClick={() => removeColumn(c)}
                              >✕</button>
                            </div>
                          </th>
                        ))}
                        <th></th>
                      </tr>
                    </thead>
                      <tbody>
                        {rows
                          .filter(r => {
                            if (!query) return true
                            const q = query.toLowerCase()
                            return Object.values(r || {}).some(v => String(v ?? '').toLowerCase().includes(q))
                          })
                          .map((r, i) => (
                          <tr key={i}>
                            {columns.map((c) => (
                              <td key={c} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                                {personalCol === c ? (
                                  <select value={r[c] || ''} onChange={e => setCell(i, c, e.target.value)}>
                                    <option value="">—</option>
                                    {drivers.map(d => (<option key={d.value} value={`${d.label}`}>{d.label}</option>))}
                                  </select>
                                ) : (
                                  <input value={r[c] ?? ''} onChange={e => setCell(i, c, e.target.value)} />
                                )}
                              </td>
                            ))}
                            <td>
                              <button
                                className="menu-button btn-sm"
                                style={{ width: 'auto', borderColor: '#fca5a5', background: '#fee2e2' }}
                                title="Eliminar fila"
                                onClick={() => setRows(rs => rs.filter((_, idx) => idx !== i))}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

          {showInfo && (
            <div className="modal-overlay" role="dialog" aria-modal="true">
              <div className="modal-card" style={{ maxWidth: 480 }}>
                <div className="modal-header">
                  <h3>Instrucciones</h3>
                  <button className="menu-button" style={{ width: 'auto' }} onClick={() => setShowInfo(false)}>Cerrar</button>
                </div>
                <div className="modal-body" style={{ fontSize: 15 }}>
                  <ul>
                    <li>Importa tu planificación en formato Excel o CSV para comenzar.</li>
                    <br/>                  
                    <li>Idealmente debes subir archivo listo para lectura pero tambien puedes agregar, eliminar y mover columnas según tu necesidad.</li>
                    <br/>
                    <li>(Opcional) Asigna la columna de personal para seleccionar conductores o peonetas. (nutrisco como conductores-xp)</li>
                    <br/>
                    <li>Utiliza el botón "Guardar" para almacenar la planificación.</li>
                    <br/>
                    <li>*El botón "Limpiar todo" borra la información actual y el borrador.*</li>
                    
                  </ul>
                </div>
              </div>
            </div>
          )}
    </div>
  )
}

export default PlanificacionCrear
