import { useEffect, useMemo, useState } from 'react'

function MntMantencion({ getAuthHeaders, onGoHome }) {
  const [camiones, setCamiones] = useState([])
  const [form, setForm] = useState({ patente: '', tarea: '', tipo_control: 'preventivo', fecha_control: '', intervalo_dias: '', km_antiguo: '', km_nuevo: '' })
  const [due, setDue] = useState([])
  const [loadingDue, setLoadingDue] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/camiones', { headers: { ...(getAuthHeaders?.() || {}) } })
        const json = await res.json()
        if (res.ok && json?.ok) {
          setCamiones(json.data || [])
        }
      } catch {}
    }
    load()
  }, [])

  const loadDue = async () => {
    try {
      setLoadingDue(true)
      const res = await fetch('/api/mantenciones/due', { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (res.ok && json?.ok) setDue(json.data || [])
    } catch {} finally { setLoadingDue(false) }
  }
  useEffect(() => { loadDue() }, [])

  const patenteOptions = useMemo(() => (camiones || []).map(c => ({ value: c.patente, label: c.patente, km: c.kilometraje })), [camiones])

  const onChange = (e) => {
    const { name, value } = e.target
    if (name === 'patente') {
      const sel = patenteOptions.find(p => p.value === value)
      setForm(f => ({ ...f, patente: value, km_antiguo: sel ? String(sel.km ?? '') : '' }))
      return
    }
    if (name === 'km_nuevo' || name === 'km_antiguo' || name === 'intervalo_dias') return setForm(f => ({ ...f, [name]: value.replace(/\D/g,'') }))
    setForm(f => ({ ...f, [name]: value }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    try {
      setSaving(true); setResult('')
      const payload = {
        patente: form.patente,
        tarea: form.tarea,
        tipo_control: form.tipo_control,
        fecha_control: form.fecha_control,
        intervalo_dias: form.intervalo_dias ? Number(form.intervalo_dias) : null,
        km_antiguo: form.km_antiguo ? Number(form.km_antiguo) : null,
        km_nuevo: form.km_nuevo ? Number(form.km_nuevo) : null,
      }
      const res = await fetch('/api/mantenciones', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() || {}) }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error')
      setResult('Mantención registrada correctamente')
      setForm({ patente: '', tarea: '', tipo_control: 'preventivo', fecha_control: '', intervalo_dias: '', km_antiguo: '', km_nuevo: '' })
      loadDue()
    } catch (e2) {
      setResult(e2.message)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
        <button className="menu-button" style={{ width: 'auto' }} onClick={() => onGoHome?.()}>
          📊 Ver gráficos (inicio)
        </button>
      </div>
      <h2 style={{ marginTop: 0 }}>Mantenimiento — Mantención</h2>
      {result && (
        <div style={{
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 8,
          background: result.includes('correct') ? '#e8f7ec' : '#fdeaea',
          color: result.includes('correct') ? '#1e6f3d' : '#9b1c1c',
          border: `1px solid ${result.includes('correct') ? '#bfe5c9' : '#f4c7c7'}`,
        }}>{result}</div>
      )}
      <form onSubmit={onSubmit} className="factura-form">
        <div className="grid-2">
          <label>
            <span>Patente</span>
            <select name="patente" value={form.patente} onChange={onChange} required>
              <option value="">Seleccionar</option>
              {patenteOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label>
            <span>Tarea</span>
            <input name="tarea" value={form.tarea} onChange={onChange} required />
          </label>
          <label>
            <span>Tipo de control</span>
            <select name="tipo_control" value={form.tipo_control} onChange={onChange}>
              <option value="preventivo">preventivo</option>
              <option value="urgente">urgente</option>
            </select>
          </label>
          <label>
            <span>Última fecha de control</span>
            <input type="date" name="fecha_control" value={form.fecha_control} onChange={onChange} required />
          </label>
          <label>
            <span>Intervalo (días)</span>
            <input name="intervalo_dias" value={form.intervalo_dias} onChange={onChange} inputMode="numeric" required />
          </label>
          <label>
            <span>KM antiguo</span>
            <input name="km_antiguo" value={form.km_antiguo} onChange={onChange} inputMode="numeric" required />
          </label>
          <label>
            <span>KM nuevo</span>
            <input name="km_nuevo" value={form.km_nuevo} onChange={onChange} inputMode="numeric" required />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="menu-button" style={{ width: 'auto' }} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar mantención'}
          </button>
        </div>
      </form>
      <div style={{ marginTop: 20 }}>
        <h3>Camiones con mantención vencida</h3>
        <button className="menu-button" style={{ width: 'auto', marginBottom: 8 }} onClick={loadDue} disabled={loadingDue}>{loadingDue ? 'Actualizando…' : '🔄 Actualizar'}</button>
        {due.length === 0 ? (
          <div className="content-placeholder" style={{ minHeight: 80 }}>Sin vencidos</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Patente</th><th>Última mantención</th><th>Intervalo (días)</th><th>Días vencidos</th></tr></thead>
              <tbody>
                {due.map(d => (
                  <tr key={d.camion_id}>
                    <td>{d.patente}</td>
                    <td>{d.fecha_control}</td>
                    <td>{d.intervalo_dias}</td>
                    <td>{d.dias_vencidos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default MntMantencion
