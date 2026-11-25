import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="loading">Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  // Contraseña inicial generada por el instalador: hasta cambiarla no se
  // permite entrar a ninguna otra pantalla (el backend también lo bloquea).
  if (user.debeCambiarPassword && location.pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" replace />
  }
  if (adminOnly && user.rol !== 'admin') {
    return <Navigate to="/" replace />
  }
  return children
}