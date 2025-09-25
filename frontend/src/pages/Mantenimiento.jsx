// Página de mantenimiento (placeholder): muestra algunos datos de healthcheck y utilidades rápidas.
import { useEffect, useState } from 'react'

function Mantenimiento({ getAuthHeaders, onGoHome }) {
  const [info, setInfo] = useState({ uptime: '', version: '', db: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true); setError('')
        // Si el backend expone /api/health ya lo usamos; añadimos un fetch simple
        const res = await fetch('/api/health', { headers: { ...(getAuthHeaders?.() || {}) } })
        const json = await res.json().catch(() => ({}))
        setInfo({ uptime: json?.uptime || '', version: json?.version || '', db: json?.db || '' })
      } catch (e) { setError(e.message) } finally { setLoading(false) }
    }
    load()
  }, [])

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Mantenimiento</h2>
      <p style={{ color: '#666', marginTop: 0 }}>Herramientas y estado del sistema.</p>

      {error && <div style={{ color: '#9b1c1c', marginBottom: 8 }}>{error}</div>}

      <div className="factura-form" style={{ marginBottom: 16 }}>
        <div className="grid-2">
          <label>
            <span>Versión</span>
            <input value={info.version || '—'} readOnly />
          </label>
          <label>
            <span>Uptime</span>
            <input value={info.uptime || '—'} readOnly />
          </label>
          <label>
            <span>Base de datos</span>
            <input value={info.db || '—'} readOnly />
          </label>
          <label className="full">
            <span>Acciones rápidas</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="menu-button" style={{ width: 'auto' }} onClick={() => location.reload()}>🔄 Refrescar app</button>
              <a className="menu-button" style={{ width: 'auto' }} href="/" onClick={(e) => { e.preventDefault(); try { localStorage.removeItem('auth') } catch {}; location.reload() }}>🧹 Borrar sesión</a>
            </div>
          </label>
        </div>
      </div>

      <div className="content-placeholder" style={{ minHeight: 160 }}>
        {loading ? 'Cargando…' : 'Sección en construcción'}
      </div>
    </div>
  )
}

export default Mantenimiento
