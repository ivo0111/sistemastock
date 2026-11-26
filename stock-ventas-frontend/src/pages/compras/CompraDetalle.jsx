import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { get, getBlob } from '../../api/client'

function moneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(Number(valor || 0))
}

export default function CompraDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [compra, setCompra] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    get(`/compras/${id}`)
      .then(setCompra)
      .catch((err) => setError(err.message || 'No se pudo cargar la compra'))
      .finally(() => setLoading(false))
  }, [id])

  async function verFactura() {
    if (!compra?.importacion) return
    try {
      const blob = await getBlob(`/compras/importaciones/${compra.importacion.id}/archivo`)
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.target = '_blank'
      enlace.rel = 'noopener'
      enlace.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      setError(err.message || 'No se pudo abrir el PDF')
    }
  }

  if (loading) return <div className="loading">Cargando...</div>
  if (!compra) return <div className="alert alert-error">{error || 'Compra no encontrada'}</div>

  const comprobante = compra.tipoComprobante
    ? `${compra.tipoComprobante} ${compra.puntoVenta ?? ''}-${compra.numeroComprobante ?? ''}`.trim()
    : '-'
  const fechaComprobante = compra.fechaComprobante
    ? new Date(compra.fechaComprobante).toLocaleDateString('es-AR')
    : '-'

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Compra #{compra.id}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {compra.importacion && (
              <button className="btn btn-sm btn-outline" onClick={verFactura}>
                Ver factura PDF
              </button>
            )}
            <button className="btn btn-outline" onClick={() => navigate('/compras')}>Volver</button>
          </div>
        </div>

        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div>
            <div className="text-sm text-gray">Fecha de registro</div>
            <div>{new Date(compra.fecha).toLocaleString('es-AR')}</div>
          </div>
          <div>
            <div className="text-sm text-gray">Estado</div>
            <div>
              <span className="badge badge-success">{compra.estado}</span>{' '}
              <span className={`badge ${compra.origen === 'IMPORTADA' ? 'badge-info' : 'badge-warning'}`}>
                {compra.origen === 'IMPORTADA' ? 'Importada' : 'Manual'}
              </span>
            </div>
          </div>
          <div>
            <div className="text-sm text-gray">Proveedor</div>
            <div>{compra.proveedor?.nombre || `#${compra.proveedorId}`}</div>
          </div>
          <div>
            <div className="text-sm text-gray">Total</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{moneda(compra.total)}</div>
          </div>
          <div>
            <div className="text-sm text-gray">Comprobante</div>
            <div>{comprobante}</div>
          </div>
          <div>
            <div className="text-sm text-gray">Fecha del comprobante</div>
            <div>{fechaComprobante}</div>
          </div>
        </div>

        {compra.origen === 'IMPORTADA' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              padding: 12,
              background: 'var(--gray-50)',
              border: '1px solid var(--gray-200)',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <div>
              <div className="text-sm text-gray">CUIT del proveedor</div>
              <div>{compra.proveedorCuit || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray">Subtotal</div>
              <div>{compra.subtotal !== null ? moneda(compra.subtotal) : '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray">IVA</div>
              <div>{compra.iva !== null ? moneda(compra.iva) : '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray">Percepciones</div>
              <div>{compra.percepciones !== null ? moneda(compra.percepciones) : '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray">CAE</div>
              <div>{compra.cae || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray">Archivo</div>
              <div>{compra.importacion?.nombreArchivo || `Importación #${compra.importacion?.id}`}</div>
            </div>
          </div>
        )}
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
                <th>IVA %</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {compra.items?.map(item => (
                <tr key={item.id}>
                  <td>
                    <div>{item.producto?.nombre || `#${item.productoId}`}</div>
                    {item.descripcion && item.descripcion !== item.producto?.nombre && (
                      <div className="text-sm text-gray">
                        Factura: {item.descripcion}
                        {item.codigoProveedor ? ` (${item.codigoProveedor})` : ''}
                      </div>
                    )}
                  </td>
                  <td>{item.cantidad}</td>
                  <td>{moneda(item.precioUnitario)}</td>
                  <td>{item.alicuotaIva !== null && item.alicuotaIva !== undefined ? `${Number(item.alicuotaIva)}%` : '-'}</td>
                  <td style={{ fontWeight: 600 }}>{moneda(item.cantidad * Number(item.precioUnitario))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
