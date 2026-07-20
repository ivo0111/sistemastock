import { useState } from 'react'
import { post } from '../../api/client'

export default function AjusteStock() {
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      await post('/stock/ajuste', {
        producto_id: Number(productoId),
        cantidad: Number(cantidad),
        motivo: motivo.trim(),
      })
      setSuccess('Ajuste registrado correctamente')
      setProductoId('')
      setCantidad('')
      setMotivo('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 500 }}>
      <div className="card-header">
        <span className="card-title">Ajuste de Stock Manual</span>
      </div>
      <p className="text-sm text-gray" style={{ marginBottom: 16 }}>
        Usar para correcciones: rotura, pérdida, conteo físico. Usar valores positivos para aumentar stock, negativos para disminuir.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>ID del Producto</label>
          <input className="form-control" type="number" value={productoId} onChange={e => setProductoId(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Cantidad (positiva o negativa)</label>
          <input className="form-control" type="number" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Motivo</label>
          <textarea className="form-control" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} required />
        </div>
        <button className="btn btn-warning" disabled={saving}>{saving ? 'Registrando...' : 'Registrar Ajuste'}</button>
      </form>
    </div>
  )
}