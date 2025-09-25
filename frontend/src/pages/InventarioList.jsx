// Inventario de resguardos: listado con filtros, preview de imágenes, edición y exportación CSV.
import { useEffect, useMemo, useRef, useState } from 'react'

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

function Modal({ open, onClose, children, title }) {
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

function EditResguardoForm({ item, onClose, onSaved, getAuthHeaders }) {
  const clientes = useClientes(getAuthHeaders)
  const [form, setForm] = useState({
    cantidad: item.cantidad ?? '',
    tipo: item.tipo || 'seco',
    nombre: item.nombre || '',
    guia: item.guia || '',
    cliente: String(item.cliente || ''),
    fecha_ingreso: item.fecha_ingreso || '',
    fecha_salida: item.fecha_salida || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const onChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      setError('')
      const res = await fetch(`/api/resguardos/${item.id}`, {
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
          <span>Cantidad</span>
          <input type="number" name="cantidad" value={form.cantidad} onChange={onChange} />
        </label>
        <label>
          <span>Tipo</span>
          <select name="tipo" value={form.tipo} onChange={onChange}>
            <option value="seco">Seco</option>
            <option value="refrigerado">Refrigerado</option>
            <option value="congelado">Congelado</option>
          </select>
        </label>
        <label>
          <span>Producto</span>
          <input name="nombre" value={form.nombre} onChange={onChange} />
        </label>
        <label>
          <span>N° factura</span>
          <input name="guia" value={form.guia} onChange={onChange} />
        </label>
        <label>
          <span>Cliente</span>
          <select name="cliente" value={form.cliente} onChange={onChange}>
            {clientes.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
          </select>
        </label>
        <label>
          <span>Fecha ingreso</span>
          <input type="date" name="fecha_ingreso" value={form.fecha_ingreso} onChange={onChange} />
        </label>
        <label>
          <span>Fecha salida</span>
          <input type="date" name="fecha_salida" value={form.fecha_salida} onChange={onChange} />
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

function InventarioList({ getAuthHeaders, canEdit }) {
  const clientes = useClientes(getAuthHeaders)
  const clientMap = useMemo(() => Object.fromEntries((clientes || []).map(c => [String(c.value), c.label])), [clientes])
  const [filters, setFilters] = useState({ cliente: '', fecha: '', guia: '', q: '' })
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState({ open: false, src: '' })
  const [editing, setEditing] = useState(null)
  const wrapRef = useRef(null)
  const [scrollX, setScrollX] = useState(0)
  const [maxScrollX, setMaxScrollX] = useState(0)
  const [details, setDetails] = useState({ open: false, item: null })

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v) })
    p.set('limit', '50')
    return p.toString()
  }, [filters])

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetch(`/api/resguardos?${queryString}`, { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || 'Error')
      setData(json.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const exportCsv = async () => {
    const p = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v) })
    const url = `/api/resguardos/export?${p.toString()}`
    try {
      const res = await fetch(url, { headers: { ...(getAuthHeaders?.() || {}) } })
      if (!res.ok) throw new Error('Error exportando CSV')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `resguardos-${Date.now()}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(link.href)
    } catch (e) { alert(e.message) }
  }

  useEffect(() => { load() }, [])
  const measureScroll = () => { const el = wrapRef.current; if (!el) return; const max = Math.max(0, el.scrollWidth - el.clientWidth); setMaxScrollX(max); setScrollX(el.scrollLeft) }
  useEffect(() => { measureScroll() }, [data])
  useEffect(() => { const onResize = () => measureScroll(); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize) }, [])
  const onScrollWrap = () => { const el = wrapRef.current; if (el) setScrollX(el.scrollLeft) }
  const onSlide = (v) => { const el = wrapRef.current; if (!el) return; el.scrollLeft = Number(v); setScrollX(Number(v)) }

  const onChange = (e) => {
    const { name, value } = e.target
    setFilters((f) => ({ ...f, [name]: value }))
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Inventario (resguardos)</h2>
      <div className="filters sticky-filters">
        <select name="cliente" value={filters.cliente} onChange={onChange}>
          {clientes.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
        </select>
        <input type="date" name="fecha" value={filters.fecha} onChange={onChange} />
        <input name="guia" value={filters.guia} onChange={onChange} placeholder="N° factura (guía)" />
        <input name="q" value={filters.q} onChange={onChange} placeholder="Buscar general" />
        <button className="menu-button" style={{ width: 'auto' }} onClick={load} disabled={loading}>
          {loading ? 'Buscando...' : '🔍 Buscar'}
        </button>
        <button className="menu-button" style={{ width: 'auto' }} onClick={exportCsv}>
          Exportar CSV
        </button>
      </div>

      {error && <div style={{ color: '#9b1c1c', marginTop: 8 }}>{error}</div>}

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
              <th>Fecha ingreso</th>
              <th>Cliente</th>
              <th>Ruta</th>
              <th>Producto</th>
              <th>N° factura</th>
              <th>Cantidad</th>
              <th>Tipo</th>
              <th>Fecha salida</th>
              <th>Archivos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td>{r.fecha_ingreso}</td>
                <td>{clientMap[String(r.cliente)] || String(r.cliente)}</td>
                <td>{r.ruta || ''}</td>
                <td>{r.nombre || ''}</td>
                <td>{r.guia || ''}</td>
                <td>{r.cantidad}</td>
                <td>{r.tipo}</td>
                <td>{r.fecha_salida || ''}</td>
                <td>
                  {(r.archivos || []).map((a, i) => (
                    <span key={i} style={{ marginRight: 8 }}>
                      <img
                        src={`/files/inline/${a.filename}`}
                        alt={a.filename}
                        className="thumb"
                        onClick={() => setPreview({ open: true, src: `/files/inline/${a.filename}` })}
                      />
                    </span>
                  ))}
                </td>
                <td>
                  <button
                    className="menu-button only-sm"
                    style={{ width: 'auto', marginRight: 6 }}
                    onClick={() => setDetails({ open: true, item: r })}
                  >
                    Detalles
                  </button>
                  {canEdit && (
                    <>
                      <button className="menu-button" style={{ width: 'auto', marginRight: 6 }} onClick={() => setEditing(r)}>
                        Editar
                      </button>
                      <button
                        className="menu-button"
                        style={{ width: 'auto' }}
                        onClick={async () => {
                          if (!confirm('¿Eliminar resguardo?')) return
                          const res = await fetch(`/api/resguardos/${r.id}`, { method: 'DELETE', headers: { ...(getAuthHeaders?.() || {}) } })
                          const json = await res.json().catch(() => ({}))
                          if (!res.ok || json?.ok === false) {
                            alert(json?.message || 'Error al eliminar')
                            return
                          }
                          load()
                        }}
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview.open && (
        <div className="modal-overlay" onClick={() => setPreview({ open: false, src: '' })}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Vista previa</h3>
              <button className="menu-button" style={{ width: 'auto' }} onClick={() => setPreview({ open: false, src: '' })}>Cerrar</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', justifyContent: 'center' }}>
              <img src={preview.src} alt="preview" style={{ maxWidth: '100%', maxHeight: '70vh' }} />
            </div>
          </div>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar resguardo #${editing?.id}`}>
        {editing && (
          <EditResguardoForm item={editing} onClose={() => setEditing(null)} onSaved={load} getAuthHeaders={getAuthHeaders} />
        )}
      </Modal>

      <Modal open={details.open} onClose={() => setDetails({ open: false, item: null })} title={`Detalles resguardo #${details.item?.id || ''}`}>
        {details.item && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><strong>Fecha ingreso</strong><br />{details.item.fecha_ingreso || ''}</div>
            <div><strong>Fecha salida</strong><br />{details.item.fecha_salida || '—'}</div>
            <div><strong>Cliente</strong><br />{clientMap[String(details.item.cliente)] || String(details.item.cliente)}</div>
            <div><strong>Ruta</strong><br />{details.item.ruta || '—'}</div>
            <div><strong>Producto</strong><br />{details.item.nombre || '—'}</div>
            <div><strong>N° factura</strong><br />{details.item.guia || '—'}</div>
            <div><strong>Cantidad</strong><br />{details.item.cantidad != null ? details.item.cantidad : '—'}</div>
            <div><strong>Tipo</strong><br />{details.item.tipo || '—'}</div>
            <div className="full" style={{ gridColumn: '1 / -1' }}>
              <strong>Archivos</strong>
              <div>
                {(details.item.archivos || []).length === 0 ? '—' : (
                  (details.item.archivos || []).map((a, i) => (
                    <span key={i} style={{ marginRight: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <img
                        src={`/files/inline/${a.filename}`}
                        alt={a.filename}
                        className="thumb"
                        onClick={() => setPreview({ open: true, src: `/files/inline/${a.filename}` })}
                      />
                      <a href={`/files/${a.filename}`} download={a.filename}>Descargar</a>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default InventarioList
