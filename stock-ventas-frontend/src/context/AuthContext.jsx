import { createContext, useContext, useState, useEffect } from 'react'
import { loginUser as apiLogin, setToken, clearSession } from '../api/client'

const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user')
    if (!stored) return null
    const parsed = JSON.parse(stored)
    if (parsed.rol) parsed.rol = parsed.rol.toLowerCase()
    return parsed
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) setLoading(false)
    else setLoading(false)
  }, [])

  async function login(usuario, password) {
    const res = await apiLogin(usuario, password)
    setToken(res.token)
    const userData = { ...res.usuario, rol: res.usuario.rol?.toLowerCase() }
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    return res
  }

  function logout() {
    clearSession()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}