import { useEffect, useMemo, useState } from 'react'

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

// Muestra el estado del correo con icono + texto: Enviado / No enviado
function CorreoBadge({ value }) {
  if (value === true) {
    return <span title="Correo enviado" style={{ color: '#16a34a', fontWeight: 600 }}>✓ Enviado</span>
  }
  if (value === false) {
    return <span title="Correo no enviado" style={{ color: '#dc2626', fontWeight: 600 }}>✗ No enviado</span>
  }
  return <span title="Sin dato" style={{ color: '#6b7280' }}>—</span>
}

function EditForm({ item, onClose, onSaved, getAuthHeaders }) {
  const [form, setForm] = useState({
    fecha: item.fecha || '',
    chofer: item.chofer || '',
    camion: item.camion || '',
    producto: item.producto || '',
    cantidad: item.cantidad ?? '',
    local: item.local || '',
    numeroPedido: item.numero_pedido || item.numeroPedido || '',
    numeroFactura: item.numero_factura || item.numeroFactura || '',
    valorFactura: item.valor_factura ?? item.valorFactura ?? '',
    condicionPago: item.condicion_pago || item.condicionPago || '',
    correoEnviado: item.correo_enviado ?? false,
    total: item.total ?? '',
    observaciones: item.observaciones || '',
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
      const res = await fetch(`/api/rendiciones/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error')
      onSaved?.()
      onClose?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="factura-form">
      {error && <div style={{ color: '#9b1c1c', marginBottom: 8 }}>{error}</div>}
      <div className="grid-2">
        <label>
          <span>Fecha</span>
          <input type="date" name="fecha" value={form.fecha} onChange={onChange} />
        </label>
        <label>
          <span>Chofer</span>
          <input name="chofer" value={form.chofer} onChange={onChange} />
        </label>
        <label>
          <span>Camión</span>
          <input name="camion" value={form.camion} onChange={onChange} />
        </label>
        <label>
          <span>Producto</span>
          <input name="producto" value={form.producto} onChange={onChange} />
        </label>
        <label>
          <span>Cantidad</span>
          <input type="number" name="cantidad" value={form.cantidad} onChange={onChange} />
        </label>
        <label>
          <span>Local</span>
          <input name="local" value={form.local} onChange={onChange} />
        </label>
        <label>
          <span>Número de pedido</span>
          <input name="numeroPedido" value={form.numeroPedido} onChange={onChange} />
        </label>
        <label>
          <span>Número de factura</span>
          <input name="numeroFactura" value={form.numeroFactura} onChange={onChange} />
        </label>
        <label>
          <span>Valor de la factura</span>
          <input type="number" step="0.01" name="valorFactura" value={form.valorFactura} onChange={onChange} />
        </label>
        <label>
          <span>Condición de pago</span>
          <select name="condicionPago" value={form.condicionPago} onChange={onChange}>
            <option value="">Seleccionar</option>
            <option value="transferencia">transferencia</option>
            <option value="30 dias">30 dias</option>
            <option value="efectivo">efectivo</option>
            <option value="ecommerce">ecommerce</option>
          </select>
        </label>
        <label>
          <span>Correo enviado</span>
          <input type="checkbox" checked={!!form.correoEnviado} onChange={(e) => setForm(f => ({ ...f, correoEnviado: e.target.checked }))} />
        </label>
        <label>
          <span>Total</span>
          <input type="number" step="0.01" name="total" value={form.total} onChange={onChange} />
        </label>
        <label className="full">
          <span>Observaciones</span>
          <textarea rows={3} name="observaciones" value={form.observaciones} onChange={onChange} />
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

function RendicionesList({ getAuthHeaders, canEdit }) {
  const [filters, setFilters] = useState({ fecha: '', chofer: '', correo: '', q: '' })
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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
      const res = await fetch(`/api/rendiciones?${queryString}`, { headers: { ...(getAuthHeaders?.() || {}) } })
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
    const url = `/api/rendiciones/export?${p.toString()}`
    try {
      const res = await fetch(url, { headers: { ...(getAuthHeaders?.() || {}) } })
      if (!res.ok) throw new Error('Error exportando CSV')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `rendiciones-${Date.now()}.csv`
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
      <h2 style={{ marginTop: 0 }}>Rendiciones</h2>
      <div className="filters">
        <input type="date" name="fecha" value={filters.fecha} onChange={onChange} />
        <input name="chofer" value={filters.chofer} onChange={onChange} placeholder="Chofer" />
        <input name="q" value={filters.q} onChange={onChange} placeholder="Buscar general" />
        <select name="correo" value={filters.correo} onChange={onChange} title="Filtrar por correo enviado">
          <option value="">Correo: todos</option>
          <option value="true">Correo: correcto</option>
          <option value="false">Correo: incorrecto</option>
        </select>
        <button className="menu-button" style={{ width: 'auto' }} onClick={load} disabled={loading}>
          {loading ? 'Buscando...' : '🔍 Buscar'}
        </button>
        <button className="menu-button" style={{ width: 'auto' }} onClick={exportCsv}>Exportar CSV</button>
      </div>

      {error && <div style={{ color: '#9b1c1c', marginTop: 8 }}>{error}</div>}

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Chofer</th>
              <th>Camión</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Local</th>
              <th>N° pedido</th>
              <th>N° factura</th>
              <th>Valor factura</th>
              <th>Condición pago</th>
              <th>Correo</th>
              <th>Total</th>
              <th>Observaciones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td>{r.fecha}</td>
                <td>{r.chofer || ''}</td>
                <td>{r.camion || ''}</td>
                <td>{r.producto || ''}</td>
                <td>{r.cantidad != null ? r.cantidad : ''}</td>
                <td>{r.local || ''}</td>
                <td>{r.numero_pedido || ''}</td>
                <td>{r.numero_factura || ''}</td>
                <td>{r.valor_factura != null ? r.valor_factura : ''}</td>
                <td>{r.condicion_pago || ''}</td>
                <td><CorreoBadge value={r.correo_enviado ?? r.correoEnviado ?? null} /></td>
                <td>{r.total != null ? r.total : ''}</td>
                <td>{r.observaciones || ''}</td>
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
                          if (!confirm('¿Eliminar esta rendición?')) return
                          try {
                            const res = await fetch(`/api/rendiciones/${r.id}`, { method: 'DELETE', headers: { ...(getAuthHeaders?.() || {}) } })
                            const json = await res.json().catch(() => ({}))
                            if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error al eliminar')
                            load()
                          } catch (e) { alert(e.message) }
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

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar rendición #${editing?.id}`}>
        {editing && (
          <EditForm item={editing} onClose={() => setEditing(null)} onSaved={load} getAuthHeaders={getAuthHeaders} />
        )}
      </Modal>
    </div>
  )
}

export default RendicionesList
