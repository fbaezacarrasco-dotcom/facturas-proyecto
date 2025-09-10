import { useEffect, useState } from 'react'
import './App.css'
import Login from './pages/Login.jsx'
import FacturaCrear from './pages/FacturaCrear.jsx'
import FacturasList from './pages/FacturasList.jsx'

function App() {
  const [apiStatus, setApiStatus] = useState('cargando...')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [view, setView] = useState('menu') // 'menu' | 'crear' | 'ver'

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setApiStatus(data?.message || 'OK'))
      .catch(() => setApiStatus('sin conexión'))
  }, [])

  const handleCrear = () => setView('crear')
  const handleVer = () => {
    console.log('Ver facturas')
    setView('ver')
  }
  const handleCerrarSesion = () => {
    console.log('Cerrar sesión')
    setIsAuthenticated(false)
    setView('menu')
  }

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h1>Menú</h1>
        <button className="menu-button" onClick={handleCrear}>🧾 Crear factura</button>
        <button className="menu-button" onClick={handleVer}>📄 Ver facturas</button>
        <button className="menu-button" onClick={handleCerrarSesion}>🚪 Cerrar sesión</button>
      </aside>
      <main className="content">
        <div style={{ marginBottom: 12, color: '#888', fontSize: 13 }}>Estado API: {apiStatus}</div>
        {view === 'crear' ? (
          <FacturaCrear onClose={() => setView('menu')} />
        ) : view === 'ver' ? (
          <FacturasList />
        ) : (
          <div className="content-placeholder">Espacio reservado para gráficos y paneles</div>
        )}
      </main>
    </div>
  )
}

export default App
