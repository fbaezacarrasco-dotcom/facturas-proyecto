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

function PlanificacionesList({ getAuthHeaders, canEdit }) {
  const clientes = useClientes(getAuthHeaders)
  const [filters, setFilters] = useState({ cliente: '', fecha: '' })
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState({ open: false, item: null, rows: [], edit: false })
  const [qFactura, setQFactura] = useState('')

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v) })
    p.set('limit', '50')
    return p.toString()
  }, [filters])

  const load = async () => {
    try {
      setLoading(true); setError('')
      const res = await fetch(`/api/planificaciones?${qs}`, { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json?.message || 'Error')
      setData(json.data || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openDetail = async (id) => {
    try {
      const res = await fetch(`/api/planificaciones/${id}`, { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json?.message || 'Error')
      setDetail({ open: true, item: json.data, rows: json.data.rows || [], edit: false })
      setQFactura('')
    } catch (e) { alert(e.message) }
  }

  const exportDetail = async () => {
    if (!detail.item?.id) return
    try {
      const res = await fetch(`/api/planificaciones/${detail.item.id}/export`, { headers: { ...(getAuthHeaders?.() || {}) } })
      if (!res.ok) throw new Error('Error exportando CSV')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `planificacion-${detail.item.id}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(link.href)
    } catch (e) { alert(e.message) }
  }

  const headers = useMemo(() => {
    const base = new Set()
    for (const r of (detail.rows || [])) Object.keys(r).forEach(k => base.add(k))
    return Array.from(base)
  }, [detail.rows])

  // Detectar la columna que corresponde a "factura" entre los headers disponibles
  const facturaKey = useMemo(() => {
    const norm = (s) => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll(/[^a-z0-9]+/g,'').trim()
    const target = 'factura'
    for (const h of headers) {
      if (norm(h) === target || norm(h).endsWith(target)) return h
    }
    // fallback a 'guia' si no existe columna factura
    const target2 = 'guia'
    for (const h of headers) {
      if (norm(h) === target2 || norm(h).endsWith(target2)) return h
    }
    return null
  }, [headers])

  // Detectar columna de pedido (numero_pedido / pedido / n° pedido)
  const pedidoKey = useMemo(() => {
    const norm = (s) => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll(/[^a-z0-9]+/g,'').trim()
    const targets = ['numeropedido','pedido']
    for (const t of targets) {
      for (const h of headers) {
        const nh = norm(h)
        if (nh === t || nh.endsWith(t)) return h
      }
    }
    return null
  }, [headers])

  const filteredRows = useMemo(() => {
    if (!qFactura) return detail.rows || []
    const raw = String(qFactura)
    const qnum = raw.replace(/\D/g, '')
    const isNum = qnum.length > 0
    const q = raw.toLowerCase()
    const matches = (val) => {
      if (val == null) return false
      const sv = String(val)
      if (isNum) return sv.replace(/\D/g, '').includes(qnum)
      return sv.toLowerCase().includes(q)
    }
    return (detail.rows || []).filter(r => {
      const vFact = facturaKey ? r[facturaKey] : null
      const vPed = pedidoKey ? r[pedidoKey] : null
      return matches(vFact) || matches(vPed)
    })
  }, [detail.rows, qFactura, facturaKey, pedidoKey])

  const saveDetail = async () => {
    try {
      const body = {
        rows: detail.rows,
        fecha: detail.item?.fecha || null,
        descripcion: detail.item?.descripcion || null,
        cliente: detail.item?.cliente || null,
      }
      const res = await fetch(`/api/planificaciones/${detail.item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json?.message || 'Error al guardar')
      setDetail(d => ({ ...d, edit: false }))
      load()
    } catch (e) { alert(e.message) }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Planificaciones</h2>
      <div className="filters">
        <select name="cliente" value={filters.cliente} onChange={e => setFilters(f => ({ ...f, cliente: e.target.value }))}>
          {clientes.map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}
        </select>
        <input type="date" name="fecha" value={filters.fecha} onChange={e => setFilters(f => ({ ...f, fecha: e.target.value }))} />
        <button className="menu-button" style={{ width: 'auto' }} onClick={load} disabled={loading}>
          {loading ? 'Buscando…' : '🔍 Buscar'}
        </button>
      </div>

      {error && <div style={{ color: '#9b1c1c', marginTop: 8 }}>{error}</div>}

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Descripción</th>
              <th>Ítems</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={p.id}>
                <td>{p.fecha || ''}</td>
                <td>{p.cliente_name || p.cliente || ''}</td>
                <td>{p.descripcion || ''}</td>
                <td>{p.items}</td>
                <td>{new Date(p.created_at).toLocaleString()}</td>
                <td>
                  <button className="menu-button" style={{ width: 'auto' }} onClick={() => openDetail(p.id)}>Ver</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={detail.open} onClose={() => setDetail({ open: false, item: null, rows: [], edit: false })} title={`Planificación #${detail.item?.id || ''}`}>
        {headers.length === 0 ? (
          <div>No hay filas</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {canEdit && !detail.edit && (
                <button className="menu-button" style={{ width: 'auto' }} onClick={() => setDetail(d => ({ ...d, edit: true }))}>Editar</button>
              )}
              {canEdit && detail.edit && (
                <>
                  <button className="menu-button" style={{ width: 'auto' }} onClick={saveDetail}>Guardar cambios</button>
                  <button className="menu-button" style={{ width: 'auto' }} onClick={() => setDetail(d => ({ ...d, edit: false }))}>Cancelar</button>
                </>
              )}
              <button className="menu-button" style={{ width: 'auto' }} onClick={exportDetail}>Exportar CSV</button>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#555' }}>Buscar N° factura / pedido</span>
                <input
                  placeholder="Ej: 148472"
                  value={qFactura}
                  onChange={e => setQFactura(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d0d0d0' }}
                />
              </div>
            </div>
            {/* Meta editable */}
            {detail.edit && (
              <div className="factura-form" style={{ marginBottom: 12 }}>
                <div className="grid-2">
                  <label>
                    <span>Fecha</span>
                    <input type="date" value={detail.item?.fecha || ''} onChange={e => setDetail(d => ({ ...d, item: { ...d.item, fecha: e.target.value } }))} />
                  </label>
                  <label>
                    <span>Cliente</span>
                    <select value={detail.item?.cliente || ''} onChange={e => setDetail(d => ({ ...d, item: { ...d.item, cliente: e.target.value } }))}>
                      {clientes.slice(1).map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}
                    </select>
                  </label>
                  <label className="full">
                    <span>Descripción</span>
                    <input value={detail.item?.descripcion || ''} onChange={e => setDetail(d => ({ ...d, item: { ...d.item, descripcion: e.target.value } }))} />
                  </label>
                </div>
              </div>
            )}
            {/* Scrollbar superior sincronizado para tablas anchas */}
            <TopScroller rows={filteredRows} headers={headers} />
            <div className="table-wrapper" id="planif-detail-table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    {headers.map(h => (<th key={h}>{h}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r, i) => (
                    <tr key={i}>
                      {headers.map(h => (
                        <td key={h}>
                          {detail.edit ? (
                            <input value={r[h] ?? ''} onChange={e => setDetail(d => ({ ...d, rows: d.rows.map((row, idx) => idx === i ? { ...row, [h]: e.target.value } : row) }))} />
                          ) : (
                            <span>{r[h] ?? ''}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

export default PlanificacionesList

// Barra de scroll horizontal superior sincronizada con la tabla inferior
function TopScroller({ rows, headers }) {
  const topRef = useRef(null)
  const wrapRef = useRef(null)
  useEffect(() => {
    wrapRef.current = document.getElementById('planif-detail-table-wrapper')
    const t = topRef.current
    const w = wrapRef.current
    if (!t || !w) return
    const onTop = () => { if (w) w.scrollLeft = t.scrollLeft }
    const onWrap = () => { if (t) t.scrollLeft = w.scrollLeft }
    t.addEventListener('scroll', onTop)
    w.addEventListener('scroll', onWrap)
    const resize = () => { if (t && w) t.firstChild.style.width = w.scrollWidth + 'px' }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(w)
    return () => { t.removeEventListener('scroll', onTop); w.removeEventListener('scroll', onWrap); ro.disconnect() }
  }, [rows, headers])
  return (
    <div
      ref={topRef}
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        height: 16,
        marginBottom: 6,
        position: 'sticky', // se mantiene visible al hacer scroll vertical
        top: 0,
        zIndex: 5,
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
      }}
    >
      <div style={{ height: 1 }} />
    </div>
  )
}
