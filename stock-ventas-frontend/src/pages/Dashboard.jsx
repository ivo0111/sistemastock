import { useState, useEffect } from 'react'
import { get } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { Link, useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [stockBajo, setStockBajo] = useState([])
  const [caja, setCaja] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [ventasHoy, bajos, cajaActual] = await Promise.allSettled([
          get('/reportes/ventas', { desde: new Date().toISOString().slice(0, 10), hasta: new Date(Date.now() + 86400000).toISOString().slice(0, 10) }),
          get('/reportes/stock-bajo'),
          get('/caja/actual'),
        ])
        if (ventasHoy.status === 'fulfilled') setStats(ventasHoy.value)
        if (bajos.status === 'fulfilled') setStockBajo(bajos.value || [])
        if (cajaActual.status === 'fulfilled') setCaja(cajaActual.value)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="loading">Cargando dashboard...</div>

  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>Bienvenido, {user?.nombre}</h2>
      <p className="text-sm text-gray" style={{ marginBottom: 24 }}>
        {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      <div className="grid-4 mb-4">
        <div className="stat-card">
          <div className="stat-label">Ventas Hoy</div>
          <div className="stat-value">
            {stats?.data?.length > 0
              ? `$${stats.data.reduce((s, r) => s + Number(r.total), 0).toLocaleString('es-AR')}`
              : '$0'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ventas Realizadas</div>
          <div className="stat-value">
            {stats?.data?.length > 0
              ? stats.data.reduce((s, r) => s + Number(r.cantidadVentas), 0)
              : 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stock Bajo</div>
          <div className="stat-value" style={{ color: stockBajo.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {stockBajo.length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Caja</div>
          <div className="stat-value" style={{ fontSize: 22 }}>
            {caja?.abierta ? `$${Number(caja.totalEsperadoHastaAhora || 0).toLocaleString('es-AR')}` : 'Cerrada'}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Productos con Stock Bajo</span>
            <Link to="/productos" className="btn btn-sm btn-outline">Ver todos</Link>
          </div>
          {stockBajo.length === 0 ? (
            <p className="text-sm text-gray">No hay productos con stock bajo.</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th>Stock</th>
                    <th>Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {stockBajo.slice(0, 10).map(p => (
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
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Acciones Rápidas</span>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => navigate('/ventas/nueva')}>
              Nueva Venta (POS)
            </button>
            <button className="btn btn-success" onClick={() => navigate('/compras/nueva')}>
              Registrar Compra
            </button>
            <button className="btn btn-outline" onClick={() => navigate('/stock/ajuste')}>
              Ajustar Stock
            </button>
            <button className="btn btn-outline" onClick={() => navigate('/caja')}>
              {caja?.abierta ? 'Cerrar Caja' : 'Abrir Caja'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}