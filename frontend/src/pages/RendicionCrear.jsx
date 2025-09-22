// Importamos solo lo que necesitamos de React: useState para manejar estado local
import { useState } from 'react'

// Componente de creación de "Rendición".
// Lenguaje simple: es un formulario para cargar una rendición (datos básicos) y enviarlos al backend.
// Lenguaje técnico: componente funcional de React que usa estado controlado, envía JSON a POST /api/rendiciones,
// y obtiene cabeceras de autenticación mediante una prop (getAuthHeaders).

function RendicionCrear({ onClose, getAuthHeaders }) {
  // Estado del formulario ("estado controlado"): cada input refleja y actualiza estas propiedades.
  // Simple: acá guardamos lo que el usuario escribe.
  // Técnico: objeto inmutable que actualizamos con setForm en cada cambio.
  const [form, setForm] = useState({
    // Fecha inicial: hoy en formato YYYY-MM-DD, usando Date -> ISO -> slice(0,10)
    fecha: new Date().toISOString().slice(0, 10),
    // Datos generales de la rendición
    chofer: '',        // nombre o identificador del chofer
    camion: '',        // camión utilizado
    // Campos solicitados adicionales
    producto: '',      // descripción del producto
    cantidad: '',      // cantidad de producto
    local: '',         // local/sucursal
    numeroPedido: '',  // número de pedido asociado
    numeroFactura: '', // número de factura
    valorFactura: '',  // monto de la factura (string; se valida en el backend como número)
    valorFacturaDisplay: '', // visual en CLP (ej: $ 1.234.567)
    condicionPago: '', // condición de pago (contado, crédito, etc.)
    // Otros campos
    total: '',         // total de rendición (campo genérico si se requiere)
    observaciones: '', // comentarios libres
  })

  // Indicador de envío (para deshabilitar botón y mostrar feedback mientras se guarda)
  const [submitting, setSubmitting] = useState(false)
  // Resultado del último intento (ok: true/false y mensaje)
  const [result, setResult] = useState(null)

  const onChange = (e) => {
    // Simple: cuando alguien escribe, guardamos ese texto en el estado.
    // Técnico: usamos "name" del input para actualizar la clave homónima en el objeto form.
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  // Formateador de pesos chilenos (sin decimales)
  const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

  const onCurrencyChange = (e) => {
    const raw = (e.target.value || '').replace(/\D/g, '') // solo dígitos
    setForm((f) => ({
      ...f,
      valorFactura: raw, // esto se envía al backend (numérico)
      valorFacturaDisplay: raw ? clp.format(Number(raw)) : '' // esto se muestra en pantalla
    }))
  }

  const onSubmit = async (e) => {
    // Evitar que el navegador recargue la página por defecto al enviar el form
    e.preventDefault()
    try {
      setSubmitting(true)     // Mostramos estado de envío
      setResult(null)         // Limpiamos mensajes previos

      // Llamada HTTP al backend.
      // Simple: mandamos los datos al servidor para que los guarde.
      // Técnico: POST JSON a /api/rendiciones con cabeceras de auth (JWT) si existen.
      const res = await fetch('/api/rendiciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) },
        body: JSON.stringify(form),
      })

      // Parseamos la respuesta JSON del servidor
      const json = await res.json()

      // Validamos estado HTTP y campo ok de la API
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error')

      // Feedback al usuario: operación exitosa
      setResult({ ok: true, message: 'Rendición creada' })

      // Limpieza parcial del formulario (opcional): mantenemos datos clave y limpiamos totales/comentarios
      setForm((f) => ({ ...f, total: '', observaciones: '' }))
    } catch (e) {
      // Mostramos el error en pantalla (por ejemplo, validación de backend o fallo de red)
      setResult({ ok: false, message: e.message })
    } finally {
      // Siempre cerramos el estado de "enviando" al terminar
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        {/* Título de la vista y botón para volver al menú anterior */}
        <h2 style={{ margin: 0 }}>Crear rendición</h2>
        <button className="menu-button" style={{ width: 'auto' }} onClick={onClose}>Volver</button>
      </div>

      {result && (
        // Cartel de feedback: muestra éxito o error con colores distintos
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: result.ok ? '#e8f7ec' : '#fdeaea', color: result.ok ? '#1e6f3d' : '#9b1c1c', border: `1px solid ${result.ok ? '#bfe5c9' : '#f4c7c7'}` }}>
          {result.message}
        </div>
      )}

      {/* Formulario principal: usa clases comunes de estilo para inputs y grillas */}
      <form onSubmit={onSubmit} className="factura-form">
        <div className="grid-2">
          {/* Fecha de la rendición */}
          <label>
            <span>Fecha</span>
            <input type="date" name="fecha" value={form.fecha} onChange={onChange} required />
          </label>
          {/* Chofer responsable */}
          <label>
            <span>Chofer</span>
            <input name="chofer" value={form.chofer} onChange={onChange} />
          </label>
          {/* Identificación del camión */}
          <label>
            <span>Camión</span>
            <input name="camion" value={form.camion} onChange={onChange} />
          </label>
          {/* Producto, cantidad y local */}
          <label>
            <span>Producto</span>
            <input name="producto" value={form.producto} onChange={onChange} placeholder="Ej: Yogur descremado 1L" />
          </label>
          <label>
            <span>Cantidad</span>
            <input type="number" min="0" name="cantidad" value={form.cantidad} onChange={onChange} />
          </label>
          <label>
            <span>Local</span>
            <input name="local" value={form.local} onChange={onChange} placeholder="Sucursal / local" />
          </label>
          {/* Campos administrativos adicionales */}
          <label>
            <span>Número de pedido</span>
            <input name="numeroPedido" value={form.numeroPedido} onChange={onChange} />
          </label>
          <label>
            <span>Número de factura</span>
            <input name="numeroFactura" value={form.numeroFactura} onChange={onChange} />
          </label>
          <label>
            <span>Valor de la factura</span>
            <input
              type="text"
              name="valorFacturaDisplay"
              inputMode="numeric"
              placeholder="$ 1.234.567"
              value={form.valorFacturaDisplay}
              onChange={onCurrencyChange}
            />
          </label>
          <label>
            <span>Condición de pago</span>
            <select name="condicionPago" value={form.condicionPago} onChange={onChange}>
              <option value="">Seleccionar</option>
              <option value="transferencia">transferencia</option>
              <option value="30 dias">30 dias</option>
              <option value="efectivo">efectivo</option>
              <option value="ecommerce">ecommerce</option>
            </select>
          </label>
          {/* Total y observaciones generales */}
          <label>
            <span>Correo enviado</span>
            <input type="checkbox" name="correoEnviado" checked={!!form.correoEnviado} onChange={(e) => setForm(f => ({ ...f, correoEnviado: e.target.checked }))} />
          </label>
          <label>
            <span>Total</span>
            <input type="number" step="0.01" min="0" name="total" value={form.total} onChange={onChange} />
          </label>
          <label className="full">
            <span>Observaciones</span>
            <textarea rows={3} name="observaciones" value={form.observaciones} onChange={onChange} />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="submit" className="menu-button" style={{ width: 'auto' }} disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar rendición'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default RendicionCrear
