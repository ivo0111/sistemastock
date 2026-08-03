import { useState, useEffect, useCallback } from 'react'
import { get, del } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { Link, useNavigate } from 'react-router-dom'

export default function ProductosList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [productos, setProductos] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [stockBajo, setStockBajo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [seleccionados, setSeleccionados] = useState([])
  const limit = 20
  const isAdmin = user?.rol === 'admin' || user?.rol === 'dueño'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get('/productos', { page, limit, busqueda: busqueda || undefined, stock_bajo: stockBajo || undefined })
      setProductos(res.data)
      setTotal(res.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, busqueda, stockBajo])

  useEffect(() => { load() }, [load])

  // La selección de etiquetas se resetea al cambiar de página o filtro, para
  // no arrastrar ids que ya no están visibles y confundir al usuario sobre
  // qué va a imprimir.
  useEffect(() => { setSeleccionados([]) }, [page, busqueda, stockBajo])

  function toggleSeleccionado(id) {
    setSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleTodos() {
    setSeleccionados(prev => prev.length === productos.length ? [] : productos.map(p => p.id))
  }

  function handleImprimirEtiquetas() {
    if (seleccionados.length === 0) return
    window.open(`/productos/etiquetas?ids=${seleccionados.join(',')}`, '_blank')
  }

  async function handleDelete(id, nombre) {
    if (!confirm(`¿Dar de baja el producto "${nombre}"?`)) return
    try {
      await del(`/productos/${id}`)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Productos ({total})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-outline"
              disabled={seleccionados.length === 0}
              onClick={handleImprimirEtiquetas}
            >
              Imprimir etiquetas{seleccionados.length > 0 ? ` (${seleccionados.length})` : ''}
            </button>
            {isAdmin && (
              <Link to="/productos/nuevo" className="btn btn-primary">+ Nuevo Producto</Link>
            )}
          </div>
        </div>

        <div className="form-inline mb-4">
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <input
              className="form-control"
              placeholder="Buscar por nombre o SKU..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPage(1) }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={stockBajo} onChange={e => { setStockBajo(e.target.checked); setPage(1) }} />
            Stock bajo
          </label>
        </div>

        {loading ? <div className="loading">Cargando...</div> : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input
                        type="checkbox"
                        checked={productos.length > 0 && seleccionados.length === productos.length}
                        onChange={toggleTodos}
                      />
                    </th>
                    <th>SKU</th>
                    <th>Nombre</th>
                    <th>Categoría</th>
                    <th>P. Costo</th>
                    <th>P. Venta</th>
                    <th>Stock</th>
                    <th>Stock Mín.</th>
                    <th>Estado</th>
                    {isAdmin && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/productos/${p.id}/editar`)}>
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={seleccionados.includes(p.id)}
                          onChange={() => toggleSeleccionado(p.id)}
                        />
                      </td>
                      <td>{p.sku}</td>
                      <td>{p.nombre}</td>
                      <td>{p.categoria?.nombre || '-'}</td>
                      <td>${Number(p.precioCosto).toFixed(2)}</td>
                      <td>${Number(p.precioVenta).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${p.stockActual <= p.stockMinimo ? 'badge-danger' : 'badge-success'}`}>
                          {p.stockActual}
                        </span>
                      </td>
                      <td>{p.stockMinimo}</td>
                      <td>
                        <span className={`badge ${p.activo ? 'badge-success' : 'badge-danger'}`}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={e => { e.stopPropagation(); handleDelete(p.id, p.nombre) }}
                            disabled={!p.activo}
                          >
                            Dar de baja
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {productos.length === 0 && (
                    <tr><td colSpan={isAdmin ? 10 : 9} style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>No hay productos</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
                <span style={{ padding: '4px 8px', fontSize: 13, color: 'var(--gray-500)' }}>Pág. {page} de {totalPages}</span>
                <button className="btn btn-sm btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}