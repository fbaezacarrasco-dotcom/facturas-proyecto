import { useEffect, useState } from 'react'

function Admin({ getAuthHeaders }) {
  const [users, setUsers] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const [uRes, cRes] = await Promise.all([
        fetch('/admin/users', { headers: { ...getAuthHeaders?.() } }),
        fetch('/admin/clients', { headers: { ...getAuthHeaders?.() } }),
      ])
      const uJson = await uRes.json()
      const cJson = await cRes.json()
      if (!uRes.ok || !uJson.ok) throw new Error(uJson?.message || 'Error users')
      if (!cRes.ok || !cJson.ok) throw new Error(cJson?.message || 'Error clients')
      setUsers(uJson.data || [])
      setClients(cJson.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Create user form
  const [nuEmail, setNuEmail] = useState('')
  const [nuPass, setNuPass] = useState('')
  const [nuRole, setNuRole] = useState('viewer')

  const createUser = async () => {
    try {
      const res = await fetch('/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders?.() },
        body: JSON.stringify({ email: nuEmail, password: nuPass, role: nuRole })
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json?.message || 'Error creando usuario')
      setNuEmail(''); setNuPass(''); setNuRole('viewer')
      load()
    } catch (e) { alert(e.message) }
  }

  const changeUser = async (id, payload) => {
    const res = await fetch(`/admin/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeaders?.() }, body: JSON.stringify(payload) })
    const json = await res.json()
    if (!res.ok || !json.ok) throw new Error(json?.message || 'Error actualizando usuario')
  }

  const changePassword = async (id) => {
    const np = prompt('Nueva contraseña para el usuario:')
    if (!np) return
    const res = await fetch(`/admin/users/${id}/password`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeaders?.() }, body: JSON.stringify({ password: np }) })
    const json = await res.json()
    if (!res.ok || !json.ok) throw new Error(json?.message || 'Error cambiando contraseña')
    alert('Contraseña actualizada')
  }

  // Clients
  const [ncName, setNcName] = useState('')
  const createClient = async () => {
    const res = await fetch('/admin/clients', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders?.() }, body: JSON.stringify({ name: ncName }) })
    const json = await res.json()
    if (!res.ok || !json.ok) return alert(json?.message || 'Error creando cliente')
    setNcName('')
    load()
  }

  const updateClient = async (id, payload) => {
    const res = await fetch(`/admin/clients/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeaders?.() }, body: JSON.stringify(payload) })
    const json = await res.json()
    if (!res.ok || !json.ok) return alert(json?.message || 'Error actualizando cliente')
    load()
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Panel de administración</h2>
      {error && <div style={{ color: '#9b1c1c', marginBottom: 8 }}>{error}</div>}

      <section style={{ marginBottom: 24 }}>
        <h3>Usuarios</h3>
        <div className="factura-form" style={{ marginBottom: 12 }}>
          <div className="grid-2">
            <label>
              <span>Email</span>
              <input value={nuEmail} onChange={e => setNuEmail(e.target.value)} placeholder="correo@ejemplo.com" />
            </label>
            <label>
              <span>Contraseña</span>
              <input type="password" value={nuPass} onChange={e => setNuPass(e.target.value)} />
            </label>
            <label>
              <span>Rol</span>
              <select value={nuRole} onChange={e => setNuRole(e.target.value)}>
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="menu-button" style={{ width: 'auto' }} onClick={createUser}>Crear usuario</button>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Rol</th>
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <select defaultValue={u.role} onChange={async e => { try { await changeUser(u.id, { role: e.target.value }); load() } catch (err) { alert(err.message) } }}>
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" defaultChecked={u.active} onChange={async e => { try { await changeUser(u.id, { active: e.target.checked }); load() } catch (err) { alert(err.message) } }} />
                  </td>
                  <td>
                    <button className="menu-button" style={{ width: 'auto' }} onClick={() => changePassword(u.id)}>Cambiar contraseña</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3>Clientes</h3>
        <div className="factura-form" style={{ marginBottom: 12 }}>
          <div className="grid-2">
            <label>
              <span>Nombre</span>
              <input value={ncName} onChange={e => setNcName(e.target.value)} placeholder="Nuevo cliente" />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="menu-button" style={{ width: 'auto' }} onClick={createClient}>Crear cliente</button>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id}>
                  <td>
                    <input defaultValue={c.name} onBlur={async e => { const v = e.target.value.trim(); if (v && v !== c.name) { await updateClient(c.id, { name: v }) } }} />
                  </td>
                  <td>
                    <input type="checkbox" defaultChecked={c.active} onChange={async e => { await updateClient(c.id, { active: e.target.checked }) }} />
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: '#666' }}>Editar nombre (blur) o activar/desactivar</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default Admin
