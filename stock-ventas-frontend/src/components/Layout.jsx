import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const isAdmin = user?.rol === 'admin' || user?.rol === 'dueño'

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">Stock & Ventas</div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">General</div>
          <NavLink to="/" end className="sidebar-link">
            Dashboard
          </NavLink>

          <div className="sidebar-section">Ventas</div>
          <NavLink to="/ventas/nueva" className="sidebar-link">
            POS / Nueva Venta
          </NavLink>
          <NavLink to="/ventas" className="sidebar-link">
            Historial de Ventas
          </NavLink>

          <div className="sidebar-section">Productos</div>
          <NavLink to="/productos" className="sidebar-link">
            Productos
          </NavLink>
          {isAdmin && (
            <NavLink to="/categorias" className="sidebar-link">
              Categorías
            </NavLink>
          )}

          <div className="sidebar-section">Stock</div>
          <NavLink to="/stock/movimientos" className="sidebar-link">
            Movimientos
          </NavLink>
          {isAdmin && (
            <NavLink to="/stock/ajuste" className="sidebar-link">
              Ajuste de Stock
            </NavLink>
          )}

          <div className="sidebar-section">Compras</div>
          <NavLink to="/compras" className="sidebar-link">
            Compras
          </NavLink>
          {isAdmin && (
            <NavLink to="/compras/nueva" className="sidebar-link">
              Nueva Compra
            </NavLink>
          )}

          <div className="sidebar-section">Otros</div>
          <NavLink to="/proveedores" className="sidebar-link">
            Proveedores
          </NavLink>
          <NavLink to="/clientes" className="sidebar-link">
            Clientes
          </NavLink>
          <NavLink to="/caja" className="sidebar-link">
            Caja
          </NavLink>
          {isAdmin && (
            <NavLink to="/reportes" className="sidebar-link">
              Reportes
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <div style={{ fontWeight: 500, color: 'white' }}>{user?.nombre}</div>
          <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--gray-400)' }}>{user?.rol}</div>
          <button className="btn btn-sm btn-outline" style={{ color: 'white', borderColor: 'var(--gray-600)', width: '100%' }} onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <span className="page-title">Sistema de Stock y Ventas</span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}