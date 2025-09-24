import { useEffect, useMemo, useRef, useState } from 'react'
// # Listado con filtros, edición (PUT), historial y previsualización inline/descarga de archivos

const useClientes = (getAuthHeaders) => {
  const [list, setList] = useState([{ value: '', label: 'Todos' }])
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/clients', { headers: { ...(getAuthHeaders?.() || {}) } })
        const json = await res.json()
        if (res.ok && json?.ok) setList([{ value: '', label: 'Todos' }, ...(json.data || []).map(c => ({ value: String(c.id), label: c.name }))])
      } catch {}
    }
    load()
  }, [])
  return list
}

// Conductores/Peonetas para selects en formularios
const useDrivers = (getAuthHeaders) => {
  const [list, setList] = useState([])
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/drivers', { headers: { ...(getAuthHeaders?.() || {}) } })
        const json = await res.json()
        if (res.ok && json?.ok) setList((json.data || []).map(d => ({ value: String(d.id), label: `${d.nombre} ${d.apellido}`, rol: d.rol })))
      } catch {}
    }
    load()
  }, [])
  return list
}

function StatusBadge({ estado }) {
  // # Asigna colores según el estado para mejorar lectura
  const e = String(estado || '').toLowerCase()
  let cls = 'badge'
  if (e === 'rechazado') cls += ' badge-red'
  else if (e === 'reprogramado') cls += ' badge-yellow'
  else if (e === 'entregado sin novedad') cls += ' badge-green'
  else cls += ' badge-gray'
  return <span className={cls}>{estado || '—'}</span>
}

