import { useEffect, useMemo, useState } from 'react'
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

function Modal({ open, onClose, children, title }) {
  // # Modal genérico para reutilizar en edición, historial y preview
  if (!open) return null
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="menu-button" style={{ width: 'auto' }} onClick={onClose}>Cerrar</button>
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
          <span>Conductor-XP</span>
          <input name="conductorXp" value={form.conductorXp} onChange={onChange} />
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
  // # Estado de filtros y datos de la tabla
  const [filters, setFilters] = useState({ cliente: '', fecha: '', guia: '', q: '' })
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [history, setHistory] = useState({ open: false, items: [], title: '' })
  const [preview, setPreview] = useState({ open: false, src: '', kind: '' })
  const [sort, setSort] = useState('') // '', 'guia_asc', 'guia_desc'

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

  const onChange = (e) => {
    // # Actualiza filtros de búsqueda
    const { name, value } = e.target
    setFilters((f) => ({ ...f, [name]: value }))
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Facturas</h2>
      <div className="filters">
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

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>
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
              <th>
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
              <th>Conductor</th>
              <th>Ruta</th>
              <th>Estado</th>
              <th>
                <button
                  type="button"
                  className="menu-button"
                  style={{ width: 'auto' }}
                  onClick={() => toggleSortAndLoad('kg')}
                  title="Ordenar por KG"
                >
                  KG {sort === 'kg_desc' ? '↓' : sort === 'kg_asc' ? '↑' : ''}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="menu-button"
                  style={{ width: 'auto' }}
                  onClick={() => toggleSortAndLoad('vueltas')}
                  title="Ordenar por Vueltas"
                >
                  Vueltas {sort === 'vueltas_desc' ? '↓' : sort === 'vueltas_asc' ? '↑' : ''}
                </button>
              </th>
              <th>Archivos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((f) => {
              const numeroFactura = f.numero_factura || f.guia || ''
              const ruta = f.ruta || f.local || ''
              return (
                <tr key={f.id}>
                  <td>{f.fecha}</td>
                  <td>{numeroFactura}</td>
                  <td>{f.conductor_xp || ''}</td>
                  <td>{ruta}</td>
                  <td><StatusBadge estado={f.estado} /></td>
                  <td>{f.kg != null ? f.kg : ''}</td>
                  <td>{f.vueltas != null ? f.vueltas : ''}</td>
                  <td>
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
                              onClick={() => setPreview({ open: true, src: inlineSrc, kind: 'image' })}
                            />
                          ) : isPdf ? (
                            <button
                              className="menu-button"
                              style={{ width: 'auto' }}
                              onClick={() => setPreview({ open: true, src: inlineSrc, kind: 'pdf' })}
                            >
                              Ver PDF
                            </button>
                          ) : (
                            <span style={{ fontSize: 12 }}>Archivo</span>
                          )}
                          <a href={`/files/${a.filename}`} download={a.filename}>Descargar</a>
                        </span>
                      )
                    })}
                  </td>
                  <td>
                    {canEdit && (
                    <button className="menu-button" style={{ width: 'auto', marginRight: 6 }} onClick={() => setEditing(f)}>
                      Editar
                    </button>
                    )}
                     <button className="menu-button" style={{ width: 'auto' }} onClick={() => openHistory(f.id)}>
                       Historial
                     </button>
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

      <Modal open={preview.open} onClose={() => setPreview({ open: false, src: '', kind: '' })} title={preview.kind === 'pdf' ? 'Vista previa PDF' : 'Vista previa'}>
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
