import { useState, useEffect, useCallback } from 'react'
import { get } from '../../api/client'
import { useNavigate } from 'react-router-dom'

export default function VentasList() {
  const navigate = useNavigate()
  const [ventas, setVentas] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [estado, setEstado] = useState('')
  const [loading, setLoading] = useState(true)
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get('/ventas', { page, limit, desde: desde || undefined, hasta: hasta || undefined, estado: estado || undefined })
      setVentas(res.data)
      setTotal(res.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, desde, hasta, estado])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Historial de Ventas ({total})</span>
        <button className="btn btn-primary" onClick={() => navigate('/ventas/nueva')}>+ Nueva Venta</button>
      </div>

      <div className="form-inline mb-4">
        <div className="form-group" style={{ margin: 0 }}>
          <input className="form-control" type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1) }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <input className="form-control" type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1) }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <select className="form-control" value={estado} onChange={e => { setEstado(e.target.value); setPage(1) }}>
            <option value="">Todos los estados</option>
            <option value="CONFIRMADA">Confirmada</option>
            <option value="ANULADA">Anulada</option>
          </select>
        </div>
      </div>

      {loading ? <div className="loading">Cargando...</div> : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th>Estado</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => (
                  <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/ventas/${v.id}`)}>
                    <td>#{v.id}</td>
                    <td>{new Date(v.fecha).toLocaleString('es-AR')}</td>
                    <td>{v.cliente?.nombre || 'Mostrador'}</td>
                    <td>{v.items?.length ?? '-'}</td>
                    <td style={{ fontWeight: 600 }}>${Number(v.total).toFixed(2)}</td>
                    <td>{v.formaPago}</td>
                    <td>
                      <span className={`badge ${v.estado === 'CONFIRMADA' ? 'badge-success' : 'badge-danger'}`}>
                        {v.estado}
                      </span>
                    </td>
                    <td>{v.usuario?.nombre || '-'}</td>
                  </tr>
                ))}
                {ventas.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>No hay ventas registradas</td></tr>
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
  )
}