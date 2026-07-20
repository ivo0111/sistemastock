import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { get } from '../../api/client'

export default function CompraDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [compra, setCompra] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    get(`/compras/${id}`)
      .then(setCompra)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="loading">Cargando...</div>
  if (!compra) return <div className="alert alert-error">Compra no encontrada</div>

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Compra #{compra.id}</span>
          <button className="btn btn-outline" onClick={() => navigate('/compras')}>Volver</button>
        </div>

        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div>
            <div className="text-sm text-gray">Fecha</div>
            <div>{new Date(compra.fecha).toLocaleString('es-AR')}</div>
          </div>
          <div>
            <div className="text-sm text-gray">Estado</div>
            <div>
              <span className="badge badge-success">{compra.estado}</span>
            </div>
          </div>
          <div>
            <div className="text-sm text-gray">Proveedor</div>
            <div>{compra.proveedor?.nombre || `#${compra.proveedorId}`}</div>
          </div>
          <div>
            <div className="text-sm text-gray">Total</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>${Number(compra.total).toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Items</span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>P. Unitario</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {compra.items?.map(item => (
                <tr key={item.id}>
                  <td>{item.producto?.nombre || `#${item.productoId}`}</td>
                  <td>{item.cantidad}</td>
                  <td>${Number(item.precioUnitario).toFixed(2)}</td>
                  <td style={{ fontWeight: 600 }}>${(item.cantidad * Number(item.precioUnitario)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
