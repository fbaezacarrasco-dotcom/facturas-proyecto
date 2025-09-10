import { useState } from 'react'

const clientes = [
  { value: '1', label: 'Brival' },
  { value: '2', label: 'Nutrisco' },
  { value: '3', label: 'Carnicero' },
  { value: '4', label: 'Gourmet' },
]

function FacturaCrear({ onClose }) {
  const [form, setForm] = useState({
    dia: '',
    fecha: '',
    conductorXp: '',
    camion: '',
    vueltas: '',
    guia: '',
    local: '',
    kg: '',
    carga: '',
    observaciones: '',
    cliente: clientes[0].value,
    estado: 'entregado sin novedad',
  })
  const [archivos, setArchivos] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const onChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const onFilesChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 5) {
      alert('Máximo 5 archivos por factura')
      return
    }
    setArchivos(files)
  }

  const onSubmit = async (e) => {
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

      const res = await fetch('/api/facturas', { method: 'POST', body: fd })
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
        <h2 style={{ margin: 0 }}>Crear factura</h2>
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
            <span>Día</span>
            <select name="dia" value={form.dia} onChange={onChange} required>
              <option value="">Seleccionar</option>
              <option value="Lunes">Lunes</option>
              <option value="Martes">Martes</option>
              <option value="Miércoles">Miércoles</option>
              <option value="Jueves">Jueves</option>
              <option value="Viernes">Viernes</option>
              <option value="Sábado">Sábado</option>
            </select>
          </label>
          <label>
            <span>Fecha</span>
            <input type="date" name="fecha" value={form.fecha} onChange={onChange} required />
          </label>
          <label>
            <span>Conductor-XP</span>
            <input name="conductorXp" value={form.conductorXp} onChange={onChange} />
          </label>
          <label>
            <span>Camión</span>
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
            <span>Local</span>
            <input name="local" value={form.local} onChange={onChange} />
          </label>
          <label>
            <span>KG</span>
            <input type="number" step="0.01" name="kg" value={form.kg} onChange={onChange} min="0" />
          </label>
          <label>
            <span>Carga</span>
            <select name="carga" value={form.carga} onChange={onChange}>
              <option value="">Seleccionar</option>
              <option value="seco">Seco</option>
              <option value="refrigerado">Refrigerado</option>
              <option value="congelado">Congelado</option>
              <option value="no aplica">No aplica</option>
            </select>
          </label>
          
          <label>
            <span>Estado</span>
            <select name="estado" value={form.estado} onChange={onChange}>
              <option value="entregado sin novedad">entregado sin novedad</option>
              <option value="entregado con detalle">entregado con detalle</option>
              <option value="rechazado">rechazado</option>
              <option value="reprogramado">reprogramado</option>
            </select>
          </label>
          <label className="full">
            <span>Observaciones</span>
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
            {submitting ? 'Enviando...' : 'Guardar factura'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default FacturaCrear
