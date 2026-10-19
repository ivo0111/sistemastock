import { useState, useEffect } from 'react'
import { get, post, put, del } from '../../api/client'

const TIPOS = [
  { value: 'DESCUENTO_PORCENTUAL', label: 'Descuento porcentual' },
  { value: 'SEGUNDA_UNIDAD', label: '2da unidad con descuento' },
  { value: 'DOS_POR_UNO', label: '2x1 (2 por 1)' },
]

const INITIAL = {
  nombre: '',
  tipo: 'DESCUENTO_PORCENTUAL',
  productoId: '',
  valor: 10,
  cantidadMinima: 1,
  activo: true,
  fechaInicio: '',
  fechaFin: '',
}

function valorLabel(tipo) {
  if (tipo === 'DESCUENTO_PORCENTUAL') return 'Descuento (%)'
  if (tipo === 'SEGUNDA_UNIDAD') return 'Descuento sobre 2da unidad (%)'
  return 'Valor (no se usa en 2x1)'
}

function detallePromo(p) {
  if (p.tipo === 'DOS_POR_UNO') return '2x1'
  if (p.tipo === 'SEGUNDA_UNIDAD') return `${Number(p.valor)}% en 2da unidad`
  return `${Number(p.valor)}% de descuento`
}

function aInputDate(iso) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

export default function Promociones() {
  const [promociones, setPromociones] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [form, setForm] = useState(INITIAL)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  function load() {
    setLoading(true)
    setLoadError('')
    get('/promociones')
      .then(r => setPromociones(Array.isArray(r) ? r : []))
      .catch(err => setLoadError(err.message || 'Error al cargar promociones'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    get('/productos', { limit: 100 })
      .then(r => setProductos(r.data || r || []))
      .catch(() => setProductos([]))
  }, [])

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  function openNew() {
    setForm(INITIAL)
    setEditId(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(p) {
    setForm({
      nombre: p.nombre,
      tipo: p.tipo,
      productoId: p.productoId != null ? String(p.productoId) : '',
      valor: Number(p.valor),
      cantidadMinima: Number(p.cantidadMinima),
      activo: p.activo,
      fechaInicio: aInputDate(p.fechaInicio),
      fechaFin: aInputDate(p.fechaFin),
    })
    setEditId(p.id)
    setError('')
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    const payload = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      productoId: form.productoId ? Number(form.productoId) : null,
      valor: form.tipo === 'DOS_POR_UNO' ? 0 : Number(form.valor),
      cantidadMinima: Number(form.cantidadMinima) || 1,
      activo: form.activo,
      fechaInicio: form.fechaInicio ? new Date(form.fechaInicio).toISOString() : null,
      fechaFin: form.fechaFin ? new Date(form.fechaFin).toISOString() : null,
    }
    setGuardando(true)
    try {
      if (editId) {
        await put(`/promociones/${editId}`, payload)
      } else {
        await post('/promociones', payload)
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActivo(p) {
    try {
      await put(`/promociones/${p.id}`, { activo: !p.activo })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete(p) {
    if (!confirm(`¿Eliminar la promoción "${p.nombre}"?`)) return
    try {
      await del(`/promociones/${p.id}`)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Promociones</span>
        <button className="btn btn-primary" onClick={openNew}>+ Nueva</button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editId ? 'Editar Promoción' : 'Nueva Promoción'}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Nombre</label>
                <input className="form-control" name="nombre" value={form.nombre} onChange={handleChange} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Tipo</label>
                  <select className="form-control" name="tipo" value={form.tipo} onChange={handleChange}>
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Producto</label>
                  <select className="form-control" name="productoId" value={form.productoId} onChange={handleChange}>
                    <option value="">Todos los productos</option>
                    {productos.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre} ({p.sku})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{valorLabel(form.tipo)}</label>
                  <input
                    className="form-control"
                    type="number"
                    name="valor"
                    min="0"
                    max="100"
                    step="0.5"
                    value={form.valor}
                    onChange={handleChange}
                    disabled={form.tipo === 'DOS_POR_UNO'}
                    required={form.tipo !== 'DOS_POR_UNO'}
                  />
                </div>
                <div className="form-group">
                  <label>Cantidad mínima</label>
                  <input
                    className="form-control"
                    type="number"
                    name="cantidadMinima"
                    min="1"
                    value={form.cantidadMinima}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Vigente desde</label>
                  <input className="form-control" type="date" name="fechaInicio" value={form.fechaInicio} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Vigente hasta</label>
                  <input className="form-control" type="date" name="fechaFin" value={form.fechaFin} onChange={handleChange} />
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" name="activo" checked={form.activo} onChange={handleChange} />
                  Activa
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancelar</button>
                <button className="btn btn-primary" disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar'}
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
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th>Detalle</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {promociones.map(p => (
                  <tr key={p.id}>
                    <td>{p.nombre}</td>
                    <td>{TIPOS.find(t => t.value === p.tipo)?.label || p.tipo}</td>
                    <td>{p.producto ? `${p.producto.nombre}` : 'Todos'}</td>
                    <td>{detallePromo(p)}</td>
                    <td>
                      {p.fechaInicio ? new Date(p.fechaInicio).toLocaleDateString('es-AR') : '...'}{' '}
                      {'–'}{' '}
                      {p.fechaFin ? new Date(p.fechaFin).toLocaleDateString('es-AR') : '...'}
                    </td>
                    <td>
                      <span className={`badge ${p.activo ? 'badge-success' : 'badge-danger'}`}>
                        {p.activo ? 'Activa' : 'Pausada'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(p)}>Editar</button>{' '}
                      <button className="btn btn-sm btn-outline" onClick={() => toggleActivo(p)}>
                        {p.activo ? 'Pausar' : 'Activar'}
                      </button>{' '}
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
                {promociones.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--gray-400)' }}>
                      Sin promociones. Creá una para que el POS la aplique automáticamente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