function Modal({ open, onClose, children, title, actions }) {
  // # Modal genérico para reutilizar en edición, historial y preview
  if (!open) return null
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h3>{title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {actions}
            <button className="menu-button" style={{ width: 'auto' }} onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function EditForm({ factura, onClose, onSaved, getAuthHeaders }) {
  // # Formulario de edición — no incluye archivos
  const [form, setForm] = useState(() => ({
    cliente: String(factura.cliente || ''),
    dia: factura.dia || '',
    fecha: factura.fecha || '',
    conductorXp: factura.conductor_xp || '',
    camion: factura.camion || '',
    vueltas: factura.vueltas ?? '',
    guia: factura.guia || '',
    local: factura.local || '',
    kg: factura.kg ?? '',
    carga: factura.carga || '',
    observaciones: factura.observaciones || '',
    estado: factura.estado || '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const drivers = useDrivers(getAuthHeaders)
  const initialDriverId = useMemo(() => {
    const full = String(factura.conductor_xp || '').trim()
    const found = (drivers || []).find(d => d.label === full)
    return found?.value || ''
  }, [drivers, factura.conductor_xp])
  const [driverId, setDriverId] = useState('')
  useEffect(() => { setDriverId(initialDriverId) }, [initialDriverId])
  const initialPeonetaId = useMemo(() => {
    const full = String(factura.peoneta || '').trim()
    const found = (drivers || []).find(d => d.label === full)
    return found?.value || ''
  }, [drivers, factura.peoneta])
  const [peonetaId, setPeonetaId] = useState('')
  useEffect(() => { setPeonetaId(initialPeonetaId) }, [initialPeonetaId])

  const onChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const onSubmit = async (e) => {
    // # PUT a la API y recarga el listado al terminar
    e.preventDefault()
    try {
      setSaving(true)
      setError('')
      const res = await fetch(`/api/facturas/${factura.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || 'Error')
      onSaved?.()
      onClose?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="factura-form">
      {error && <div style={{ color: '#9b1c1c', marginBottom: 8 }}>{error}</div>}
      <div className="grid-2">
        <label>
          <span>Día</span>
          <select name="dia" value={form.dia} onChange={onChange}>
            <option value="">Seleccionar</option>
            <option value="Domingo">Domingo</option>
            <option value="Lunes">Lunes</option>
            <option value="Martes">Martes</option>
            <option value="Miércoles">Miércoles</option>
            <option value="Jueves">Jueves</option>
            <option value="Viernes">Viernes</option>
            <option value="Sábado">Sábado</option>
          </select>
        </label>
        <label>
          <span>Fecha</span>
          <input type="date" name="fecha" value={form.fecha} onChange={onChange} />
        </label>
        <label>
          <span>Conductor</span>
          <select
            name="driver"
            value={driverId}
            onChange={(e) => {
              const id = e.target.value
              setDriverId(id)
              const found = (drivers || []).find(d => d.value === id)
              setForm(f => ({ ...f, conductorXp: found ? found.label : '' }))
            }}
          >
            <option value="">Seleccionar</option>
            {(drivers || []).filter(d => d.rol === 'conductor').map(d => (<option key={d.value} value={d.value}>{d.label}</option>))}
          </select>
        </label>
        <label>
          <span>Peoneta</span>
          <select
            name="peoneta"
            value={peonetaId}
            onChange={(e) => {
              const id = e.target.value
              setPeonetaId(id)
              const found = (drivers || []).find(d => d.value === id)
              setForm(f => ({ ...f, peoneta: found ? found.label : '' }))
            }}
          >
            <option value="">Seleccionar</option>
            {(drivers || []).map(d => (<option key={d.value} value={d.value}>{d.label}</option>))}
          </select>
        </label>
        <label>
          <span>Camión</span>
          <input name="camion" value={form.camion} onChange={onChange} />
        </label>
        <label>
          <span>Vueltas</span>
          <input type="number" name="vueltas" value={form.vueltas} onChange={onChange} />
        </label>
        <label>
          <span>N° factura (guía)</span>
          <input name="guia" value={form.guia} onChange={onChange} />
        </label>
        <label>
          <span>Ruta</span>
          <input name="local" value={form.local} onChange={onChange} />
        </label>
        <label>
          <span>KG</span>
          <input type="number" step="0.01" name="kg" value={form.kg} onChange={onChange} />
        </label>
        <label>
          <span>Carga</span>
          <input name="carga" value={form.carga} onChange={onChange} />
        </label>
        <label className="full">
          <span>Observaciones</span>
          <textarea name="observaciones" value={form.observaciones} onChange={onChange} rows={3} />
        </label>
        <label>
          <span>Estado</span>
          <select name="estado" value={form.estado} onChange={onChange}>
            <option value="">—</option>
            <option value="entregado sin novedad">entregado sin novedad</option>
            <option value="entregado con detalle">entregado con detalle</option>
            <option value="rechazado">rechazado</option>
            <option value="reprogramado">reprogramado</option>
          </select>
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="menu-button" style={{ width: 'auto' }} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

function FacturasList({ getAuthHeaders, canEdit }) {
  const clientes = useClientes(getAuthHeaders)
  const clientMap = useMemo(() => Object.fromEntries((clientes || []).map(c => [String(c.value), c.label])), [clientes])
  // # Estado de filtros y datos de la tabla
  const [filters, setFilters] = useState({ cliente: '', fecha: '', guia: '', q: '' })
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [history, setHistory] = useState({ open: false, items: [], title: '' })
  const [preview, setPreview] = useState({ open: false, src: '', kind: '' })
  const [sort, setSort] = useState('') // '', 'guia_asc', 'guia_desc'
  const [details, setDetails] = useState({ open: false, factura: null })
  // Slider/scroll horizontal
  const wrapRef = useRef(null)
  const [scrollX, setScrollX] = useState(0)
  const [maxScrollX, setMaxScrollX] = useState(0)

  const queryString = useMemo(() => {
    // # Serializa filtros en querystring
    const p = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v) p.set(k, v)
    })
    p.set('limit', '50')
    // Asegura offset por defecto (el backend espera un número)
    p.set('offset', '0')
    if (sort) p.set('sort', sort)
    return p.toString()
  }, [filters, sort])

  const buildExportUrl = (overrides = {}) => {
    const p = new URLSearchParams()
    const src = { ...filters, ...overrides }
    Object.entries(src).forEach(([k, v]) => { if (v) p.set(k, v) })
    if (sort) p.set('sort', sort)
    return `/api/facturas/export?${p.toString()}`
  }

  const exportCsv = () => downloadCsv(buildExportUrl(), `facturas-${Date.now()}.csv`)
  const exportCsvCliente = () => { if (filters.cliente) downloadCsv(buildExportUrl({ fecha: '', guia: '', q: '' }), `facturas-cliente-${filters.cliente}-${Date.now()}.csv`) }
  const exportCsvFecha = () => { if (filters.fecha) downloadCsv(buildExportUrl({ cliente: '', guia: '', q: '' }), `facturas-fecha-${filters.fecha}.csv`) }

  const bulkDelete = async () => {
    if (!canEdit) return
    const warn = `Esto eliminará TODAS las facturas que coinciden con los filtros actuales (no solo la página).\n\n¿Confirmas eliminar?`
    if (!confirm(warn)) return
    try {
      setLoading(true)
      setError('')
      const body = { ...filters }
      const res = await fetch('/api/facturas/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error al eliminar')
      await load()
      alert(`Eliminadas: ${json.deleted}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const load = async () => {
    // # Carga el listado con los filtros actuales
    try {
      setLoading(true)
      setError('')
      const res = await fetch(`/api/facturas?${queryString}`, { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || 'Error')
      setData(json.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Cambia orden de una llave soportada y recarga
  const toggleSortAndLoad = async (key) => {
    const current = String(sort || '')
    const asc = `${key}_asc`; const desc = `${key}_desc`
    const next = current === asc ? desc : asc
    setSort(next)
    const p = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v) })
    p.set('limit', '50')
    p.set('offset', '0')
    p.set('sort', next)
    try {
      setLoading(true); setError('')
      const res = await fetch(`/api/facturas?${p.toString()}`, { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || 'Error')
      setData(json.data || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const openHistory = async (id) => {
    // # Abre historial de cambios de una factura
    try {
      const res = await fetch(`/api/facturas/${id}/historial`, { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || 'Error')
      setHistory({ open: true, items: json.data || [], title: `Historial #${id}` })
    } catch (e) {
      setHistory({ open: true, items: [], title: `Historial #${id} (error)` })
    }
  }

  async function downloadCsv(url, filename) {
    try {
      const res = await fetch(url, { headers: { ...(getAuthHeaders?.() || {} ) } })
      if (!res.ok) throw new Error('Error exportando CSV')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(link.href)
    } catch (e) {
      alert(e.message)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Medir scroll máximo y sincronizar slider
  const measureScroll = () => {
    const el = wrapRef.current
    if (!el) return
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    setMaxScrollX(max)
    setScrollX(el.scrollLeft)
  }
  useEffect(() => { measureScroll() }, [data])
  useEffect(() => {
    const onResize = () => measureScroll()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const onScrollWrap = () => { const el = wrapRef.current; if (el) setScrollX(el.scrollLeft) }
  const onSlide = (v) => { const el = wrapRef.current; if (!el) return; el.scrollLeft = Number(v); setScrollX(Number(v)) }

  const onChange = (e) => {
    // # Actualiza filtros de búsqueda
    const { name, value } = e.target
    setFilters((f) => ({ ...f, [name]: value }))
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Facturas pendientes</h2>
      <div className="filters sticky-filters">
        <select name="cliente" value={filters.cliente} onChange={onChange}>
          {clientes.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <input type="date" name="fecha" value={filters.fecha} onChange={onChange} />
        <input name="guia" value={filters.guia} onChange={onChange} placeholder="N° factura (guía)" />
        <input name="q" value={filters.q} onChange={onChange} placeholder="Buscar general (ruta, conductor, etc.)" />
        <button className="menu-button" style={{ width: 'auto' }} onClick={load} disabled={loading}>
          {loading ? 'Buscando...' : '🔍 Buscar'}
        </button>
        {/* El orden correlativo por N° de factura ahora se controla desde el encabezado de la tabla */}
        <button className="menu-button" style={{ width: 'auto' }} onClick={() => exportCsv()}>
          Exportar CSV
        </button>
        <button className="menu-button" style={{ width: 'auto' }} onClick={() => exportCsvCliente()} disabled={!filters.cliente} title="Exportar solo por cliente seleccionado">
          Exportar (cliente)
        </button>
        <button className="menu-button" style={{ width: 'auto' }} onClick={() => exportCsvFecha()} disabled={!filters.fecha} title="Exportar solo por fecha seleccionada">
          Exportar (fecha)
        </button>
        {canEdit && (
          <button
            className="menu-button"
            style={{ width: 'auto', borderColor: '#fca5a5', background: '#fee2e2' }}
            onClick={bulkDelete}
            title="Eliminar en masa según los filtros actuales"
          >
            Eliminar filtradas
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: '#9b1c1c', marginTop: 8 }}>{error}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#555', fontSize: 12 }}>Desplazamiento</span>
          <input type="range" min={0} max={Math.max(0, maxScrollX)} value={Math.min(scrollX, maxScrollX)} onChange={e => onSlide(e.target.value)} style={{ width: 260 }} />
        </label>
      </div>
      <div ref={wrapRef} className="table-wrapper" onScroll={onScrollWrap}>
        <table className="table">
          <thead>
            <tr>
              <th className="col-fecha">
                <button
                  type="button"
                  className="menu-button"
                  style={{ width: 'auto' }}
                  onClick={() => toggleSortAndLoad('fecha')}
                  title="Ordenar por Fecha"
                >
                  Fecha {sort === 'fecha_desc' ? '↓' : sort === 'fecha_asc' ? '↑' : ''}
                </button>
              </th>
              <th className="col-numero">
                <button
                  type="button"
                  className="menu-button"
                  style={{ width: 'auto' }}
                  onClick={() => toggleSortAndLoad('guia')}
                  title="Ordenar por N° de factura (correlativo)"
                >
                  N° factura {sort === 'guia_desc' ? '↓' : '↑'}
                </button>
              </th>
              <th className="col-hide-sm">Cliente</th>
              <th className="col-hide-sm">Ruta</th>
              <th className="col-hide-sm">Conductor</th>
              <th className="col-estado">Estado</th>
              <th className="col-hide-sm">Archivos</th>
              <th className="col-acciones">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((f) => {
              const numeroFactura = f.numero_factura || f.guia || ''
              const ruta = f.ruta || f.local || ''
              return (
                <tr key={f.id}>
                  <td className="col-fecha">{f.fecha}</td>
                  <td className="col-numero">{numeroFactura}</td>
                  <td className="col-hide-sm">{clientMap[String(f.cliente)] || String(f.cliente || '')}</td>
                  <td className="col-hide-sm">{ruta}</td>
                  <td className="col-hide-sm">{f.conductor_xp || ''}</td>
                  <td className="col-estado"><StatusBadge estado={f.estado} /></td>
                  <td className="col-hide-sm">
                    {(f.archivos || []).map((a, i) => {
                      const isImg = String(a.mimetype || '').startsWith('image/')
                      const isPdf = String(a.mimetype || '') === 'application/pdf'
                      const inlineSrc = `/files/inline/${a.filename}`
                      return (
                        <span key={i} style={{ marginRight: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {isImg ? (
                            <img
                              src={inlineSrc}
                              alt={a.filename}
                              className="thumb"
                              onClick={() => setPreview({ open: true, src: inlineSrc, kind: 'image', download: `/files/${a.filename}`, name: a.filename })}
                            />
                          ) : isPdf ? (
                            <button
                              className="menu-button btn-sm"
                              style={{ width: 'auto' }}
                              onClick={() => setPreview({ open: true, src: inlineSrc, kind: 'pdf', download: `/files/${a.filename}`, name: a.filename })}
                            >
                              Ver PDF
                            </button>
                          ) : (
                            <span style={{ fontSize: 12 }}>Archivo</span>
                          )}
                        </span>
                      )
                    })}
                  </td>
                  <td className="col-acciones">
                    <button
                      className="menu-button btn-sm"
                      style={{ width: 'auto', marginRight: 6 }}
                      onClick={() => setDetails({ open: true, factura: f })}
                    >
                      Detalles
                    </button>
                    {canEdit && (
                      <button
                        className="menu-button btn-sm"
                        style={{ width: 'auto', marginRight: 6 }}
                        onClick={() => setEditing(f)}
                      >
                        Editar
                      </button>
                    )}
                     <button className="menu-button btn-sm" style={{ width: 'auto', marginRight: 6 }} onClick={() => openHistory(f.id)}>
                       Historial
                     </button>
                    {canEdit && (
                      <button
                        className="menu-button btn-sm"
                        style={{ width: 'auto', borderColor: '#fca5a5', background: '#fee2e2' }}
                        onClick={async () => {
                          if (!confirm('¿Eliminar esta factura?')) return
                          try {
                            const res = await fetch(`/api/facturas/${f.id}`, { method: 'DELETE', headers: { ...(getAuthHeaders?.() || {}) } })
                            const json = await res.json().catch(() => ({}))
                            if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error al eliminar')
                            await load()
                          } catch (e) {
                            alert(e.message)
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar factura #${editing?.id}`}>
        {editing && (
          <EditForm
            factura={editing}
            onClose={() => setEditing(null)}
            onSaved={() => load()}
            getAuthHeaders={getAuthHeaders}
          />
        )}
      </Modal>

      <Modal open={details.open} onClose={() => setDetails({ open: false, factura: null })} title={`Detalles factura #${details.factura?.id || ''}`}>
        {details.factura && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><strong>Fecha</strong><br />{details.factura.fecha || ''}</div>
            <div><strong>N° factura</strong><br />{details.factura.numero_factura || details.factura.guia || ''}</div>
            <div><strong>Conductor</strong><br />{details.factura.conductor_xp || ''}</div>
            <div><strong>Peoneta</strong><br />{details.factura.peoneta || ''}</div>
            <div><strong>Ruta</strong><br />{details.factura.ruta || details.factura.local || ''}</div>
            <div><strong>Estado</strong><br />{details.factura.estado || ''}</div>
            <div><strong>KG</strong><br />{details.factura.kg != null ? details.factura.kg : ''}</div>
            <div><strong>Vueltas</strong><br />{details.factura.vueltas != null ? details.factura.vueltas : ''}</div>
            <div className="full" style={{ gridColumn: '1 / -1' }}>
              <strong>Observaciones</strong>
              <div>{details.factura.observaciones || '—'}</div>
            </div>
            <div className="full" style={{ gridColumn: '1 / -1' }}>
              <strong>Archivos</strong>
              <div>
                {(details.factura.archivos || []).length === 0 ? '—' : (
                  (details.factura.archivos || []).map((a, i) => {
                    const isImg = String(a.mimetype || '').startsWith('image/')
                    const isPdf = String(a.mimetype || '') === 'application/pdf'
                    const inlineSrc = `/files/inline/${a.filename}`
                    return (
                      <span key={i} style={{ marginRight: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {isImg ? (
                          <img src={inlineSrc} alt={a.filename} className="thumb" />
                        ) : isPdf ? (
                          <a className="menu-button" style={{ width: 'auto' }} href={inlineSrc} target="_blank" rel="noreferrer">Ver PDF</a>
                        ) : (
                          <span style={{ fontSize: 12 }}>Archivo</span>
                        )}
                        <a href={`/files/${a.filename}`} download={a.filename}>Descargar</a>
                      </span>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={history.open} onClose={() => setHistory({ open: false, items: [], title: '' })} title={history.title}>
        {history.items.length === 0 ? (
          <div>No hay cambios registrados.</div>
        ) : (
          <ul>
            {history.items.map((h, idx) => (
              <li key={idx} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#666' }}>{new Date(h.changed_at || h.changedAt).toLocaleString()}</div>
                <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8, borderRadius: 8 }}>
                  {JSON.stringify(h.changes, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={preview.open}
        onClose={() => setPreview({ open: false, src: '', kind: '' })}
        title={preview.kind === 'pdf' ? 'Vista previa PDF' : 'Vista previa'}
        actions={preview.download ? (
          <a className="menu-button btn-sm" href={preview.download} download={preview.name || ''} title="Descargar">⤓ Descargar</a>
        ) : null}
      >
        {preview.kind === 'image' ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img src={preview.src} alt="preview" style={{ maxWidth: '100%', maxHeight: '70vh' }} />
          </div>
        ) : preview.kind === 'pdf' ? (
          <iframe src={preview.src} title="pdf" style={{ width: '100%', height: '70vh', border: 'none' }} />
        ) : null}
      </Modal>
    </div>
  )
}

export default FacturasList
