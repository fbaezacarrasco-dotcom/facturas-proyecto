import { useEffect, useState } from 'react'
import './App.css'
import Login from './pages/Login.jsx'
import FacturaCrear from './pages/FacturaCrear.jsx'
import FacturasList from './pages/FacturasList.jsx'
import ResguardoCrear from './pages/ResguardoCrear.jsx'
import RendicionCrear from './pages/RendicionCrear.jsx'
import RendicionesList from './pages/RendicionesList.jsx'
import InventarioList from './pages/InventarioList.jsx'
import Admin from './pages/Admin.jsx'
import Mantenimiento from './pages/Mantenimiento.jsx'
import MntCamiones from './pages/mantenimiento/MntCamiones.jsx'
import MntMantencion from './pages/mantenimiento/MntMantencion.jsx'
import MntOrdenes from './pages/mantenimiento/MntOrdenes.jsx'
import MntProveedores from './pages/mantenimiento/MntProveedores.jsx'
import MntReportes from './pages/mantenimiento/MntReportes.jsx'
import RutasStatus from './pages/RutasStatus.jsx'
// (planificación eliminada)
// # Componente raíz del frontend
// # Gestiona autenticación mock (isAuthenticated), estado de API y navegación simple por vistas.

function App() {
  const [apiStatus, setApiStatus] = useState('cargando...')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null) // nombre de usuario (email)
  const [role, setRole] = useState(null) // 'admin' | 'viewer'
  const [token, setToken] = useState(null)
  const [view, setView] = useState('menu') // 'menu' | 'crear' | 'ver' | 'resguardo' | 'inventario' | 'rendicion_crear' | 'rendiciones' | 'planificacion_crear' | 'planificaciones' | 'rutas' | 'admin' | 'mantenimiento' | 'mnt_camiones' | 'mnt_mantencion' | 'mnt_ordenes' | 'mnt_proveedores' | 'mnt_reportes'
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return typeof window !== 'undefined' ? window.innerWidth > 900 : false } catch { return false }
  })

  useEffect(() => {
    // # Consulta de healthcheck para mostrar estado de la API en la UI
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setApiStatus(data?.message || 'OK'))
      .catch(() => setApiStatus('sin conexión'))
  }, [])

  useEffect(() => {
    // Restaurar sesión desde localStorage para no perder login al recargar
    try {
      const saved = localStorage.getItem('auth')
      if (saved) {
        const a = JSON.parse(saved)
        if (a?.token && a?.role) {
          setToken(a.token)
          setRole(a.role)
          setUser(a.user || a.usuario || null)
          setIsAuthenticated(true)
        }
      }
    } catch {}
  }, [])

  // Mantener abierto al pasar a pantallas grandes
  useEffect(() => {
    const onResize = () => { try { if (window.innerWidth > 900) setSidebarOpen(true) } catch {} }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handleCrear = () => { setView('crear'); setSidebarOpen(false) }
  const handleVer = () => {
    console.log('Ver facturas')
    setView('ver'); setSidebarOpen(false)
  }
  const handleResguardo = () => { setView('resguardo'); setSidebarOpen(false) }
  const handleInventario = () => { setView('inventario'); setSidebarOpen(false) }
  const handleRendicionCrear = () => { setView('rendicion_crear'); setSidebarOpen(false) }
  const handleRendiciones = () => { setView('rendiciones'); setSidebarOpen(false) }
  const handleAdmin = () => { setView('admin'); setSidebarOpen(false) }
  const handleRutas = () => { setView('rutas'); setSidebarOpen(false) }
  const handleMantenimiento = () => { setView('mantenimiento'); setSidebarOpen(false) }
  // (planificación eliminada)
  const handleCerrarSesion = () => {
    console.log('Cerrar sesión')
    setIsAuthenticated(false)
    setUser(null)
    setRole(null)
    setToken(null)
    // Limpiar persistencia
    try { localStorage.removeItem('auth') } catch {}
    setView('menu')
  }

  const getAuthHeaders = () => (token ? { Authorization: `Bearer ${token}` } : {})
  const [showCommercial, setShowCommercial] = useState(false)
  const [showMant, setShowMant] = useState(false)

  if (!isAuthenticated) {
    return (
      <Login
        onLogin={({ usuario, token, role }) => {
          // Guardar en estado y persistir para mantener sesión tras recarga
          setUser(usuario)
          setToken(token)
          setRole(role)
          setIsAuthenticated(true)
          try { localStorage.setItem('auth', JSON.stringify({ user: usuario, token, role })) } catch {}
        }}
      />
    )
  }

  // (popup de planificación eliminado)

  return (
    <div className={`app-layout ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <h1>Menú</h1>
        <button className="menu-button" onClick={() => setShowCommercial(s => !s)}>
          🧭 Área comercial {showCommercial ? '▲' : '▼'}
        </button>
        {showCommercial && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8 }}>
            {/* Facturas */}
            {role !== 'viewer' && (
              <button className="menu-button" onClick={handleCrear}>🧾 Ingresar facturas pendientes</button>
            )}
            <button className="menu-button" onClick={handleVer}>📄 Facturas pendientes</button>

            {/* Resguardos / Inventario */}
            {role !== 'viewer' && (
              <button className="menu-button" onClick={handleResguardo}>📦 Agregar resguardo</button>
            )}
            <button className="menu-button" onClick={handleInventario}>📋 Inventario</button>

            {/* Rendiciones */}
            {role !== 'viewer' && (
              <button className="menu-button" onClick={handleRendicionCrear}>🧮 Rendición</button>
            )}
            <button className="menu-button" onClick={handleRendiciones}>📑 Ver rendiciones</button>

            {/* (Planificación eliminada) */}

            {/* Otras */}
            <button className="menu-button" onClick={handleRutas}>🚦 Status rutas</button>
            {role === 'admin' && (<button className="menu-button" onClick={handleAdmin}>🛠️ Admin</button>)}
          </div>
        )}
        {/* Sección Mantenimiento (fuera de Área comercial) */}
        <button className="menu-button" onClick={() => setShowMant(s => !s)}>
          🧰 Mantenimiento {showMant ? '▲' : '▼'}
        </button>
        {showMant && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8 }}>
            <button className="menu-button" onClick={() => { setView('mnt_camiones'); setSidebarOpen(false) }}>🚚 Camiones</button>
            <button className="menu-button" onClick={() => { setView('mnt_mantencion'); setSidebarOpen(false) }}>🛠️ Mantención</button>
            <button className="menu-button" onClick={() => { setView('mnt_ordenes'); setSidebarOpen(false) }}>📋 Órdenes</button>
            <button className="menu-button" onClick={() => { setView('mnt_proveedores'); setSidebarOpen(false) }}>🏭 Proveedores</button>
            <button className="menu-button" onClick={() => { setView('mnt_reportes'); setSidebarOpen(false) }}>📈 Reportes</button>
          </div>
        )}
        {/* Cerrar sesión fuera de los grupos */}
        <button className="menu-button" onClick={handleCerrarSesion}>🚪 Cerrar sesión</button>
      </aside>
      {/* Backdrop para el drawer en móviles */}
      <div className={`backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />
      <main className="content">
        <button className="hamburger-btn" onClick={() => setSidebarOpen(s => !s)} aria-label="Abrir menú">
          ☰ Menú
        </button>
        <div style={{ marginBottom: 12, color: '#888', fontSize: 13 }}>Estado API: {apiStatus}</div>
        {view === 'crear' ? (
          role === 'viewer' ? (
            <div className="content-placeholder">No tienes permisos para crear facturas</div>
          ) : (
            <FacturaCrear onClose={() => setView('menu')} getAuthHeaders={getAuthHeaders} />
          )
        ) : view === 'resguardo' ? (
          role === 'viewer' ? (
            <div className="content-placeholder">No tienes permisos para agregar resguardos</div>
          ) : (
            <ResguardoCrear onClose={() => setView('menu')} getAuthHeaders={getAuthHeaders} />
          )
        ) : view === 'inventario' ? (
          <InventarioList getAuthHeaders={getAuthHeaders} canEdit={role !== 'viewer'} />
        ) : view === 'ver' ? (
          <FacturasList getAuthHeaders={getAuthHeaders} canEdit={role !== 'viewer'} />
        ) : view === 'rendicion_crear' ? (
          role === 'viewer' ? (
            <div className="content-placeholder">No tienes permisos para crear rendiciones</div>
          ) : (
            <RendicionCrear onClose={() => setView('menu')} getAuthHeaders={getAuthHeaders} />
          )
        ) : view === 'rendiciones' ? (
          <RendicionesList getAuthHeaders={getAuthHeaders} canEdit={role !== 'viewer'} />
        ) : view === 'rutas' ? (
          <RutasStatus getAuthHeaders={getAuthHeaders} canEdit={role !== 'viewer'} />
        ) : view === 'admin' ? (
          <Admin getAuthHeaders={getAuthHeaders} />
        ) : view === 'mantenimiento' ? (
          <Mantenimiento getAuthHeaders={getAuthHeaders} onGoHome={() => setView('menu')} />
        ) : view === 'mnt_camiones' ? (
          <MntCamiones getAuthHeaders={getAuthHeaders} onGoHome={() => setView('menu')} />
        ) : view === 'mnt_mantencion' ? (
          <MntMantencion getAuthHeaders={getAuthHeaders} onGoHome={() => setView('menu')} />
        ) : view === 'mnt_ordenes' ? (
          <MntOrdenes getAuthHeaders={getAuthHeaders} onGoHome={() => setView('menu')} />
        ) : view === 'mnt_proveedores' ? (
          <MntProveedores getAuthHeaders={getAuthHeaders} onGoHome={() => setView('menu')} />
        ) : view === 'mnt_reportes' ? (
          <MntReportes getAuthHeaders={getAuthHeaders} />
        ) : (
          <>
            <h2 style={{ marginTop: 0, marginBottom: 12 }}>Bienvenido, {user || 'usuario'}</h2>
            <Dashboard getAuthHeaders={getAuthHeaders} />
          </>
        )}
      </main>
    </div>
  )
}

export default App

// Dashboard simple con un gráfico circular (SVG) del % de facturas "entregadas"
// Lenguaje simple: muestra un "donut" con el porcentaje de facturas entregadas
//   (sobre el total) y te deja elegir el cliente desde una lista.
// Lenguaje técnico: componente con estado controlado que invoca
//   GET /api/facturas/stats?cliente=&fecha=&estado= para obtener { total, entregada } y
//   renderiza un donut SVG usando strokeDasharray (circunferencia = 2πr).
function Dashboard({ getAuthHeaders }) {
  const clientes = [
    { value: '', label: 'Todos' },
    { value: '1', label: 'Brival' },
    { value: '2', label: 'Nutrisco' },
    { value: '3', label: 'Carnicero' },
    { value: '4', label: 'Gourmet' },
  ]
  const [cliente, setCliente] = useState('')
  const [fecha, setFecha] = useState('')  // YYYY-MM-DD
  const [estado, setEstado] = useState('entregado_all') // 'entregado_all' o el valor exacto
  const [stats, setStats] = useState({ total: 0, entregada: 0 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Carga estadísticas del backend
  async function load() {
    try {
      setLoading(true); setError('')
      const p = new URLSearchParams()
      if (cliente) p.set('cliente', cliente)
      if (fecha) p.set('fecha', fecha)
      if (estado && estado !== 'entregado_all') p.set('estado', estado)
      const res = await fetch(`/api/facturas/stats?${p.toString()}`, { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error cargando estadísticas')
      setStats({ total: json.data.total || 0, entregada: json.data.entregada || 0 })
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  // cargar al montar y cuando cambia algún filtro
  useEffect(() => { load() }, [cliente, fecha, estado])

  // Matemática del donut (SVG):
  //   - r = radio; c = circunferencia = 2πr
  //   - strokeDasharray: "trazo_visible espacio_restante"
  //   - rotamos -90° para que empiece arriba (12 en punto)
  const percent = stats.total ? Math.round((stats.entregada / stats.total) * 100) : 0
  const r = 60
  const c = 2 * Math.PI * r
  const filled = (percent / 100) * c
  const remaining = c - filled

  return (
    <div className="dashboard-grid">
      <div className="factura-form">
        <div className="grid-2">
          <label>
            <span>Cliente</span>
            <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
              {clientes.map(c => (<option key={c.value} value={c.value}>{c.label || 'Todos'}</option>))}
            </select>
          </label>
          <label>
            <span>Día</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="full">
            <span>Condición</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="entregado_all">Entregadas (todas)</option>
              <option value="entregado sin novedad">entregado sin novedad</option>
              <option value="entregado con detalle">entregado con detalle</option>
              <option value="rechazado">rechazado</option>
              <option value="reprogramado">reprogramado</option>
            </select>
          </label>
        </div>
        {error && <div style={{ color: '#9b1c1c', marginTop: 8 }}>{error}</div>}
        <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>{loading ? 'Cargando…' : ' '}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ position: 'relative', width: 160, height: 160 }}>
          {/* SVG base: un anillo gris de fondo y un anillo verde proporcional al % */}
          <svg viewBox="0 0 160 160" width="160" height="160">
            <circle cx="80" cy="80" r="60" stroke="#e5e7eb" strokeWidth="18" fill="none" />
            <circle
              cx="80" cy="80" r="60" fill="none"
              stroke="#16a34a"
              strokeWidth="18"
              strokeDasharray={`${filled} ${remaining}`}
              strokeLinecap="round"
              transform="rotate(-90 80 80)"
            />
          </svg>
          {/* Etiquetas centradas: porcentaje grande y detalle x/y */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{percent}%</div>
            <div style={{ fontSize: 12, color: '#666' }}>{stats.entregada}/{stats.total} entregadas</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 16, marginBottom: 6 }}>Facturas — condición seleccionada</div>
          <div style={{ color: '#666' }}>
            Simple: puedes filtrar por cliente, día y condición (estado).<br/>
            Técnico: el backend filtra por cliente/fecha; si envías estado exacto,
            cuenta solo ese estado; si eliges “Entregadas (todas)”, suma estados con
            prefijo “entregado%”.
          </div>
        </div>
      </div>
    </div>
  )
}
