import { useEffect, useState } from 'react'

function MntCamiones({ getAuthHeaders }) {
  const [form, setForm] = useState({
    patente: '', modelo: '', ano: '', marca: '', kilometraje: '', fecha_entrada: '', fecha_salida: ''
  })
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [items, setItems] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [editing, setEditing] = useState(null)
  const [mode, setMode] = useState('listar') // 'listar' | 'agregar'

  const load = async () => {
    try {
      setLoadingList(true)
      const res = await fetch('/api/camiones', { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error al listar camiones')
      setItems(json.data || [])
    } catch (e) { setResult(e.message) } finally { setLoadingList(false) }
  }

  useEffect(() => { load() }, [])

  const onChange = (e) => {
    const { name, value } = e.target
    // Sanitizar según reglas
    if (name === 'patente') return setForm(f => ({ ...f, patente: value.toUpperCase().slice(0,6) }))
    if (name === 'modelo') return setForm(f => ({ ...f, modelo: value.replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ\s-]/g,'') }))
    if (name === 'ano') return setForm(f => ({ ...f, ano: value.replace(/\D/g,'').slice(0,4) }))
    if (name === 'marca') return setForm(f => ({ ...f, marca: value.replace(/\D/g,'') }))
    if (name === 'kilometraje') return setForm(f => ({ ...f, kilometraje: value.replace(/\D/g,'') }))
    setForm(f => ({ ...f, [name]: value }))
  }

  const onFiles = (e) => {
    const files = Array.from(e.target.files || [])
    setDocs(files.slice(0,5))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    try {
      setLoading(true); setResult('')
      const fd = new FormData()
      Object.entries(form).forEach(([k,v]) => fd.append(k, v))
      docs.forEach(f => fd.append('documentos', f))
      const res = await fetch('/api/camiones', { method: 'POST', headers: { ...(getAuthHeaders?.() || {}) }, body: fd })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error')
      setResult('Camión creado correctamente')
      setForm({ patente: '', modelo: '', ano: '', marca: '', kilometraje: '', fecha_entrada: '', fecha_salida: '' })
      setDocs([])
      load()
    } catch (e2) {
      setResult(e2.message)
    } finally { setLoading(false) }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Mantenimiento — Camiones</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="menu-button" style={{ width: 'auto', background: mode==='listar' ? '#eef2ff' : undefined }} onClick={() => { setMode('listar'); load() }}>
          📋 Listar camiones
        </button>
        <button className="menu-button" style={{ width: 'auto', background: mode==='agregar' ? '#eef2ff' : undefined }} onClick={() => setMode('agregar')}>
          ➕ Agregar camión
        </button>
      </div>
      {result && (
        <div style={{
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 8,
          background: result.includes('correct') ? '#e8f7ec' : '#fdeaea',
          color: result.includes('correct') ? '#1e6f3d' : '#9b1c1c',
          border: `1px solid ${result.includes('correct') ? '#bfe5c9' : '#f4c7c7'}`,
        }}>{result}</div>
      )}
      {mode === 'agregar' && (
      <form onSubmit={onSubmit} className="factura-form">
        <div className="grid-2">
          <label>
            <span>Patente</span>
            <input name="patente" value={form.patente} onChange={onChange} maxLength={6} required />
          </label>
          <label>
            <span>Modelo</span>
            <input name="modelo" value={form.modelo} onChange={onChange} />
          </label>
          <label>
            <span>Año </span>
            <input name="ano" value={form.ano} onChange={onChange} inputMode="numeric" maxLength={4} />
          </label>
          <label>
            <span>Marca </span>
            <input name="marca" value={form.marca} onChange={onChange} />
          </label>
          <label>
            <span>Kilometraje</span>
            <input name="kilometraje" value={form.kilometraje} onChange={onChange} inputMode="numeric" />
          </label>
          <label>
            <span>Fecha entrada</span>
            <input type="date" name="fecha_entrada" value={form.fecha_entrada} onChange={onChange} required />
          </label>
          <label>
            <span>Fecha salida</span>
            <input type="date" name="fecha_salida" value={form.fecha_salida} onChange={onChange} />
          </label>
          <label className="full">
            <span>Documentos (máx. 5) — pdf/jpg/png</span>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple onChange={onFiles} />
            <div style={{ fontSize: 12, color: '#666' }}>{docs.length} seleccionado(s)</div>
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="submit" className="menu-button" style={{ width: 'auto' }} disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar camión'}
          </button>
        </div>
      </form>
      )}
      {mode === 'listar' && (
      <div style={{ marginTop: 16 }}>
        {loadingList && <div style={{ color: '#666', marginBottom: 8 }}>Cargando camiones…</div>}
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Patente</th>
                <th className="col-hide-sm">Modelo</th>
                <th className="col-hide-sm">Año</th>
                <th className="col-hide-sm">Marca</th>
                <th className="col-hide-sm">Km</th>
                <th>Entrada</th>
                <th className="col-hide-sm">Salida</th>
                <th className="col-hide-sm">Docs</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id}>
                  <td>{c.patente}</td>
                  <td className="col-hide-sm">{c.modelo || ''}</td>
                  <td className="col-hide-sm">{c.ano || ''}</td>
                  <td className="col-hide-sm">{c.marca || ''}</td>
                  <td className="col-hide-sm">{c.kilometraje != null ? c.kilometraje : ''}</td>
                  <td>{c.fecha_entrada || ''}</td>
                  <td className="col-hide-sm">{c.fecha_salida || ''}</td>
                  <td className="col-hide-sm">{(c.documentos || []).length}</td>
                  <td className="col-acciones">
                    <button className="menu-button" style={{ width: 'auto', marginRight: 6 }} onClick={() => setEditing(c)}>Editar</button>
                    <button
                      className="menu-button"
                      style={{ width: 'auto', borderColor: '#fca5a5', background: '#fee2e2' }}
                      onClick={async () => {
                        if (!confirm('¿Eliminar este camión? Esta acción no se puede deshacer.')) return
                        const reason = prompt('Motivo para eliminar el camión:')
                        if (!reason) return
                        if (!confirm(`Confirmar eliminación. Motivo: "${reason}"`)) return
                        try {
                          const res = await fetch(`/api/camiones/${c.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) }, body: JSON.stringify({ reason }) })
                          const json = await res.json().catch(() => ({}))
                          if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error al eliminar')
                          load()
                        } catch (e) { alert(e.message) }
                      }}
                    >Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
      {editing && (
        <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar camión ${editing?.patente || ''}`}>
          <EditCamionForm item={editing} onClose={() => setEditing(null)} onSaved={load} getAuthHeaders={getAuthHeaders} />
        </Modal>
      )}
    </div>
  )
}

export default MntCamiones

function Modal({ open, onClose, children, title }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="menu-button" style={{ width: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function EditCamionForm({ item, onClose, onSaved, getAuthHeaders }) {
  const [form, setForm] = useState({
    patente: item.patente || '',
    modelo: item.modelo || '',
    ano: item.ano != null ? String(item.ano) : '',
    marca: item.marca || '',
    kilometraje: item.kilometraje != null ? String(item.kilometraje) : '',
    fecha_entrada: item.fecha_entrada || '',
    fecha_salida: item.fecha_salida || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const onChange = (e) => {
    const { name, value } = e.target
    if (name === 'patente') return setForm(f => ({ ...f, patente: value.toUpperCase().slice(0,6) }))
    if (name === 'modelo') return setForm(f => ({ ...f, modelo: value.replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ\s-]/g,'') }))
    if (name === 'ano') return setForm(f => ({ ...f, ano: value.replace(/\D/g,'').slice(0,4) }))
    if (name === 'marca') return setForm(f => ({ ...f, marca: value.replace(/\D/g,'') }))
    if (name === 'kilometraje') return setForm(f => ({ ...f, kilometraje: value.replace(/\D/g,'') }))
    setForm(f => ({ ...f, [name]: value }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    try {
      setSaving(true); setError('')
      const res = await fetch(`/api/camiones/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) },
        body: JSON.stringify(form)
      })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error')
      onSaved?.(); onClose?.()
    } catch (e2) { setError(e2.message) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={onSubmit} className="factura-form">
      {error && <div style={{ color: '#9b1c1c', marginBottom: 8 }}>{error}</div>}
      <div className="grid-2">
        <label>
          <span>Patente</span>
          <input name="patente" value={form.patente} onChange={onChange} maxLength={6} required />
        </label>
        <label>
          <span>Modelo </span>
          <input name="modelo" value={form.modelo} onChange={onChange} />
        </label>
        <label>
          <span>Año </span>
          <input name="ano" value={form.ano} onChange={onChange} inputMode="numeric" maxLength={4} />
        </label>
        <label>
          <span>Marca</span>
          <input name="marca" value={form.marca} onChange={onChange} />
        </label>
        <label>
          <span>Kilometraje</span>
          <input name="kilometraje" value={form.kilometraje} onChange={onChange} inputMode="numeric" />
        </label>
        <label>
          <span>Fecha entrada</span>
          <input type="date" name="fecha_entrada" value={form.fecha_entrada} onChange={onChange} required />
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
