import { useState, useEffect, useCallback } from 'react'
import { get } from '../../api/client'

const TIPOS = ['', 'venta', 'compra', 'ajuste', 'devolucion', 'ajuste_inicial']
const TIPO_LABELS = { venta: 'Venta', compra: 'Compra', ajuste: 'Ajuste', devolucion: 'Devolución', ajuste_inicial: 'Ajuste Inicial' }

export default function Movimientos() {
  const [movimientos, setMovimientos] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [tipo, setTipo] = useState('')
  const [productoId, setProductoId] = useState('')
  const [loading, setLoading] = useState(true)
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get('/stock/movimientos', { page, limit, tipo: tipo || undefined, producto_id: productoId || undefined })
      setMovimientos(res.data)
      setTotal(res.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, tipo, productoId])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Movimientos de Stock ({total})</span>
      </div>

      <div className="form-inline mb-4">
        <div className="form-group" style={{ margin: 0 }}>
          <select className="form-control" value={tipo} onChange={e => { setTipo(e.target.value); setPage(1) }}>
            <option value="">Todos los tipos</option>
            {TIPOS.filter(Boolean).map(t => (
              <option key={t} value={t}>{TIPO_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <input className="form-control" placeholder="ID de producto" value={productoId} onChange={e => { setProductoId(e.target.value); setPage(1) }} />
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
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Usuario</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map(m => (
                  <tr key={m.id}>
                    <td>{m.id}</td>
                    <td>{new Date(m.fecha).toLocaleString('es-AR')}</td>
                    <td>{m.producto_nombre || `#${m.producto_id}`}</td>
                    <td><span className={`badge ${m.tipo === 'ajuste' ? 'badge-warning' : m.tipo === 'venta' ? 'badge-danger' : 'badge-info'}`}>{TIPO_LABELS[m.tipo] || m.tipo}</span></td>
                    <td style={{ color: m.cantidad < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                      {m.cantidad > 0 ? '+' : ''}{m.cantidad}
                    </td>
                    <td>{m.usuario_nombre || `#${m.usuario_id}`}</td>
                    <td className="text-sm text-gray">{m.motivo || '-'}</td>
                  </tr>
                ))}
                {movimientos.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>No hay movimientos</td></tr>
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