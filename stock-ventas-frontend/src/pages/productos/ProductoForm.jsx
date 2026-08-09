import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { get, post, put } from '../../api/client'

const ALICUOTAS_IVA = [21, 10.5, 27, 5, 2.5, 0]

export default function ProductoForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    sku: '',
    codigoBarras: '',
    nombre: '',
    categoriaId: '',
    precioCosto: '',
    precioVenta: '',
    stockInicial: '',
    stockMinimo: '',
    alicuotaIva: '21',
    unidadMedida: 'unidades',
  })

  useEffect(() => {
    get('/categorias').then(r => setCategorias(r.data || r || [])).catch(() => {})
    if (isEdit) {
      get(`/productos/${id}`)
        .then(p => {
          setForm({
            sku: p.sku || '',
            codigoBarras: p.codigoBarras ?? p.codigo_barras ?? '',
            nombre: p.nombre || '',
            categoriaId: p.categoriaId ?? p.categoria_id ?? '',
            precioCosto: p.precioCosto ?? p.precio_costo ?? '',
            precioVenta: p.precioVenta ?? p.precio_venta ?? '',
            stockInicial: '',
            stockMinimo: p.stockMinimo ?? p.stock_minimo ?? '',
            alicuotaIva: String(p.alicuotaIva ?? p.alicuota_iva ?? '21'),
            unidadMedida: p.unidadMedida ?? p.unidad_medida ?? 'unidades',
          })
        })
        .finally(() => setLoading(false))
    }
  }, [id, isEdit])

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const body = {
        sku: form.sku,
        nombre: form.nombre,
        categoriaId: form.categoriaId ? Number(form.categoriaId) : undefined,
        precioCosto: Number(form.precioCosto),
        precioVenta: Number(form.precioVenta),
        stockMinimo: Number(form.stockMinimo),
        alicuotaIva: Number(form.alicuotaIva),
        unidadMedida: form.unidadMedida,
      }
      if (form.codigoBarras) body.codigoBarras = form.codigoBarras
      if (!isEdit) body.stockInicial = Number(form.stockInicial)
      if (isEdit) {
        await put(`/productos/${id}`, body)
      } else {
        await post('/productos', body)
      }
      navigate('/productos')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <div className="card-header">
        <span className="card-title">{isEdit ? 'Editar Producto' : 'Nuevo Producto'}</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>SKU</label>
            <input className="form-control" name="sku" value={form.sku} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Categoría</label>
            <select className="form-control" name="categoriaId" value={form.categoriaId} onChange={handleChange}>
              <option value="">Sin categoría</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Código de Barras (opcional)</label>
          <input className="form-control" name="codigoBarras" value={form.codigoBarras} onChange={handleChange} />
        </div>
        <div className="form-group">
          <label>Nombre</label>
          <input className="form-control" name="nombre" value={form.nombre} onChange={handleChange} required />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Precio de Costo</label>
            <input className="form-control" name="precioCosto" type="number" step="0.01" value={form.precioCosto} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Precio de Venta</label>
            <input className="form-control" name="precioVenta" type="number" step="0.01" value={form.precioVenta} onChange={handleChange} required />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Alícuota IVA</label>
            <select className="form-control" name="alicuotaIva" value={form.alicuotaIva} onChange={handleChange}>
              {ALICUOTAS_IVA.map(a => (
                <option key={a} value={a}>{String(a).replace('.', ',')}%</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Unidad de Medida</label>
            <input className="form-control" name="unidadMedida" placeholder="Ej: unidades, kg, litros" value={form.unidadMedida} onChange={handleChange} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Stock Mínimo</label>
            <input className="form-control" name="stockMinimo" type="number" value={form.stockMinimo} onChange={handleChange} required />
          </div>
          {!isEdit && (
            <div className="form-group">
              <label>Stock Inicial</label>
              <input className="form-control" name="stockInicial" type="number" value={form.stockInicial} onChange={handleChange} required />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/productos')}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}