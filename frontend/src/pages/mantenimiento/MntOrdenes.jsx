import { useEffect, useMemo, useState } from 'react'

function MntOrdenes({ getAuthHeaders, onGoHome }) {
  const [mode, setMode] = useState('agregar')
  const [camiones, setCamiones] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [form, setForm] = useState({ patente: '', proveedor_id: '', fecha: '', tipo: '', prioridad: '', responsable: '', descripcion: '', estado: 'abierta', costo_estimado: '', costo_real: '' })
  const [files, setFiles] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const loadRefs = async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        fetch('/api/camiones', { headers: { ...(getAuthHeaders?.() || {}) } }),
        fetch('/api/proveedores', { headers: { ...(getAuthHeaders?.() || {}) } })
      ])
      const [c, p] = await Promise.all([cRes.json(), pRes.json()])
      if (cRes.ok && c?.ok) setCamiones(c.data || [])
      if (pRes.ok && p?.ok) setProveedores(p.data || [])
    } catch {}
  }
  const loadList = async () => {
    try {
      const res = await fetch('/api/ordenes', { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (res.ok && json?.ok) setItems(json.data || [])
    } catch {}
  }
  useEffect(() => { loadRefs(); loadList() }, [])

  const patentes = useMemo(() => (camiones || []).map(c => c.patente), [camiones])
  const onChange = (e) => {
    const { name, value } = e.target
    if (name === 'costo_estimado' || name === 'costo_real') return setForm(f => ({ ...f, [name]: value.replace(/[^\d.]/g,'') }))
    setForm(f => ({ ...f, [name]: value }))
  }
  const onFiles = (e) => setFiles(Array.from(e.target.files || []).slice(0,5))

  const onSubmit = async (e) => {
    e.preventDefault()
    try {
      setLoading(true); setMsg('')
      const fd = new FormData()
      Object.entries(form).forEach(([k,v]) => fd.append(k, v))
      files.forEach(f => fd.append('adjuntos', f))
      const res = await fetch('/api/ordenes', { method: 'POST', headers: { ...(getAuthHeaders?.() || {}) }, body: fd })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error')
      setMsg('Orden creada correctamente')
      setForm({ patente: '', proveedor_id: '', fecha: '', tipo: '', prioridad: '', responsable: '', descripcion: '', estado: 'abierta', costo_estimado: '', costo_real: '' })
      setFiles([])
      loadList()
    } catch (e2) { setMsg(e2.message) } finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
        <button className="menu-button" style={{ width: 'auto' }} onClick={() => onGoHome?.()}>
          📊 Ver gráficos (inicio)
        </button>
      </div>
      <h2 style={{ marginTop: 0 }}>Mantenimiento — Órdenes</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="menu-button" style={{ width: 'auto', background: mode==='agregar' ? '#eef2ff' : undefined }} onClick={() => setMode('agregar')}>➕ Nueva orden</button>
        <button className="menu-button" style={{ width: 'auto', background: mode==='listar' ? '#eef2ff' : undefined }} onClick={() => { setMode('listar'); loadList() }}>📋 Listar</button>
      </div>
      {msg && <div style={{ marginBottom: 12, color: msg.includes('correct') ? '#166534' : '#9b1c1c' }}>{msg}</div>}
      {mode === 'agregar' ? (
        <form onSubmit={onSubmit} className="factura-form">
          <div className="grid-2">
            <label><span>Patente</span>
              <select name="patente" value={form.patente} onChange={onChange} required>
                <option value="">Seleccionar</option>
                {patentes.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label><span>Proveedor</span>
              <select name="proveedor_id" value={form.proveedor_id} onChange={onChange}>
                <option value="">—</option>
                {(proveedores || []).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
            <label><span>Fecha</span><input type="date" name="fecha" value={form.fecha} onChange={onChange} required /></label>
            <label><span>Tipo</span><input name="tipo" value={form.tipo} onChange={onChange} placeholder="mecánica, eléctrica…" /></label>
            <label><span>Prioridad</span>
              <select name="prioridad" value={form.prioridad} onChange={onChange}>
                <option value="">—</option>
                <option value="baja">baja</option>
                <option value="media">media</option>
                <option value="alta">alta</option>
              </select>
            </label>
            <label><span>Responsable</span><input name="responsable" value={form.responsable} onChange={onChange} /></label>
            <label className="full"><span>Descripción</span><textarea name="descripcion" value={form.descripcion} onChange={onChange} rows={3} /></label>
            <label><span>Estado</span>
              <select name="estado" value={form.estado} onChange={onChange}>
                <option value="abierta">abierta</option>
                <option value="en_curso">en curso</option>
                <option value="cerrada">cerrada</option>
              </select>
            </label>
            <label><span>Costo estimado</span><input name="costo_estimado" value={form.costo_estimado} onChange={onChange} inputMode="decimal" /></label>
            <label><span>Costo real</span><input name="costo_real" value={form.costo_real} onChange={onChange} inputMode="decimal" /></label>
            <label className="full"><span>Adjuntos</span><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={onFiles} /></label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="menu-button" style={{ width: 'auto' }} disabled={loading}>{loading ? 'Guardando…' : 'Guardar orden'}</button>
          </div>
        </form>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th><th>Patente</th><th>Proveedor</th><th>Tipo</th><th>Prioridad</th><th>Estado</th><th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {items.map(o => (
                <tr key={o.id}>
                  <td>{o.fecha}</td>
                  <td>{o.patente || ''}</td>
                  <td>{o.proveedor_nombre || ''}</td>
                  <td>{o.tipo || ''}</td>
                  <td>{o.prioridad || ''}</td>
                  <td>{o.estado || ''}</td>
                  <td>{o.responsable || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default MntOrdenes
