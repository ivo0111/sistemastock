import { useState, useEffect } from 'react'
import { get, post, put, del } from '../../api/client'

const INITIAL = { nombre: '', contacto: '', telefono: '', email: '' }

export default function Proveedores() {
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(INITIAL)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    get('/proveedores')
      .then(r => setProveedores(r.data || r || []))
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

  function openEdit(p) {
    setForm({ nombre: p.nombre, contacto: p.contacto || '', telefono: p.telefono || '', email: p.email || '' })
    setEditId(p.id)
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    try {
      if (editId) {
        await put(`/proveedores/${editId}`, form)
      } else {
        await post('/proveedores', form)
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este proveedor?')) return
    try {
      await del(`/proveedores/${id}`)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Proveedores</span>
        <button className="btn btn-primary" onClick={openNew}>+ Nuevo</button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editId ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Nombre</label>
                <input className="form-control" name="nombre" value={form.nombre} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Contacto</label>
                <input className="form-control" name="contacto" value={form.contacto} onChange={handleChange} />
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
                <th>Contacto</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map(p => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.contacto || '-'}</td>
                  <td>{p.telefono || '-'}</td>
                  <td>{p.email || '-'}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(p)}>Editar</button>{' '}
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
              {proveedores.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--gray-400)' }}>Sin proveedores</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}