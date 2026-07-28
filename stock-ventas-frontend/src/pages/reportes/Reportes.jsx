import { useState } from 'react'
import { get } from '../../api/client'

export default function Reportes() {
  const [tab, setTab] = useState('ventas')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const [desdeVentas, setDesdeVentas] = useState('')
  const [hastaVentas, setHastaVentas] = useState('')
  const [agruparPor, setAgruparPor] = useState('dia')

  const [desdeProd, setDesdeProd] = useState('')
  const [hastaProd, setHastaProd] = useState('')
  const [limit, setLimit] = useState(10)

  const [desdeMargen, setDesdeMargen] = useState('')
  const [hastaMargen, setHastaMargen] = useState('')

  async function loadReporte() {
    setLoading(true)
    setData(null)
    try {
      let res
      if (tab === 'ventas') {
        res = await get('/reportes/ventas', { desde: desdeVentas || undefined, hasta: hastaVentas || undefined, agrupar_por: agruparPor })
      } else if (tab === 'productos') {
        res = await get('/reportes/productos-mas-vendidos', { desde: desdeProd || undefined, hasta: hastaProd || undefined, limit })
      } else if (tab === 'margen') {
        res = await get('/reportes/margen', { desde: desdeMargen || undefined, hasta: hastaMargen || undefined })
      } else if (tab === 'stock-bajo') {
        res = await get('/reportes/stock-bajo')
      }
      setData(res?.data || res || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function renderVentas() {
    if (!Array.isArray(data)) return null
    const totalGeneral = data.reduce((s, r) => s + Number(r.total), 0)
    const cantVentas = data.reduce((s, r) => s + Number(r.cantidadVentas || 0), 0)
    return (
      <div>
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-label">Total del período</div>
            <div className="stat-value">${totalGeneral.toLocaleString('es-AR')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Cant. Ventas</div>
            <div className="stat-value">{cantVentas}</div>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Período</th>
                <th>Total</th>
                <th>Cant. Ventas</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td>{r.periodo}</td>
                  <td>${Number(r.total).toFixed(2)}</td>
                  <td>{r.cantidadVentas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function renderProductos() {
    if (!Array.isArray(data)) return null
    return (
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cant. Vendida</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i}>
                <td>{r.nombre}</td>
                <td>{r.cantidadVendida}</td>
                <td>${Number(r.totalVendido || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  function renderMargen() {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return (
      <div>
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-label">Ventas</div>
            <div className="stat-value">${Number(data.totalVentas || 0).toLocaleString('es-AR')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Costo</div>
            <div className="stat-value">${Number(data.totalCosto || 0).toLocaleString('es-AR')}</div>
          </div>
        </div>
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-label">Ganancia Bruta</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>${Number(data.gananciaBruta || 0).toLocaleString('es-AR')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Margen %</div>
            <div className="stat-value">{data.margenPorcentaje ? `${Number(data.margenPorcentaje).toFixed(1)}%` : '-'}</div>
          </div>
        </div>
        {data.nota && <div className="text-sm text-gray" style={{ marginTop: 8 }}>{data.nota}</div>}
      </div>
    )
  }

  function renderStockBajo() {
    if (!Array.isArray(data)) return null
    return (
      <div>
        <div className="stat-card" style={{ marginBottom: 16 }}>
          <div className="stat-label">Productos con stock bajo</div>
          <div className="stat-value">{data.length}</div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Stock Actual</th>
                <th>Stock Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {data.map(p => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.sku}</td>
                  <td><span className="badge badge-danger">{p.stock_actual}</span></td>
                  <td>{p.stock_minimo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Reportes</span>
      </div>

      <div className="tabs">
        {[
          { key: 'ventas', label: 'Ventas' },
          { key: 'productos', label: 'Más Vendidos' },
          { key: 'margen', label: 'Margen' },
          { key: 'stock-bajo', label: 'Stock Bajo' },
        ].map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => { setTab(t.key); setData(null) }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="form-inline mb-4" style={{ flexWrap: 'wrap' }}>
        {tab === 'ventas' && (
          <>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="text-sm">Desde</label>
              <input className="form-control" type="date" value={desdeVentas} onChange={e => setDesdeVentas(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="text-sm">Hasta</label>
              <input className="form-control" type="date" value={hastaVentas} onChange={e => setHastaVentas(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="text-sm">Agrupar</label>
              <select className="form-control" value={agruparPor} onChange={e => setAgruparPor(e.target.value)}>
                <option value="dia">Día</option>
                <option value="semana">Semana</option>
                <option value="mes">Mes</option>
              </select>
            </div>
          </>
        )}
        {tab === 'productos' && (
          <>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="text-sm">Desde</label>
              <input className="form-control" type="date" value={desdeProd} onChange={e => setDesdeProd(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="text-sm">Hasta</label>
              <input className="form-control" type="date" value={hastaProd} onChange={e => setHastaProd(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="text-sm">Límite</label>
              <input className="form-control" type="number" value={limit} onChange={e => setLimit(e.target.value)} style={{ width: 80 }} />
            </div>
          </>
        )}
        {tab === 'margen' && (
          <>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="text-sm">Desde</label>
              <input className="form-control" type="date" value={desdeMargen} onChange={e => setDesdeMargen(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="text-sm">Hasta</label>
              <input className="form-control" type="date" value={hastaMargen} onChange={e => setHastaMargen(e.target.value)} />
            </div>
          </>
        )}
        <div className="form-group" style={{ margin: 0, alignSelf: tab === 'stock-bajo' ? 'center' : 'flex-end' }}>
          <button className="btn btn-primary" onClick={loadReporte} disabled={loading}>
            {loading ? 'Cargando...' : 'Generar Reporte'}
          </button>
        </div>
      </div>

      {loading && <div className="loading">Generando reporte...</div>}
      {!loading && data && (
        <>
          {tab === 'ventas' && renderVentas()}
          {tab === 'productos' && renderProductos()}
          {tab === 'margen' && renderMargen()}
          {tab === 'stock-bajo' && renderStockBajo()}
        </>
      )}
      {!loading && !data && (
        <div className="empty-state">Seleccioná un reporte y hacé clic en "Generar Reporte"</div>
      )}
    </div>
  )
}