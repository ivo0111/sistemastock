import { useState, useEffect } from 'react'
import { get, post, put } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

const INITIAL = { nombre: '', usuario: '', password: '', rol: 'VENDEDOR' }

export default function Usuarios() {
  const { user } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(INITIAL)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    get('/usuarios')
      .then(r => setUsuarios(r.data || r || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  function openNew() {
    setForm(INITIAL)
    setEditId(null)
    setShowForm(true)
  }

  function openEdit(u) {
    setForm({ nombre: u.nombre, usuario: u.usuario, password: '', rol: u.rol })
    setEditId(u.id)
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    try {
      if (editId) {
        const body = { nombre: form.nombre, rol: form.rol }
        if (form.password) body.password = form.password
        await put(`/usuarios/${editId}`, body)
      } else {
        await post('/usuarios', form)
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleActivo(u) {
    if (u.id === user?.id) {
      alert('No podés desactivar tu propio usuario.')
      return
    }
    const accion = u.activo ? 'desactivar' : 'reactivar'
    if (!confirm(`¿${accion[0].toUpperCase() + accion.slice(1)} al usuario "${u.usuario}"?`)) return
    try {
      await put(`/usuarios/${u.id}`, { activo: !u.activo })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Usuarios</span>
        <button className="btn btn-primary" onClick={openNew}>+ Nuevo</button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editId ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Nombre</label>
                <input className="form-control" name="nombre" value={form.nombre} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Usuario</label>
                <input
                  className="form-control"
                  name="usuario"
                  value={form.usuario}
                  onChange={handleChange}
                  required
                  disabled={Boolean(editId)}
                />
              </div>
              <div className="form-group">
                <label>{editId ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}</label>
                <input
                  className="form-control"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  required={!editId}
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label>Rol</label>
                <select className="form-control" name="rol" value={form.rol} onChange={handleChange}>
                  <option value="VENDEDOR">Vendedor</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancelar</button>
                <button className="btn btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <div className="loading">Cargando...</div> : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td>{u.nombre}</td>
                  <td>{u.usuario}</td>
                  <td style={{ textTransform: 'capitalize' }}>{u.rol?.toLowerCase()}</td>
                  <td>
                    <span className={`badge ${u.activo ? 'badge-success' : 'badge-danger'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(u)}>Editar</button>{' '}
                    <button
                      className={`btn btn-sm ${u.activo ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => toggleActivo(u)}
                      disabled={u.id === user?.id}
                      title={u.id === user?.id ? 'No podés desactivarte a vos mismo' : undefined}
                    >
                      {u.activo ? 'Desactivar' : 'Reactivar'}
                    </button>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--gray-400)' }}>Sin usuarios</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
