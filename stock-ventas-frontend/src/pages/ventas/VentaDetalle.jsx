import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { get, post, getHtml } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

export default function VentaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [venta, setVenta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [anulando, setAnulando] = useState(false)
  const [error, setError] = useState('')
  const isAdmin = user?.rol === 'admin' || user?.rol === 'dueño'

  useEffect(() => {
    get(`/ventas/${id}`)
      .then(setVenta)
      .finally(() => setLoading(false))
  }, [id])

  async function handleAnular() {
    if (!motivoAnulacion.trim()) return
    if (!confirm('¿Estás seguro de anular esta venta? Se revertirá el stock.')) return
    setError('')
    setAnulando(true)
    try {
      await post(`/ventas/${id}/anular`, { motivo: motivoAnulacion.trim() })
      const updated = await get(`/ventas/${id}`)
      setVenta(updated)
      setMotivoAnulacion('')
    } catch (err) {
      setError(err.message)
    } finally {
      setAnulando(false)
    }
  }

  if (loading) return <div className="loading">Cargando...</div>
  if (!venta) return <div className="alert alert-error">Venta no encontrada</div>

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Venta #{venta.id}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => navigate('/ventas')}>Volver</button>
            <button className="btn btn-outline" onClick={async () => {
              try {
                const html = await getHtml(`/ventas/${venta.id}/comprobante`)
                const win = window.open('', '_blank')
                win.document.write(html)
                win.document.close()
              } catch (err) {
                setError(err.message)
              }
            }}>
              Comprobante
            </button>
          </div>
        </div>

        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div>
            <div className="text-sm text-gray">Fecha</div>
            <div>{new Date(venta.fecha).toLocaleString('es-AR')}</div>
          </div>
          <div>
            <div className="text-sm text-gray">Estado</div>
            <div>
              <span className={`badge ${venta.estado === 'CONFIRMADA' ? 'badge-success' : 'badge-danger'}`}>
                {venta.estado === 'CONFIRMADA' ? 'Confirmada' : 'Anulada'}
              </span>
            </div>
          </div>
          <div>
            <div className="text-sm text-gray">Forma de Pago</div>
            <div style={{ textTransform: 'capitalize' }}>{venta.formaPago?.toLowerCase()}</div>
          </div>
          <div>
            <div className="text-sm text-gray">Cliente</div>
            <div>{venta.cliente?.nombre || 'Mostrador'}</div>
          </div>
          <div>
            <div className="text-sm text-gray">Descuento</div>
            <div>${Number(venta.descuento || 0).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-gray">Total</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>${Number(venta.total).toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Items</span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Cantidad</th>
                <th>P. Unitario</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {venta.items?.map(item => (
                <tr key={item.id || item.productoId}>
                  <td>{item.producto?.nombre || `#${item.productoId}`}</td>
                  <td>{item.producto?.sku || '-'}</td>
                  <td>{item.cantidad}</td>
                  <td>${Number(item.precioUnitario).toFixed(2)}</td>
                  <td style={{ fontWeight: 600 }}>${(item.cantidad * Number(item.precioUnitario)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {venta.estado === 'CONFIRMADA' && isAdmin && (
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ color: 'var(--danger)' }}>Anular Venta</span>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label>Motivo de anulación</label>
            <textarea className="form-control" rows={2} value={motivoAnulacion} onChange={e => setMotivoAnulacion(e.target.value)} />
          </div>
          <button className="btn btn-danger" disabled={anulando || !motivoAnulacion.trim()} onClick={handleAnular}>
            {anulando ? 'Anulando...' : 'Anular Venta'}
          </button>
        </div>
      )}
    </div>
  )
}