import { useState, useEffect } from 'react'
import { get, post } from '../../api/client'

const INITIAL = { nombre: '', telefono: '', cuenta_corriente_saldo: 0 }

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(INITIAL)
  const [showForm, setShowForm] = useState(false)
  const [historial, setHistorial] = useState(null)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    get('/clientes')
      .then(r => setClientes(r.data || r || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    try {
      await post('/clientes', { ...form, cuenta_corriente_saldo: Number(form.cuenta_corriente_saldo) })
      setShowForm(false)
      setForm(INITIAL)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function verHistorial(cliente) {
    try {
      const res = await get(`/clientes/${cliente.id}/historial`)
      setHistorial({ cliente, ventas: res.data || res || [] })
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Clientes</span>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nuevo</button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Nuevo Cliente</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Nombre</label>
                <input className="form-control" name="nombre" value={form.nombre} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Teléfono</label>
                <input className="form-control" name="telefono" value={form.telefono} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Saldo cuenta corriente</label>
                <input className="form-control" name="cuenta_corriente_saldo" type="number" step="0.01" value={form.cuenta_corriente_saldo} onChange={handleChange} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancelar</button>
                <button className="btn btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {historial && (
        <div className="modal-overlay" onClick={() => setHistorial(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <h2>Historial: {historial.cliente.nombre}</h2>
            {historial.ventas.length === 0 ? (
              <p className="text-sm text-gray">Sin ventas registradas</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Fecha</th>
                      <th>Total</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.ventas.map(v => (
                      <tr key={v.id}>
                        <td>#{v.id}</td>
                        <td>{new Date(v.fecha).toLocaleString('es-AR')}</td>
                        <td>${Number(v.total).toFixed(2)}</td>
                        <td><span className={`badge ${v.estado === 'confirmada' ? 'badge-success' : 'badge-danger'}`}>{v.estado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setHistorial(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="loading">Cargando...</div> : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Saldo Cta. Cte.</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td>{c.telefono || '-'}</td>
                  <td style={{ color: Number(c.cuenta_corriente_saldo) < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                    ${Number(c.cuenta_corriente_saldo || 0).toFixed(2)}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => verHistorial(c)}>Historial</button>
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--gray-400)' }}>Sin clientes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}