// Pantalla de ingreso de facturas pendientes.
// Objetivo: capturar datos básicos de una factura y adjuntar hasta 5 archivos
// (imágenes o PDF). Envía todo con FormData al endpoint POST /api/facturas.
import { useEffect, useState } from 'react'

// Hook: obtiene clientes activos desde el backend para el <select>
const useClientes = (getAuthHeaders) => {
  const [list, setList] = useState([])
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/clients', { headers: { ...(getAuthHeaders?.() || {}) } })
        const json = await res.json()
        if (res.ok && json?.ok) setList((json.data || []).map(c => ({ value: String(c.id), label: c.name })))
      } catch {}
    }
    load()
  }, [])
  return list
}

function FacturaCrear({ onClose, getAuthHeaders }) {
  // Lista de clientes para selección
  const clientes = useClientes(getAuthHeaders)
  // Fecha y día por defecto (según PC)
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const fechaHoy = `${yyyy}-${mm}-${dd}`
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const diaNombre = dias[now.getDay()]
  const diaPorDefecto = diaNombre

  const [form, setForm] = useState({
    dia: diaPorDefecto,
    fecha: fechaHoy,
    conductorXp: '',
    camion: '',
    vueltas: '',
    guia: '',
    local: '',
    kg: '',
    carga: '',
    observaciones: '',
    cliente: clientes[0]?.value || '1',
    // Estado ahora es opcional; se puede editar luego desde "Facturas pendientes"
    estado: '',
  })
  // Archivos seleccionados por el usuario (máximo 5)
  const [archivos, setArchivos] = useState([])
  // Flags de envío/resultado
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const onChange = (e) => {
    // Actualiza el estado de un campo del formulario a partir del evento
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const onFilesChange = (e) => {
    // Controla selección de archivos (máx. 5) y los guarda en memoria
    const files = Array.from(e.target.files || [])
    if (files.length > 5) {
      alert('Máximo 5 archivos por factura')
      return
    }
    setArchivos(files)
  }

  const onSubmit = async (e) => {
    // Construye FormData con campos + archivos y lo envía al backend
    e.preventDefault()
    if (archivos.length > 5) {
      alert('Máximo 5 archivos por factura')
      return
    }
    try {
      setSubmitting(true)
      setResult(null)
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      archivos.forEach((file) => fd.append('archivos', file))

      const res = await fetch('/api/facturas', { method: 'POST', headers: { ...getAuthHeaders?.() }, body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Error')
      setResult({ ok: true, message: 'Factura enviada correctamente' })
      // Limpia parcialmente
      setArchivos([])
      setForm((f) => ({ ...f, guia: '', kg: '', observaciones: '' }))
    } catch (err) {
      setResult({ ok: false, message: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Ingresar facturas pendientes</h2>
        <button className="menu-button" style={{ width: 'auto' }} onClick={onClose}>Volver</button>
      </div>

      {result && (
        <div style={{
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 8,
          background: result.ok ? '#e8f7ec' : '#fdeaea',
          color: result.ok ? '#1e6f3d' : '#9b1c1c',
          border: `1px solid ${result.ok ? '#bfe5c9' : '#f4c7c7'}`,
        }}>
          {result.message}
        </div>
      )}

      <form onSubmit={onSubmit} className="factura-form">
        <div className="grid-2">
          <label>
            <span>Día de ingreso</span>
            <select name="dia" value={form.dia} onChange={onChange} required>
              <option value="">Seleccionar</option>
              <option value="Domingo">Domingo</option>
              <option value="Lunes">Lunes</option>
              <option value="Martes">Martes</option>
              <option value="Miércoles">Miércoles</option>
              <option value="Jueves">Jueves</option>
              <option value="Viernes">Viernes</option>
              <option value="Sábado">Sábado</option>
            </select>
          </label>
          <label>
            <span>Fecha de perdida</span>
            <input type="date" name="fecha" value={form.fecha} onChange={onChange} required />
          </label>
          <label>
            <span>Conductor</span>
            <input name="conductorXp" value={form.conductorXp} onChange={onChange} />
          </label>
          <label>
            <span>Ruta</span>
            <input name="camion" value={form.camion} onChange={onChange} />
          </label>
          <label>
            <span>Vueltas</span>
            <input type="number" name="vueltas" value={form.vueltas} onChange={onChange} min="0" />
          </label>
          <label>
            <span>N° factura (guía)</span>
            <input name="guia" value={form.guia} onChange={onChange} placeholder="Ej: 001234" />
          </label>
          <label>
            <span>Local de entrega</span>
            <input name="local" value={form.local} onChange={onChange} />
          </label>
          <label>
            <span>Cantidad</span>
            <input type="number" step="0.01" name="kg" value={form.kg} onChange={onChange} min="0" />
          </label>
          <label>
            <span>Tipo de Carga</span>
            <select name="carga" value={form.carga} onChange={onChange}>
              <option value="">Seleccionar</option>
              <option value="seco">Seco</option>
              <option value="refrigerado">Refrigerado</option>
              <option value="congelado">Congelado</option>
              <option value="no aplica">No aplica</option>
            </select>
          </label>
          
          <label>
            <span>Estado (opcional)</span>
            <select name="estado" value={form.estado} onChange={onChange}>
              <option value="">— (sin estado)</option>
              <option value="entregado sin novedad">entregado sin novedad</option>
              <option value="entregado con detalle">entregado con detalle</option>
              <option value="rechazado">rechazado</option>
              <option value="reprogramado">reprogramado</option>
            </select>
          </label>
          <label className="full">
            <span>Comentarios u Observaciones</span>
            <textarea name="observaciones" value={form.observaciones} onChange={onChange} rows={3} />
          </label>
          <label>
            <span>Cliente</span>
            <select name="cliente" value={form.cliente} onChange={onChange}>
              {clientes.map((c) => (
                <option key={c.value} value={c.value}>{c.value}. - {c.label}</option>
              ))}
            </select>
          </label>
          <label className="full">
            <span>Archivos (máx. 5) — png, jpg, pdf</span>
            <input type="file" accept=".png,.jpg,.jpeg,.pdf" multiple onChange={onFilesChange} />
            <div style={{ fontSize: 12, color: '#666' }}>{archivos.length} seleccionado(s)</div>
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="submit" className="menu-button" disabled={submitting} style={{ width: 'auto' }}>
            {submitting ? 'Enviando...' : 'Guardar pendiente'}
          </button>
        </div>
      </form>
    </div>
  )
}
export default FacturaCrear
