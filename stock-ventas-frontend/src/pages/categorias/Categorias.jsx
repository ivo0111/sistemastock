import { useState, useEffect } from 'react'
import { get, post, put, del } from '../../api/client'

export default function Categorias() {
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState(null)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    get('/categorias')
      .then(r => setCategorias(r.data || r || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleSave() {
    if (!nombre.trim()) return
    setError('')
    try {
      if (editId) {
        await put(`/categorias/${editId}`, { nombre: nombre.trim() })
      } else {
        await post('/categorias', { nombre: nombre.trim() })
      }
      setNombre('')
      setEditId(null)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  function handleEdit(c) {
    setEditId(c.id)
    setNombre(c.nombre)
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta categoría?')) return
    try {
      await del(`/categorias/${id}`)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  function handleCancel() {
    setEditId(null)
    setNombre('')
  }

  return (
    <div className="card" style={{ maxWidth: 500 }}>
      <div className="card-header">
        <span className="card-title">Categorías</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-inline mb-4">
        <input
          className="form-control"
          placeholder="Nombre de la categoría"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
        <button className="btn btn-primary btn-sm" onClick={handleSave}>
          {editId ? 'Actualizar' : 'Agregar'}
        </button>
        {editId && (
          <button className="btn btn-outline btn-sm" onClick={handleCancel}>Cancelar</button>
        )}
      </div>

      {loading ? <div className="loading">Cargando...</div> : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map(c => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => handleEdit(c)}>Editar</button>{' '}
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
              {categorias.length === 0 && (
                <tr><td colSpan={2} style={{ textAlign: 'center', padding: 20, color: 'var(--gray-400)' }}>Sin categorías</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}