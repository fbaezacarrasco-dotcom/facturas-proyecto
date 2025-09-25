// Formulario para crear resguardos (productos pendientes) con posibilidad de adjuntar imágenes.
import { useEffect, useState } from 'react'

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

function ResguardoCrear({ onClose, getAuthHeaders }) {
  const clientes = useClientes(getAuthHeaders)
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const fechaHoy = `${yyyy}-${mm}-${dd}`

  const [form, setForm] = useState({
    cantidad: '',
    tipo: 'seco',
    nombre: '',
    guia: '',
    cliente: clientes[0]?.value || '1',
    fecha_ingreso: fechaHoy,
    fecha_salida: '',
    ruta: '',
  })
  const [imagenes, setImagenes] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const onChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const onFilesChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 5) { alert('Máximo 5 imágenes'); return }
    setImagenes(files)
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      setResult(null)
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      imagenes.forEach((f) => fd.append('imagenes', f))
      const res = await fetch('/api/resguardos', { method: 'POST', headers: { ...getAuthHeaders?.() }, body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || 'Error')
      setResult({ ok: true, message: 'Resguardo creado' })
      setImagenes([])
    } catch (err) {
      setResult({ ok: false, message: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Agregar resguardo</h2>
        <button className="menu-button" style={{ width: 'auto' }} onClick={onClose}>Volver</button>
      </div>

      {result && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: result.ok ? '#e8f7ec' : '#fdeaea', color: result.ok ? '#1e6f3d' : '#9b1c1c', border: `1px solid ${result.ok ? '#bfe5c9' : '#f4c7c7'}` }}>
          {result.message}
        </div>
      )}

      <form onSubmit={onSubmit} className="factura-form">
        <div className="grid-2">
          <label>
            <span>Cantidad</span>
            <input type="number" name="cantidad" min="0" value={form.cantidad} onChange={onChange} required />
          </label>
          <label>
            <span>Tipo de producto</span>
            <select name="tipo" value={form.tipo} onChange={onChange}>
              <option value="seco">Seco</option>
              <option value="refrigerado">Refrigerado</option>
              <option value="congelado">Congelado</option>
            </select>
          </label>
          <label>
            <span>Nombre de producto(s)</span>
            <input name="nombre" value={form.nombre} onChange={onChange} placeholder="Ej: Yogur descremado 1L" />
          </label>
          <label>
            <span>Ruta</span>
            <input name="ruta" value={form.ruta} onChange={onChange} placeholder="Ej: Renca - Ñuñoa" />
          </label>
          <label>
            <span>N° factura (guía)</span>
            <input name="guia" value={form.guia} onChange={onChange} />
          </label>
          <label>
            <span>Cliente</span>
            <select name="cliente" value={form.cliente} onChange={onChange}>
              {clientes.map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}
            </select>
          </label>
          <label>
            <span>Fecha de ingreso</span>
            <input type="date" name="fecha_ingreso" value={form.fecha_ingreso} onChange={onChange} />
          </label>
          <label>
            <span>Fecha de salida (aprox)</span>
            <input type="date" name="fecha_salida" value={form.fecha_salida} onChange={onChange} />
          </label>
          <label className="full">
            <span>Imágenes (hasta 5)</span>
            <input type="file" accept="image/png,image/jpeg" multiple onChange={onFilesChange} />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="menu-button" style={{ width: 'auto' }} disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar resguardo'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ResguardoCrear
