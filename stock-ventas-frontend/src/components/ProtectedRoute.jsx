import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()

  if (loading) return <div className="loading">Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.rol !== 'admin' && user.rol !== 'dueño') {
    return <Navigate to="/" replace />
  }
  return children
}