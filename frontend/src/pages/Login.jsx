import { useState } from 'react'

function Login({ onLogin }) {
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (onLogin) onLogin({ usuario, contrasena })
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Iniciar sesión</h1>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>Usuario</span>
            <input
              type="text"
              name="usuario"
              placeholder="Ingresa tu usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
            />
          </label>
          <label>
            <span>Contraseña</span>
            <input
              type="password"
              name="contrasena"
              placeholder="Ingresa tu contraseña"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="login-button">Aceptar</button>
        </form>
      </div>
    </div>
  )
}

export default Login

