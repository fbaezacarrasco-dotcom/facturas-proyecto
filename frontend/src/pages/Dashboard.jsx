// Dashboard interactivo para visualizar datos de planificaciones con gráficos.
// Permite elegir: cliente, fecha (planificación de ese día), la planificación específica
// y la métrica/agrupación (conductor, estado, pago, carga, ambiente). Soporta gráficos
// de tipo circular, barras y líneas usando SVG nativo.
import { useEffect, useMemo, useState } from 'react'

const useClientes = (getAuthHeaders) => {
  const [list, setList] = useState([{ value: '', label: 'Todos' }])
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/clients', { headers: { ...(getAuthHeaders?.() || {}) } })
        const json = await res.json()
        if (res.ok && json?.ok) setList([{ value: '', label: 'Todos' }, ...(json.data || []).map(c => ({ value: String(c.id), label: c.name }))])
      } catch {}
    }
    load()
  }, [])
  return list
}

function PieChart({ data, width = 360, height = 360, innerRatio = 0.6 }) {
  // data: Array<{ label: string, value: number, color?: string }>
  const total = data.reduce((a, d) => a + (d.value || 0), 0) || 1
  const cx = width / 2, cy = height / 2
  const r = Math.min(width, height) / 2 - 6
  const ri = r * innerRatio
  let angle = -Math.PI / 2 // empieza hacia arriba
  const toXY = (ang, rad) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]

  const arcs = data.map((d, i) => {
    const frac = (d.value || 0) / total
    const a2 = angle + 2 * Math.PI * frac
    const [x1, y1] = toXY(angle, r)
    const [x2, y2] = toXY(a2, r)
    const [xi, yi] = toXY(a2, ri)
    const [xj, yj] = toXY(angle, ri)
    const large = (a2 - angle) % (2 * Math.PI) > Math.PI ? 1 : 0
    angle = a2
    const color = d.color || ['#60a5fa','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f472b6','#84cc16'][i % 8]
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi} ${yi} A ${ri} ${ri} 0 ${large} 0 ${xj} ${yj} Z`
    return { path, color, label: d.label, value: d.value }
  })
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      {arcs.map((a, i) => (
        <path key={i} d={a.path} fill={a.color} stroke="#fff" strokeWidth="1" />
      ))}
    </svg>
  )
}

function BarChart({ data, width = 520, height = 280 }) {
  // data: Array<{ label: string, value: number }>
  const max = data.reduce((m, d) => Math.max(m, d.value || 0), 1)
  const pad = 30
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const barW = innerW / Math.max(1, data.length)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <rect x={pad} y={pad} width={innerW} height={innerH} fill="#f9fafb" stroke="#e5e7eb" />
      {data.map((d, i) => {
        const h = max ? (d.value / max) * (innerH - 10) : 0
        const x = pad + i * barW + 6
        const y = pad + (innerH - h)
        return (
          <g key={i}>
            <rect x={x} y={y} width={Math.max(4, barW - 12)} height={h} fill="#60a5fa" />
            <text x={x + Math.max(4, barW - 12) / 2} y={height - 4} textAnchor="middle" fontSize="10" fill="#374151">
              {String(d.label).slice(0, 10)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function LineChart({ data, width = 520, height = 280 }) {
  // data: Array<{ label: string, value: number }>
  const pad = 30
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const max = data.reduce((m, d) => Math.max(m, d.value || 0), 1)
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * innerW
    const y = pad + (innerH - (max ? (d.value / max) * (innerH - 10) : 0))
    return [x, y]
  })
  const path = points.map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`)).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <rect x={pad} y={pad} width={innerW} height={innerH} fill="#f9fafb" stroke="#e5e7eb" />
      <path d={path} fill="none" stroke="#10b981" strokeWidth="2" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill="#10b981" />
      ))}
      {data.map((d, i) => (
        <text key={i} x={pad + (i / Math.max(1, data.length - 1)) * innerW} y={height - 4} textAnchor="middle" fontSize="10" fill="#374151">
          {String(d.label).slice(0, 10)}
        </text>
      ))}
    </svg>
  )
}

