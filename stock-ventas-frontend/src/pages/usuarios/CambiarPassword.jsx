import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { post } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

export default function CambiarPassword() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ passwordActual: '', passwordNuevo: '', confirmar: '' })
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)
  const [saving, setSaving] = useState(false)
  const cambioObligatorio = Boolean(user?.debeCambiarPassword)

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

      if (cambioObligatorio && user?.usuario) {
        // El token anterior sigue marcado con debeCambiarPassword=true (el
        // backend bloquea el resto de la API). Se renueva la sesión con la
        // contraseña nueva y se entra al sistema.
        await login(user.usuario, form.passwordNuevo)
        navigate('/', { replace: true })
        return
      }

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
        <span className="card-title">
          {cambioObligatorio ? 'Cambio de contraseña obligatorio' : 'Cambiar Contraseña'}
        </span>
      </div>
      {cambioObligatorio && (
        <div className="alert alert-info">
          Estás usando la contraseña inicial definida por el instalador. Elegí una
          contraseña nueva para poder continuar.
        </div>
      )}
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
