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

function Modal({ open, onClose, title, children, actions }) {
  if (!open) return null
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h3>{title}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {actions}
            <button className="menu-button" style={{ width: 'auto' }} onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export default function PlanificacionesList({ getAuthHeaders }) {
  const clientes = useClientes(getAuthHeaders)
  const clientMap = useMemo(() => Object.fromEntries((clientes || []).map(c => [String(c.value), c.label])), [clientes])
  const [filters, setFilters] = useState({ cliente: '', fecha: '' })
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState({ open: false, item: null, stats: null })

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v) })
    p.set('limit', '50')
    return p.toString()
  }, [filters])

  const load = async () => {
    try {
      setLoading(true); setError('')
      const res = await fetch(`/api/planificaciones?${queryString}`, { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Error al listar planificaciones')
      setData(json.data || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openDetail = async (it) => {
    try {
      const res = await fetch(`/api/planificaciones/${it.id}/stats`, { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      setDetail({ open: true, item: it, stats: res.ok && json?.ok ? json.data : null })
    } catch { setDetail({ open: true, item: it, stats: null }) }
  }

  const Donut = ({ ok = 0, total = 0 }) => {
    const p = total ? Math.round((ok / total) * 100) : 0
    const r = 60; const c = 2 * Math.PI * r
    const filled = (p / 100) * c; const remaining = c - filled
    return (
      <div style={{ position: 'relative', width: 160, height: 160 }}>
        <svg viewBox="0 0 160 160" width="160" height="160">
          <circle cx="80" cy="80" r="60" stroke="#e5e7eb" strokeWidth="18" fill="none" />
          <circle cx="80" cy="80" r="60" fill="none" stroke="#16a34a" strokeWidth="18" strokeDasharray={`${filled} ${remaining}`} strokeLinecap="round" transform="rotate(-90 80 80)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{p}%</div>
          <div style={{ fontSize: 12, color: '#666' }}>{ok}/{total} OK</div>
        </div>
      </div>
    )
  }

  const Bars = ({ map }) => {
    const entries = Object.entries(map || {})
    if (!entries.length) return <div style={{ color: '#666' }}>Sin datos</div>
    const max = Math.max(...entries.map(([, v]) => v)) || 1
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 140, fontSize: 12, color: '#444' }}>{k}</div>
            <div style={{ background: '#e5e7eb', height: 10, borderRadius: 999, width: '100%' }}>
              <div style={{ background: '#60a5fa', width: `${(v / max) * 100}%`, height: '100%', borderRadius: 999 }} />
            </div>
            <div style={{ width: 40, textAlign: 'right', fontSize: 12 }}>{v}</div>
          </div>
        ))}
      </div>
    )
  }

  const onChange = (e) => { const { name, value } = e.target; setFilters(f => ({ ...f, [name]: value })) }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Planificaciones</h2>
      <div className="filters sticky-filters">
        <select name="cliente" value={filters.cliente} onChange={onChange}>
          {clientes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input type="date" name="fecha" value={filters.fecha} onChange={onChange} />
        <button className="menu-button" style={{ width: 'auto' }} onClick={load} disabled={loading}>{loading ? 'Buscando…' : '🔍 Buscar'}</button>
      </div>

      {error && <div style={{ color: '#9b1c1c', marginTop: 8 }}>{error}</div>}

      <div className="table-wrapper">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Items</th><th>Versión</th><th>Acciones</th></tr></thead>
          <tbody>
            {data.map(it => (
              <tr key={it.id}>
                <td>{it.fecha || (it.created_at ? String(it.created_at).slice(0,10) : '')}</td>
                <td>{it.cliente_name || clientMap[String(it.cliente)] || ''}</td>
                <td>{it.items || 0}</td>
                <td>{it.version || 0}</td>
                <td>
                  <button className="menu-button btn-sm" style={{ width: 'auto', marginRight: 6 }} onClick={() => openDetail(it)}>Ver</button>
                  <a className="menu-button btn-sm" style={{ width: 'auto' }} href={`/api/planificaciones/${it.id}/export`} target="_blank" rel="noreferrer">Exportar CSV</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={detail.open} onClose={() => setDetail({ open: false, item: null, stats: null })} title={`Planificación #${detail.item?.id || ''}`} actions={detail.item ? (<a className="menu-button btn-sm" href={`/api/planificaciones/${detail.item.id}/export`} target="_blank" rel="noreferrer">⤓ Descargar CSV</a>) : null}>
        {!detail.stats ? (
          <div style={{ color: '#666' }}>Cargando estadísticas…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
            <div>
              <Donut ok={(detail.stats.by_estado || {})['entregado sin novedad'] || 0} total={detail.stats.total || 0} />
            </div>
            <div>
              <h4 style={{ margin: 0, marginBottom: 6 }}>Por estado</h4>
              <Bars map={detail.stats.by_estado} />
              <h4 style={{ margin: '12px 0 6px 0' }}>Por conductor</h4>
              <Bars map={detail.stats.by_conductor} />
              <h4 style={{ margin: '12px 0 6px 0' }}>Por pago</h4>
              <Bars map={detail.stats.by_pago} />
              <h4 style={{ margin: '12px 0 6px 0' }}>Por carga</h4>
              <Bars map={detail.stats.by_carga} />
              <h4 style={{ margin: '12px 0 6px 0' }}>Por ambiente</h4>
              <Bars map={detail.stats.by_ambiente} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