export default function Dashboard({ getAuthHeaders }) {
  const clientes = useClientes(getAuthHeaders)
  const [filters, setFilters] = useState({ cliente: '', fecha: '', from: '', to: '' })
  const [plans, setPlans] = useState([]) // listado de planificaciones del filtro
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [compareMode, setCompareMode] = useState(false)
  const [selectedPlanIds, setSelectedPlanIds] = useState([])
  const [compareBy, setCompareBy] = useState('dias') // 'dias' | 'meses'
  const [fromMonth, setFromMonth] = useState('') // YYYY-MM
  const [toMonth, setToMonth] = useState('')     // YYYY-MM
  const [stats, setStats] = useState(null)
  const [groupBy, setGroupBy] = useState('conductor') // conductor | estado | pago | carga | ambiente
  const [chartType, setChartType] = useState('barras') // barras | circular | lineas
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Comparador de personal (conductores/peonetas)
  const [peopleRole, setPeopleRole] = useState('conductor') // 'conductor' | 'peoneta'
  const [peopleMetric, setPeopleMetric] = useState('entregado_ok') // entregado_ok | entregado_detalle | rechazado | reprogramado | total
  const [people, setPeople] = useState([]) // [{ name, entregado_ok, entregado_detalle, rechazado, reprogramado, otro, total }]
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [peopleError, setPeopleError] = useState('')
  const [topN, setTopN] = useState(20)

  const onChangeFilter = (e) => {
    const { name, value } = e.target
    setFilters(f => ({ ...f, [name]: value }))
  }

  const loadPlans = async () => {
    try {
      setLoading(true); setError('')
      const p = new URLSearchParams()
      // Construir parámetros según modo
      if (compareMode && compareBy === 'meses' && (fromMonth || toMonth)) {
        const parseMonth = (m) => {
          // m: YYYY-MM
          const [y, mo] = String(m).split('-').map(Number)
          if (!y || !mo) return null
          return { y, mo }
        }
        let from = null
        let to = null
        const fm = parseMonth(fromMonth)
        const tm = parseMonth(toMonth)
        if (fm) {
          from = `${fm.y}-${String(fm.mo).padStart(2,'0')}-01`
        }
        if (tm) {
          const last = new Date(tm.y, tm.mo, 0).getDate() // día 0 del mes siguiente => último del mes
          to = `${tm.y}-${String(tm.mo).padStart(2,'0')}-${String(last).padStart(2,'0')}`
        }
        if (filters.cliente) p.set('cliente', filters.cliente)
        if (from) p.set('from', from)
        if (to) p.set('to', to)
      } else {
        Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v) })
      }
      p.set('limit', '50')
      const res = await fetch(`/api/planificaciones?${p.toString()}`, { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error listando planificaciones')
      setPlans(json.data || [])
      setSelectedPlanId('')
      setSelectedPlanIds([])
      setStats(null)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const loadStats = async (id) => {
    if (!id) return
    try {
      setLoading(true); setError('')
      const res = await fetch(`/api/planificaciones/${id}/stats`, { headers: { ...(getAuthHeaders?.() || {}) } })
      const json = await res.json()
      if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error cargando estadísticas')
      setStats(json.data || null)
    } catch (e) { setError(e.message); setStats(null) } finally { setLoading(false) }
  }

  useEffect(() => { /* carga inicial opcional */ }, [])

  const mergeStats = (arr) => {
    const out = { total: 0, by_estado: {}, by_conductor: {}, by_pago: {}, by_carga: {}, by_ambiente: {} }
    for (const s of arr) {
      out.total += s?.total || 0
      const addMap = (dst, src) => { Object.entries(src || {}).forEach(([k, v]) => { dst[k] = (dst[k] || 0) + (v || 0) }) }
      addMap(out.by_estado, s?.by_estado)
      addMap(out.by_conductor, s?.by_conductor)
      addMap(out.by_pago, s?.by_pago)
      addMap(out.by_carga, s?.by_carga)
      addMap(out.by_ambiente, s?.by_ambiente)
    }
    return out
  }

  const loadStatsMulti = async (ids) => {
    if (!ids?.length) return
    try {
      setLoading(true); setError('')
      const list = []
      for (const id of ids) {
        const res = await fetch(`/api/planificaciones/${id}/stats`, { headers: { ...(getAuthHeaders?.() || {}) } })
        const json = await res.json()
        if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error cargando estadísticas')
        list.push(json.data || {})
      }
      setStats(mergeStats(list))
    } catch (e) { setError(e.message); setStats(null) } finally { setLoading(false) }
  }

  const entries = useMemo(() => {
    if (!stats) return []
    const map = groupBy === 'conductor' ? (stats.by_conductor || {})
      : groupBy === 'estado' ? (stats.by_estado || {})
      : groupBy === 'pago' ? (stats.by_pago || {})
      : groupBy === 'carga' ? (stats.by_carga || {})
      : (stats.by_ambiente || {})
    return Object.entries(map).map(([label, value]) => ({ label: label || '(vacío)', value }))
  }, [stats, groupBy])

  const sorted = useMemo(() => entries.slice().sort((a, b) => b.value - a.value).slice(0, 20), [entries])

  const exportCsv = () => {
    try {
      const cols = ['label','value']
      const esc = (v) => {
        const s = v == null ? '' : String(v)
        return /[",\n]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s
      }
      const lines = sorted.map(r => [r.label, r.value].map(esc).join(','))
      const csv = [cols.join(','), ...lines].join('\n')
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `dashboard-${groupBy}-${Date.now()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    } catch (e) { alert(e.message) }
  }

  const svgRef = (el) => { chartRef.current = el }
  const chartRef = { current: null }
  const exportSvg = () => {
    try {
      const el = document.querySelector('#chart-area svg') || chartRef.current
      if (!el) return alert('No se encontró el gráfico')
      const svg = new Blob([el.outerHTML], { type: 'image/svg+xml;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(svg)
      a.download = `dashboard-${groupBy}-${Date.now()}.svg`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    } catch (e) { alert(e.message) }
  }
  const exportPng = () => {
    try {
      const el = document.querySelector('#chart-area svg')
      if (!el) return alert('No se encontró el gráfico')
      const xml = new XMLSerializer().serializeToString(el)
      const img = new Image()
      const svg64 = btoa(unescape(encodeURIComponent(xml)))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = el.viewBox?.baseVal?.width || el.clientWidth || 800
        canvas.height = el.viewBox?.baseVal?.height || el.clientHeight || 450
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        const url = canvas.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = url
        a.download = `dashboard-${groupBy}-${Date.now()}.png`
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
      img.src = 'data:image/svg+xml;base64,' + svg64
    } catch (e) { alert(e.message) }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Dashboard</h2>
      <div className="filters sticky-filters" style={{ marginBottom: 8 }}>
        <select name="cliente" value={filters.cliente} onChange={onChangeFilter}>
          {clientes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input type="date" name="fecha" value={filters.fecha} onChange={onChangeFilter} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={compareMode} onChange={(e) => { setCompareMode(e.target.checked); setSelectedPlanIds([]); setSelectedPlanId(''); setStats(null) }} />
          <span>Modo comparativo</span>
        </label>
        {compareMode && (
          <>
            <select value={compareBy} onChange={(e) => setCompareBy(e.target.value)} title="Granularidad de comparación">
              <option value="dias">Por días</option>
              <option value="meses">Por meses</option>
            </select>
            {compareBy === 'dias' ? (
              <>
                <input type="date" name="from" value={filters.from} onChange={onChangeFilter} title="Desde" />
                <input type="date" name="to" value={filters.to} onChange={onChangeFilter} title="Hasta" />
              </>
            ) : (
              <>
                <input type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} title="Desde mes" />
                <input type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} title="Hasta mes" />
              </>
            )}
          </>
        )}
        <button className="menu-button" style={{ width: 'auto' }} onClick={loadPlans} disabled={loading}>
          {loading ? 'Buscando…' : '🔍 Buscar planificación'}
        </button>
        {!compareMode ? (
          <select value={selectedPlanId} onChange={(e) => { setSelectedPlanId(e.target.value); loadStats(e.target.value) }}>
            <option value="">Seleccionar planificación</option>
            {plans.map(p => (
              <option key={p.id} value={p.id}>
                #{p.id} — {p.fecha || String(p.created_at || '').slice(0,10)} — {p.cliente_name || p.cliente}
              </option>
            ))}
          </select>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {plans.map(p => {
              const id = String(p.id)
              const checked = selectedPlanIds.includes(id)
              return (
                <label key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', padding: '4px 6px', borderRadius: 6 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked ? [...selectedPlanIds, id] : selectedPlanIds.filter(x => x !== id)
                      setSelectedPlanIds(next)
                      if (next.length) loadStatsMulti(next)
                      else setStats(null)
                    }}
                  />
                  <span>#{p.id} — {p.fecha || String(p.created_at || '').slice(0,10)}</span>
                </label>
              )
            })}
            {plans.length > 0 && (
              <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => { const ids = plans.map(p => String(p.id)); setSelectedPlanIds(ids); loadStatsMulti(ids) }}>Seleccionar todo</button>
                <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => { setSelectedPlanIds([]); setStats(null) }}>Limpiar</button>
              </div>
            )}
          </div>
        )}
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          <option value="conductor">Por conductor</option>
          <option value="estado">Por estado</option>
          <option value="pago">Por pago</option>
          <option value="carga">Por carga</option>
          <option value="ambiente">Por ambiente</option>
        </select>
        <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
          <option value="barras">Barras</option>
          <option value="circular">Circular</option>
          <option value="lineas">Líneas</option>
        </select>
        <button className="menu-button" style={{ width: 'auto' }} onClick={exportCsv} disabled={!sorted.length}>Exportar CSV</button>
        <button className="menu-button" style={{ width: 'auto' }} onClick={exportSvg} disabled={!sorted.length}>Exportar SVG</button>
        <button className="menu-button" style={{ width: 'auto' }} onClick={exportPng} disabled={!sorted.length}>Exportar PNG</button>
      </div>

      {error && <div style={{ color: '#9b1c1c', marginTop: 8 }}>{error}</div>}

      {!stats ? (
        <div className="content-placeholder" style={{ minHeight: 200 }}>
          {loading ? 'Cargando…' : 'Selecciona una planificación para ver gráficos'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16 }}>
          <div id="chart-area">
            {chartType === 'circular' ? (
              <PieChart data={sorted} width={360} height={360} />
            ) : chartType === 'lineas' ? (
              <LineChart data={sorted} width={540} height={280} />
            ) : (
              <BarChart data={sorted} width={540} height={280} />
            )}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Top {sorted.length} — {groupBy} ({stats.total || 0} filas){compareMode && selectedPlanIds.length ? ` — comparando ${selectedPlanIds.length}` : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sorted.map((e) => (
                <div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{e.label}</span>
                  <span style={{ fontWeight: 600 }}>{e.value}</span>
                </div>
              ))}
              {!sorted.length && <div style={{ color: '#666' }}>Sin datos</div>}
            </div>
          </div>
        </div>
      )}

      {/* Comparador de personal (conductores/peonetas) */}
      <div style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Comparador de personal</h3>
        <div className="filters" style={{ gap: 10, marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Rol</span>
            <select value={peopleRole} onChange={(e) => setPeopleRole(e.target.value)}>
              <option value="conductor">Conductores</option>
              <option value="peoneta">Peonetas</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Parámetro</span>
            <select value={peopleMetric} onChange={(e) => setPeopleMetric(e.target.value)}>
              <option value="entregado_ok">Entregas completas</option>
              <option value="entregado_detalle">Entregas con detalle</option>
              <option value="rechazado">Entregas con rechazo</option>
              <option value="reprogramado">Reprogramadas</option>
              <option value="total">Total filas</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Top</span>
            <input type="number" min={1} max={200} value={topN} onChange={(e) => setTopN(Number(e.target.value || 20))} style={{ width: 80 }} />
          </label>
          <button
            className="menu-button"
            style={{ width: 'auto' }}
            onClick={async () => {
              try {
                setPeopleLoading(true); setPeopleError('')
                const ids = compareMode ? selectedPlanIds : (selectedPlanId ? [selectedPlanId] : [])
                if (!ids.length) throw new Error('Selecciona al menos una planificación')
                // Cargar filas de todas las planificaciones
                const allRows = []
                for (const id of ids) {
                  const res = await fetch(`/api/planificaciones/${id}`, { headers: { ...(getAuthHeaders?.() || {}) } })
                  const json = await res.json()
                  if (!res.ok || json?.ok === false) throw new Error(json?.message || 'Error cargando filas')
                  if (Array.isArray(json.data?.rows)) allRows.push(...json.data.rows)
                }
                // Detectar llaves
                const detectKeys = (rows) => {
                  const keys = rows.length ? Object.keys(rows[0]) : []
                  const findKey = (re, def) => keys.find(k => re.test(k)) || def
                  const statusKey = findKey(/observa|estado/i, 'estado')
                  const driverKey = findKey(/conductor|xp/i, 'conductor')
                  const peonetaKey = findKey(/peoneta|ayudante/i, 'peoneta')
                  return { statusKey, driverKey, peonetaKey }
                }
                const { statusKey, driverKey, peonetaKey } = detectKeys(allRows)
                const norm = (s) => String(s || '').trim().toLowerCase()
                const mapEstado = (txt) => {
                  const s = norm(txt)
                  if (!s) return 'otro'
                  if (s.includes('no sale') && s.includes('id') && s.includes('carga')) return 'no sale por id de carga'
                  if (s.includes('no sale') && s.includes('quiebre') && s.includes('stock')) return 'no sale por quiebre de stock'
                  if (s.includes('rechaz') && (s.includes('horario') || s.includes('hora'))) return 'rechazado por horario'
                  if (s.includes('rechaz') && s.includes('temperatura')) return 'rechazado por temperatura'
                  if (s.includes('reprogram')) return 'reprogramado'
                  if (s.includes('detalle')) return 'entregado con detalle'
                  if (s.includes('entregado')) return 'entregado sin novedad'
                  if (s.includes('rechaz')) return 'rechazado'
                  return 'otro'
                }
                const by = new Map() // name -> counters
                for (const r of allRows) {
                  const person = peopleRole === 'conductor' ? String(r[driverKey] || '').trim() : String(r[peonetaKey] || '').trim()
                  if (!person) continue
                  const est = mapEstado(r[statusKey])
                  if (!by.has(person)) by.set(person, { name: person, entregado_ok: 0, entregado_detalle: 0, rechazado: 0, reprogramado: 0, otro: 0, total: 0 })
                  const obj = by.get(person)
                  obj.total++
                  if (est === 'entregado sin novedad') obj.entregado_ok++
                  else if (est === 'entregado con detalle') obj.entregado_detalle++
                  else if (est.startsWith('rechazado')) obj.rechazado++
                  else if (est === 'reprogramado') obj.reprogramado++
                  else obj.otro++
                }
                const list = Array.from(by.values()).sort((a, b) => (b[peopleMetric] - a[peopleMetric]) || b.total - a.total).slice(0, topN)
                setPeople(list)
              } catch (e) {
                setPeopleError(e.message)
                setPeople([])
              } finally {
                setPeopleLoading(false)
              }
            }}
          >
            {peopleLoading ? 'Calculando…' : 'Actualizar comparador'}
          </button>
          <button
            className="menu-button"
            style={{ width: 'auto' }}
            onClick={() => {
              try {
                if (!people.length) return
                const cols = ['persona','entregado_ok','entregado_detalle','rechazado','reprogramado','otro','total']
                const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s }
                const lines = people.map(p => [p.name, p.entregado_ok, p.entregado_detalle, p.rechazado, p.reprogramado, p.otro, p.total].map(esc).join(','))
                const csv = [cols.join(','), ...lines].join('\n')
                const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `comparador-personal-${peopleRole}-${Date.now()}.csv`
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(a.href)
              } catch (e) { alert(e.message) }
            }}
            disabled={!people.length}
          >
            Exportar CSV
          </button>
        </div>
        {peopleError && <div style={{ color: '#9b1c1c', marginBottom: 8 }}>{peopleError}</div>}
        {people.length === 0 ? (
          <div className="content-placeholder" style={{ minHeight: 120 }}>
            {peopleLoading ? 'Cargando…' : 'Selecciona planificación(es) y pulsa "Actualizar comparador"'}
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Entregas completas</th>
                  <th>Con detalle</th>
                  <th>Rechazos</th>
                  <th>Reprogramadas</th>
                  <th>Otros</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td style={{ fontWeight: peopleMetric === 'entregado_ok' ? 700 : 400 }}>{p.entregado_ok}</td>
                    <td style={{ fontWeight: peopleMetric === 'entregado_detalle' ? 700 : 400 }}>{p.entregado_detalle}</td>
                    <td style={{ fontWeight: peopleMetric === 'rechazado' ? 700 : 400 }}>{p.rechazado}</td>
                    <td style={{ fontWeight: peopleMetric === 'reprogramado' ? 700 : 400 }}>{p.reprogramado}</td>
                    <td>{p.otro}</td>
                    <td style={{ fontWeight: peopleMetric === 'total' ? 700 : 400 }}>{p.total}</td>
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
