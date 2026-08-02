import { useState, useEffect } from 'react'
import { get, post, put, del } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

const CONDICIONES_IVA = [
  { value: '', label: '(Sin especificar)' },
  { value: 'RESPONSABLE_INSCRIPTO', label: 'Responsable Inscripto' },
  { value: 'MONOTRIBUTO', label: 'Monotributo' },
  { value: 'CONSUMIDOR_FINAL', label: 'Consumidor Final' },
  { value: 'EXENTO', label: 'Exento' },
]

const INITIAL = { nombre: '', telefono: '', email: '', cuit: '', condicionIva: '' }
const INITIAL_AJUSTE = { monto: '', motivo: '', tipo: 'CARGO' }

export default function Clientes() {
  const { user } = useAuth()
  const isAdmin = user?.rol === 'admin' || user?.rol === 'dueño' || user?.rol === 'dueno'

  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [form, setForm] = useState(INITIAL)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  const [historial, setHistorial] = useState(null)

  const [cuentaCorriente, setCuentaCorriente] = useState(null) // { cliente, movimientos, error }
  const [cuentaLoading, setCuentaLoading] = useState(false)

  const [ajuste, setAjuste] = useState(null) // cliente sobre el que se está ajustando
  const [ajusteForm, setAjusteForm] = useState(INITIAL_AJUSTE)
  const [ajusteError, setAjusteError] = useState('')
  const [guardandoAjuste, setGuardandoAjuste] = useState(false)

  function load() {
    setLoading(true)
    setLoadError('')
    get('/clientes')
      .then(r => setClientes(r.data || r || []))
      .catch(err => setLoadError(err.message || 'Error al cargar clientes'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  function openNew() {
    setForm(INITIAL)
    setEditId(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(cliente) {
    setForm({
      nombre: cliente.nombre,
      telefono: cliente.telefono || '',
      email: cliente.email || '',
      cuit: cliente.cuit || '',
      condicionIva: cliente.condicionIva || '',
    })
    setEditId(cliente.id)
    setError('')
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    // condicionIva es un enum opcional: si quedó vacío no lo mandamos,
    // para no romper la validación Zod del backend (que espera uno de
    // los valores del enum o directamente ausencia del campo).
    const payload = { ...form, condicionIva: form.condicionIva || null }
    try {
      if (editId) {
        await put(`/clientes/${editId}`, payload)
      } else {
        await post('/clientes', payload)
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(cliente) {
    if (!confirm(`¿Eliminar al cliente "${cliente.nombre}"?`)) return
    try {
      await del(`/clientes/${cliente.id}`)
      load()
    } catch (err) {
      alert(err.message)
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

  async function verCuentaCorriente(cliente) {
    setCuentaLoading(true)
    setCuentaCorriente({ cliente, movimientos: [], error: null })
    try {
      const res = await get(`/clientes/${cliente.id}/cuenta-corriente/movimientos`)
      setCuentaCorriente({ cliente, movimientos: res.data || res || [], error: null })
    } catch (err) {
      setCuentaCorriente(prev => prev ? { ...prev, error: err.message } : null)
    } finally {
      setCuentaLoading(false)
    }
  }

  function openAjuste(cliente) {
    setAjuste(cliente)
    setAjusteForm(INITIAL_AJUSTE)
    setAjusteError('')
  }

  async function handleGuardarAjuste(e) {
    e.preventDefault()
    setAjusteError('')
    const montoAbs = Math.abs(Number(ajusteForm.monto))
    if (!montoAbs) {
      setAjusteError('El monto no puede ser 0')
      return
    }
    // Un cargo aumenta la deuda del cliente (positivo); un pago la reduce (negativo).
    // El usuario siempre ingresa el monto en positivo, el signo se calcula acá.
    const monto = ajusteForm.tipo === 'PAGO' ? -montoAbs : montoAbs
    setGuardandoAjuste(true)
    try {
      await post(`/clientes/${ajuste.id}/cuenta-corriente/ajuste`, {
        monto,
        motivo: ajusteForm.motivo.trim(),
        tipo: ajusteForm.tipo,
      })
      setAjuste(null)
      load()
      // Si el modal de movimientos de este cliente está abierto, lo refrescamos
      if (cuentaCorriente?.cliente.id === ajuste.id) {
        const clienteRes = await get(`/clientes/${ajuste.id}`)
        const fresco = clienteRes.data || clienteRes
        const movRes = await get(`/clientes/${ajuste.id}/cuenta-corriente/movimientos`)
        setCuentaCorriente({
          cliente: fresco,
          movimientos: movRes.data || movRes || [],
          error: null,
        })
      }
    } catch (err) {
      setAjusteError(err.message)
    } finally {
      setGuardandoAjuste(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Clientes</span>
        <button className="btn btn-primary" onClick={openNew}>+ Nuevo</button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editId ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Nombre</label>
                <input className="form-control" name="nombre" value={form.nombre} onChange={handleChange} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Teléfono</label>
                  <input className="form-control" name="telefono" value={form.telefono} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input className="form-control" name="email" type="email" value={form.email} onChange={handleChange} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>CUIT</label>
                  <input className="form-control" name="cuit" placeholder="Ej: 20304050607" value={form.cuit} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Condición frente al IVA</label>
                  <select className="form-control" name="condicionIva" value={form.condicionIva} onChange={handleChange}>
                    {CONDICIONES_IVA.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
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

      {cuentaCorriente && (
        <div className="modal-overlay" onClick={() => setCuentaCorriente(null)}>
          <div className="modal" style={{ maxWidth: 650 }} onClick={e => e.stopPropagation()}>
            <h2>Cuenta Corriente: {cuentaCorriente.cliente.nombre}</h2>
            <p className="text-sm text-gray" style={{ marginTop: -8, marginBottom: 12 }}>
              Saldo actual:{' '}
              <strong style={{ color: Number(cuentaCorriente.cliente.cuentaCorrienteSaldo) < 0 ? 'var(--success)' : 'var(--danger)' }}>
                ${Number(cuentaCorriente.cliente.cuentaCorrienteSaldo || 0).toFixed(2)}
              </strong>
            </p>

            {cuentaLoading ? (
              <div className="loading">Cargando...</div>
            ) : cuentaCorriente.error ? (
              <div className="alert alert-error">{cuentaCorriente.error}</div>
            ) : cuentaCorriente.movimientos.length === 0 ? (
              <p className="text-sm text-gray">Sin movimientos registrados</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Monto</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentaCorriente.movimientos.map(m => (
                      <tr key={m.id}>
                        <td>{new Date(m.fecha).toLocaleString('es-AR')}</td>
                        <td>
                          <span className={`badge ${m.tipo === 'PAGO' ? 'badge-success' : m.tipo === 'CARGO' ? 'badge-danger' : 'badge-info'}`}>
                            {m.tipo}
                          </span>
                        </td>
                        <td style={{ color: Number(m.monto) < 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                          ${Number(m.monto).toFixed(2)}
                        </td>
                        <td>{m.motivo || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-actions">
              {isAdmin && (
                <button
                  className="btn btn-primary"
                  onClick={() => { const c = cuentaCorriente.cliente; setCuentaCorriente(null); openAjuste(c) }}
                >
                  + Registrar Ajuste
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setCuentaCorriente(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {ajuste && (
        <div className="modal-overlay" onClick={() => setAjuste(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Ajuste de Cuenta Corriente: {ajuste.nombre}</h2>
            {ajusteError && <div className="alert alert-error">{ajusteError}</div>}
            <form onSubmit={handleGuardarAjuste}>
              <div className="form-group">
                <label>Tipo</label>
                <select
                  className="form-control"
                  value={ajusteForm.tipo}
                  onChange={e => setAjusteForm({ ...ajusteForm, tipo: e.target.value })}
                >
                  <option value="CARGO">Cargo (aumenta la deuda del cliente)</option>
                  <option value="PAGO">Pago (reduce la deuda del cliente)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Monto</label>
                <input
                  className="form-control"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Ej: 5000"
                  value={ajusteForm.monto}
                  onChange={e => setAjusteForm({ ...ajusteForm, monto: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Motivo</label>
                <input
                  className="form-control"
                  value={ajusteForm.motivo}
                  onChange={e => setAjusteForm({ ...ajusteForm, motivo: e.target.value })}
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setAjuste(null)}>Cancelar</button>
                <button className="btn btn-primary" disabled={guardandoAjuste}>
                  {guardandoAjuste ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <div className="loading">Cargando...</div> : (
        <>
          {loadError && <div className="alert alert-error">{loadError}</div>}
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
                  <td style={{ color: Number(c.cuentaCorrienteSaldo) < 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    ${Number(c.cuentaCorrienteSaldo || 0).toFixed(2)}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => verHistorial(c)}>Historial</button>{' '}
                    {isAdmin && (
                      <button className="btn btn-sm btn-outline" onClick={() => verCuentaCorriente(c)}>Cta. Cte.</button>
                    )}{' '}
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(c)}>Editar</button>{' '}
                    {isAdmin && (
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c)}>Eliminar</button>
                    )}
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--gray-400)' }}>Sin clientes</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}