import { useEffect, useMemo, useState } from 'react'

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
  const [filters, setFilters] = useState({ cliente: '', fecha: '', guia: '', q: '' })
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState({ open: false, src: '' })
  const [editing, setEditing] = useState(null)

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

  const onChange = (e) => {
    const { name, value } = e.target
    setFilters((f) => ({ ...f, [name]: value }))
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Inventario (resguardos)</h2>
      <div className="filters">
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

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha ingreso</th>
              <th>Cliente</th>
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
                <td>{String(r.cliente)}</td>
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
    </div>
  )
}

export default InventarioList
