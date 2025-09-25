// Login: autentica al usuario contra /auth/login y obtiene JWT.
// Incluye integración opcional con CAPTCHA (Turnstile, reCAPTCHA v2 o simple interno).
import { useEffect, useRef, useState } from 'react'

// Pantalla de Login con imágenes personalizables y comentarios guiados.
// - Llama a /auth/login para obtener JWT + rol desde el backend.
// - Muestra un logo (colócalo en /frontend/public/brand-logo.png) con fallback a /vite.svg.
// - Usa un fondo opcional /frontend/public/bg-login.jpg (definido en App.css).

function Login({ onLogin }) {
  // Estado controlado de los campos del formulario
  const [usuario, setUsuario] = useState('') // email del usuario
  const [contrasena, setContrasena] = useState('') // contraseña

  // Visual: logo con fallback si el archivo no existe
  const [logoSrc, setLogoSrc] = useState('/tts_login.png')

  // UX: alternar visibilidad de contraseña
  const [showPass, setShowPass] = useState(false)

  // Estado de error para mostrar mensajes provenientes del backend o de red
  const [error, setError] = useState('')

  // CAPTCHA (opcional): Turnstile, reCAPTCHA v2 (checkbox) o simple interno
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || import.meta.env.VITE_RECAPTCHA_SITE_KEY || ''
  const provider = (import.meta.env.VITE_CAPTCHA_PROVIDER || (import.meta.env.VITE_TURNSTILE_SITE_KEY ? 'turnstile' : (import.meta.env.VITE_RECAPTCHA_SITE_KEY ? 'recaptcha' : (import.meta.env.VITE_CAPTCHA_PROVIDER === 'simple' ? 'simple' : '')))).toLowerCase()
  const [captchaToken, setCaptchaToken] = useState('')
  const cfRef = useRef(null)
  const rcRef = useRef(null)
  const [simpleQuestion, setSimpleQuestion] = useState('')
  const [simpleAnswer, setSimpleAnswer] = useState('')

  useEffect(() => {
    if (!siteKey || !provider) return
    if (provider === 'turnstile') {
      const id = 'cf-turnstile-script'
      if (!document.getElementById(id)) {
        const s = document.createElement('script')
        s.id = id
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
        s.async = true
        document.head.appendChild(s)
      }
      const render = () => {
        if (window.turnstile && cfRef.current) {
          window.turnstile.render(cfRef.current, {
            sitekey: siteKey,
            callback: (t) => setCaptchaToken(t),
            'refresh-expired': 'auto',
          })
        } else {
          setTimeout(render, 200)
        }
      }
      render()
    } else if (provider === 'recaptcha') {
      const id = 'g-recaptcha-script'
      if (!document.getElementById(id)) {
        const s = document.createElement('script')
        s.id = id
        s.src = 'https://www.google.com/recaptcha/api.js?render=explicit'
        s.async = true
        document.head.appendChild(s)
      }
      const render = () => {
        if (window.grecaptcha && rcRef.current) {
          window.grecaptcha.ready(() => {
            window.grecaptcha.render(rcRef.current, {
              sitekey: siteKey,
              callback: (t) => setCaptchaToken(t),
              'error-callback': () => setCaptchaToken(''),
              'expired-callback': () => setCaptchaToken(''),
              theme: 'light',
              size: 'normal'
            })
          })
        } else {
          setTimeout(render, 200)
        }
      }
      render()
    }
  }, [siteKey, provider])

  // Carga CAPTCHA simple (no requiere siteKey)
  useEffect(() => {
    if (provider !== 'simple') return
    const loadSimple = async () => {
      try {
        const res = await fetch('/auth/captcha')
        const json = await res.json()
        if (json?.ok) { setCaptchaToken(json.token); setSimpleQuestion(json.question); setSimpleAnswer('') }
      } catch {}
    }
    loadSimple()
  }, [provider])

  // Envío del formulario: se hace POST a /auth/login
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: usuario, password: contrasena, captchaToken, captchaAnswer: provider === 'simple' ? simpleAnswer : undefined }),
      })
      const json = await res.json()
      // Si la API respondió con error o status HTTP no OK
      if (!res.ok || !json.ok) throw new Error(json?.message || 'Error de autenticación')

      // Entregamos el token y rol al componente App (levanta sesión)
      onLogin?.({ usuario, token: json.token, role: json.user?.role })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo superior. Reemplaza /frontend/public/brand-logo.png por tu imagen. */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <img
            src={logoSrc}
            onError={() => setLogoSrc('/vite.svg')}
            alt="Logo"
            style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 8 }}
          />
        </div>

        {/* Título y subtítulo para branding */}
        <h1 style={{ textAlign: 'center' }}>Iniciar sesión</h1>
        <div style={{ textAlign: 'center', color: '#666', marginBottom: 12, fontSize: 13 }}>
          Accede con tus credenciales para continuar
        </div>

        {/* Mensaje de error en caso de credenciales inválidas o problemas de conexión */}
        {error && <div style={{ color: '#9b1c1c', marginBottom: 8 }}>{error}</div>}

        {/* Formulario controlado: email + contraseña, con opción de ver/ocultar */}
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>Usuario</span>
            <input
              type="email"
              name="usuario"
              placeholder="correo@empresa.cl"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
              autoFocus
              autoComplete="username"
            />
          </label>
          <label>
            <span>Contraseña</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showPass ? 'text' : 'password'}
                name="contrasena"
                placeholder="Tu contraseña"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                required
                autoComplete="current-password"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="menu-button"
                style={{ width: 'auto' }}
                onClick={() => setShowPass((v) => !v)}
                title={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPass ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </label>
          <button type="submit" className="login-button" disabled={(provider === 'turnstile' || provider === 'recaptcha') ? !captchaToken : (provider === 'simple' ? !(captchaToken && simpleAnswer) : false)}>
            { (provider === 'turnstile' || provider === 'recaptcha') ? (!captchaToken ? 'Completa el CAPTCHA' : 'Aceptar') : (provider === 'simple' ? (!(captchaToken && simpleAnswer) ? 'Responde la pregunta' : 'Aceptar') : 'Aceptar') }
          </button>
        </form>

        {/* CAPTCHA (opcional): Turnstile, reCAPTCHA v2 o simple */}
        {provider === 'turnstile' && <div ref={cfRef} style={{ marginTop: 10 }} />}
        {provider === 'recaptcha' && <div ref={rcRef} className="g-recaptcha" style={{ marginTop: 10 }} />}
        {provider === 'simple' && (
          <div style={{ marginTop: 10 }}>
            <label className="full" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span>Verificación: {simpleQuestion}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={simpleAnswer} onChange={(e) => setSimpleAnswer(e.target.value)} placeholder="Respuesta" style={{ flex: 1 }} />
                <button type="button" className="menu-button" style={{ width: 'auto' }} onClick={async () => { try { const r = await fetch('/auth/captcha'); const j = await r.json(); if (j?.ok) { setCaptchaToken(j.token); setSimpleQuestion(j.question); setSimpleAnswer('') } } catch {} }}>↻</button>
              </div>
            </label>
          </div>
        )}
        {!provider && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
            Para activar CAPTCHA define VITE_CAPTCHA_PROVIDER=simple (o usa Turnstile/reCAPTCHA con sus keys) en frontend/.env
          </div>
        )}

        {/* Nota: el fondo puede personalizarse con /frontend/public/bg-login.jpg (ver App.css) */}
      </div>
    </div>
  )
}

export default Login
