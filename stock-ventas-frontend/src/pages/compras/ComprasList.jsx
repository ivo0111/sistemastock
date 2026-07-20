import { useState, useEffect, useCallback } from 'react'
import { get } from '../../api/client'
import { useNavigate } from 'react-router-dom'

export default function ComprasList() {
  const navigate = useNavigate()
  const [compras, setCompras] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get('/compras', { page, limit })
      setCompras(res.data)
      setTotal(res.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Compras ({total})</span>
        <button className="btn btn-primary" onClick={() => navigate('/compras/nueva')}>+ Nueva Compra</button>
      </div>

      {loading ? <div className="loading">Cargando...</div> : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {compras.map(c => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/compras/${c.id}`)}>
                    <td>#{c.id}</td>
                    <td>{new Date(c.fecha).toLocaleString('es-AR')}</td>
                    <td>{c.proveedor?.nombre || `#${c.proveedorId}`}</td>
                    <td style={{ fontWeight: 600 }}>${Number(c.total).toFixed(2)}</td>
                    <td><span className="badge badge-success">{c.estado}</span></td>
                    <td>{c.items?.length ?? '-'}</td>
                  </tr>
                ))}
                {compras.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>No hay compras registradas</td></tr>
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