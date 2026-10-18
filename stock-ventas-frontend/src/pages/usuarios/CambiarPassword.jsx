import { useState } from 'react'
import { post } from '../../api/client'

export default function CambiarPassword() {
  const [form, setForm] = useState({ passwordActual: '', passwordNuevo: '', confirmar: '' })
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)
  const [saving, setSaving] = useState(false)

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setExito(false)

    if (form.passwordNuevo !== form.confirmar) {
      setError('La confirmación no coincide con la nueva contraseña')
      return
    }
    if (form.passwordNuevo.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres')
      return
    }

    setSaving(true)
    try {
      await post('/auth/cambiar-password', {
        passwordActual: form.passwordActual,
        passwordNuevo: form.passwordNuevo,
      })
      setExito(true)
      setForm({ passwordActual: '', passwordNuevo: '', confirmar: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div className="card-header">
        <span className="card-title">Cambiar Contraseña</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {exito && <div className="alert alert-success">Contraseña actualizada correctamente.</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Contraseña actual</label>
          <input
            className="form-control"
            type="password"
            name="passwordActual"
            value={form.passwordActual}
            onChange={handleChange}
            required
            autoComplete="current-password"
          />
        </div>
        <div className="form-group">
          <label>Nueva contraseña</label>
          <input
            className="form-control"
            type="password"
            name="passwordNuevo"
            value={form.passwordNuevo}
            onChange={handleChange}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        <div className="form-group">
          <label>Confirmar nueva contraseña</label>
          <input
            className="form-control"
            type="password"
            name="confirmar"
            value={form.confirmar}
            onChange={handleChange}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </form>
    </div>
  )
}
