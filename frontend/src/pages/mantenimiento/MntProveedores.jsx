import { useEffect, useState } from 'react'

function MntProveedores({ getAuthHeaders, onGoHome }) {
  const [mode, setMode] = useState('agregar')
  const [form, setForm] = useState({ nombre: '', rut: '', contacto: '', fono: '', email: '', direccion: '', rubro: '' })
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    try {
      const res = await fetch('/api/proveedores', { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (res.ok && json?.ok) setItems(json.data || [])
    } catch {}
  }
  useEffect(() => { load() }, [])

  const onChange = (e) => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    try {
      setLoading(true); setMsg('')
      const res = await fetch('/api/proveedores', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) }, body: JSON.stringify(form) })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error')
      setMsg('Proveedor creado correctamente')
      setForm({ nombre: '', rut: '', contacto: '', fono: '', email: '', direccion: '', rubro: '' })
      load()
    } catch (e2) { setMsg(e2.message) } finally { setLoading(false) }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Mantenimiento — Proveedores</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="menu-button" style={{ width: 'auto', background: mode==='agregar' ? '#eef2ff' : undefined }} onClick={() => setMode('agregar')}>➕ Agregar proveedor</button>
        <button className="menu-button" style={{ width: 'auto', background: mode==='listar' ? '#eef2ff' : undefined }} onClick={() => { setMode('listar'); load() }}>📋 Listar</button>
      </div>
      {msg && <div style={{ marginBottom: 12, color: msg.includes('correct') ? '#166534' : '#9b1c1c' }}>{msg}</div>}
      {mode === 'agregar' ? (
        <form onSubmit={onSubmit} className="factura-form">
          <div className="grid-2">
            <label><span>Nombre</span><input name="nombre" value={form.nombre} onChange={onChange} required /></label>
            <label><span>RUT</span><input name="rut" value={form.rut} onChange={onChange} /></label>
            <label><span>Contacto</span><input name="contacto" value={form.contacto} onChange={onChange} /></label>
            <label><span>Fono</span><input name="fono" value={form.fono} onChange={onChange} /></label>
            <label><span>Email</span><input type="email" name="email" value={form.email} onChange={onChange} /></label>
            <label className="full"><span>Dirección</span><input name="direccion" value={form.direccion} onChange={onChange} /></label>
            <label className="full"><span>Rubro</span><input name="rubro" value={form.rubro} onChange={onChange} /></label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="menu-button" style={{ width: 'auto' }} disabled={loading}>{loading ? 'Guardando...' : 'Guardar proveedor'}</button>
          </div>
        </form>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th><th>RUT</th><th>Contacto</th><th>Fono</th><th>Email</th><th>Rubro</th>
              </tr>
            </thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.rut || ''}</td>
                  <td>{p.contacto || ''}</td>
                  <td>{p.fono || ''}</td>
                  <td>{p.email || ''}</td>
                  <td>{p.rubro || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default MntProveedores
