// Editor local de planillas (sin backend): permite ajustar columnas, anchos, visibilidad y zoom.
// Guarda/lee su estado desde localStorage bajo la clave 'plan_editor_data'.
import { useEffect, useMemo, useRef, useState } from 'react'

export default function PlanEditor() {
  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [personalCol, setPersonalCol] = useState('')
  const [zoom, setZoom] = useState(100)
  const [widths, setWidths] = useState({}) // { colName: px }
  const [hidden, setHidden] = useState({}) // { colName: true }
  const wrapRef = useRef(null)
  const [scrollX, setScrollX] = useState(0)
  const [maxScrollX, setMaxScrollX] = useState(0)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('plan_editor_data')
      if (raw) {
        const d = JSON.parse(raw)
        setColumns(d.columns || [])
        setRows(d.rows || [])
        setPersonalCol(d.personalCol || '')
      }
    } catch {}
  }, [])

  const visibleCols = useMemo(() => columns.filter(c => !hidden[c]), [columns, hidden])

  const setCell = (rIdx, col, value) => {
    setRows(rs => rs.map((r, i) => (i === rIdx ? { ...r, [col]: value } : r)))
  }
  const removeCol = (c) => {
    if (!confirm(`¿Eliminar columna "${c}"?`)) return
    setColumns(cols => cols.filter(x => x !== c))
    setRows(rs => rs.map(({ [c]: _omit, ...rest }) => rest))
    const w = { ...widths }; delete w[c]; setWidths(w)
  }
  const move = (c, dir) => {
    setColumns(cols => {
      const i = cols.indexOf(c); if (i === -1) return cols
      const j = i + (dir === 'left' ? -1 : 1); if (j < 0 || j >= cols.length) return cols
      const copy = cols.slice(); const [sp] = copy.splice(i, 1); copy.splice(j, 0, sp); return copy
    })
  }
  const saveBack = () => {
    try { localStorage.setItem('plan_editor_data', JSON.stringify({ columns, rows, personalCol })) } catch {}
    alert('Guardado en este equipo (localStorage).')
  }

  // Medir y sincronizar scroll máximo para el deslizador
  const measureScroll = () => {
    const el = wrapRef.current
    if (!el) return
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    setMaxScrollX(max)
    setScrollX(el.scrollLeft)
  }
  useEffect(() => {
    measureScroll()
    const onResize = () => measureScroll()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => { measureScroll() }, [columns, rows, widths, zoom, hidden])
  const onScrollWrap = () => { const el = wrapRef.current; if (el) setScrollX(el.scrollLeft) }
  const onSlide = (v) => { const el = wrapRef.current; if (!el) return; el.scrollLeft = Number(v); setScrollX(Number(v)) }

  // Arrastrar para desplazar con el mouse (drag to pan)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let isDown = false; let startX = 0; let startLeft = 0
    const down = (e) => { isDown = true; startX = e.pageX; startLeft = el.scrollLeft; el.style.cursor = 'grabbing' }
    const move = (e) => { if (!isDown) return; el.scrollLeft = startLeft - (e.pageX - startX) }
    const up = () => { isDown = false; el.style.cursor = 'auto' }
    el.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { el.removeEventListener('mousedown', down); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [])

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Editor de planilla (nueva pestaña)</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Zoom</span>
            <input type="range" min={80} max={160} value={zoom} onChange={e => setZoom(Number(e.target.value))} />
            <span style={{ width: 36, textAlign: 'right' }}>{zoom}%</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Desplazamiento</span>
            <input type="range" min={0} max={Math.max(0, maxScrollX)} value={Math.min(scrollX, maxScrollX)} onChange={e => onSlide(e.target.value)} style={{ width: 240 }} />
          </label>
          <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={saveBack}>💾 Guardar</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Columna de personal:</span>
          <select value={personalCol} onChange={e => setPersonalCol(e.target.value)}>
            <option value="">—</option>
            {columns.map(c => (<option key={c} value={c}>{c}</option>))}
          </select>
        </label>
        {columns.map(c => (
          <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#555' }}>{c}</label>
            <input type="number" min={60} max={600} value={widths[c] || 160} onChange={e => setWidths(w => ({ ...w, [c]: Number(e.target.value) }))} style={{ width: 80 }} />
            <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => setHidden(h => ({ ...h, [c]: !h[c] }))}>{hidden[c] ? 'Mostrar' : 'Ocultar'}</button>
            <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => move(c, 'left')}>←</button>
            <button className="menu-button btn-sm" style={{ width: 'auto' }} onClick={() => move(c, 'right')}>→</button>
            <button className="menu-button btn-sm" style={{ width: 'auto', borderColor: '#fca5a5', background: '#fee2e2' }} onClick={() => removeCol(c)}>✖</button>
          </div>
        ))}
      </div>

      <div ref={wrapRef} className="table-wrapper" style={{ overflowX: 'auto' }} onScroll={onScrollWrap}>
        <table className="table" style={{ tableLayout: 'auto', fontSize: `${zoom/100*14}px` }}>
          <thead>
            <tr>
              {visibleCols.map(c => (
                <th key={c} style={{ minWidth: (widths[c] || 160) }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {visibleCols.map(c => (
                  <td key={c} style={{ minWidth: (widths[c] || 160) }}>
                    <input value={r[c] ?? ''} onChange={e => setCell(i, c, e.target.value)} style={{ width: '100%' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
