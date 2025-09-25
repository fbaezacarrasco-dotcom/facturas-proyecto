// Punto de entrada del frontend.
// - Monta el componente raíz <App /> en el elemento #root del index.html
// - Usa <StrictMode> para ayudar a detectar efectos secundarios y prácticas inseguras en desarrollo.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
