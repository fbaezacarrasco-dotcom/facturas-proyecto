import { useEffect, useState } from 'react'

// Página simple para ver status de rutas (últimas 24h) y generar un set por defecto
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

function RutasStatus({ getAuthHeaders, canEdit }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetch('/api/rutas/status', { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error al cargar')
      setData(json.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Construye el texto consolidado, ordenado por número de ruta (R1..R10..)
  const buildStatusText = () => {
    const items = [...data]
    const num = (s) => {
      const n = parseInt(String(s || '').replace(/\D/g, ''), 10)
      return Number.isFinite(n) ? n : 0
    }
    items.sort((a, b) => num(a.route_code) - num(b.route_code) || String(a.route_code).localeCompare(String(b.route_code)))
    return items.map(r => `${r.route_code} ${r.status_text}`).join('\n')
  }

  const copyAll = async () => {
    try {
      const text = buildStatusText()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      alert('No se pudo copiar. ' + e.message)
    }
  }

  const sendAll = async () => {
    const text = buildStatusText()
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Status rutas', text })
        return
      }
    } catch {}
    // Fallback: abrir correo con el cuerpo prellenado
    const url = `mailto:?subject=${encodeURIComponent('Status rutas')}&body=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Status de rutas (24h)</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button className="menu-button" style={{ width: 'auto' }} onClick={load} disabled={loading}>
          {loading ? 'Cargando...' : '🔄 Refrescar'}
        </button>
        <button className="menu-button" style={{ width: 'auto' }} onClick={copyAll} title="Copia todo el status al portapapeles">
          📋 Copiar status
        </button>
        <button className="menu-button" style={{ width: 'auto' }} onClick={sendAll} title="Abrir compartir / correo con el texto">
          ✉️ Enviar status
        </button>
        {canEdit && (
          <button className="menu-button" style={{ width: 'auto' }} onClick={() => setCreating(true)}>
            ➕ Crear status
          </button>
        )}
      </div>
      {copied && <div style={{ color: '#166534', marginBottom: 8 }}>Copiado al portapapeles</div>}
      {error && <div style={{ color: '#9b1c1c', marginBottom: 8 }}>{error}</div>}

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Ruta</th>
              <th>Status</th>
              <th>Creado</th>
              {canEdit && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td>{r.route_code}</td>
                <td>{r.status_text}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                {canEdit && (
                  <td>
                    <button className="menu-button" style={{ width: 'auto', marginRight: 6 }} onClick={() => setEditing(r)}>Editar</button>
                    <button className="menu-button" style={{ width: 'auto' }} onClick={async () => {
                      if (!confirm('¿Eliminar este status?')) return
                      try {
                        const res = await fetch(`/api/rutas/status/${r.id}`, { method: 'DELETE', headers: { ...(getAuthHeaders?.() || {}) } })
                        const json = await res.json().catch(() => ({}))
                        if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error al eliminar')
                        load()
                      } catch (e) { alert(e.message) }
                    }}>Eliminar</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar ${editing?.route_code || ''}`}>
        {editing && (
          <EditForm item={editing} onClose={() => setEditing(null)} onSaved={load} getAuthHeaders={getAuthHeaders} />
        )}
      </Modal>

      <Modal open={creating} onClose={() => setCreating(false)} title="Crear status">
        {creating && (
          <CreateForm onClose={() => setCreating(false)} onSaved={load} getAuthHeaders={getAuthHeaders} />
        )}
      </Modal>
    </div>
  )
}

export default RutasStatus

function EditForm({ item, onClose, onSaved, getAuthHeaders }) {
  const [form, setForm] = useState({
    route_code: item.route_code,
    status_text: item.status_text,
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
      const res = await fetch(`/api/rutas/status/${item.id}`, {
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
          <span>Ruta (código)</span>
          <input name="route_code" value={form.route_code} onChange={onChange} />
        </label>
        <label className="full">
          <span>Status</span>
          <input name="status_text" value={form.status_text} onChange={onChange} />
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

function CreateForm({ onClose, onSaved, getAuthHeaders }) {
  const [form, setForm] = useState({ route_code: '', status_text: '' })
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
      const res = await fetch('/api/rutas/status', {
        method: 'POST',
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
          <span>Ruta (código)</span>
          <input name="route_code" value={form.route_code} onChange={onChange} required />
        </label>
        <label className="full">
          <span>Status</span>
          <input name="status_text" value={form.status_text} onChange={onChange} required />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="menu-button" style={{ width: 'auto' }} disabled={saving}>
          {saving ? 'Creando...' : 'Crear'}
        </button>
      </div>
    </form>
  )
}
