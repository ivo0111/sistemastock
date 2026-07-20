import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProductosList from './pages/productos/ProductosList'
import ProductoForm from './pages/productos/ProductoForm'
import Categorias from './pages/categorias/Categorias'
import Movimientos from './pages/stock/Movimientos'
import AjusteStock from './pages/stock/AjusteStock'
import POS from './pages/ventas/POS'
import VentasList from './pages/ventas/VentasList'
import VentaDetalle from './pages/ventas/VentaDetalle'
import Proveedores from './pages/proveedores/Proveedores'
import ComprasList from './pages/compras/ComprasList'
import CompraForm from './pages/compras/CompraForm'
import CompraDetalle from './pages/compras/CompraDetalle'
import Clientes from './pages/clientes/Clientes'
import Caja from './pages/caja/Caja'
import Reportes from './pages/reportes/Reportes'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="productos" element={<ProductosList />} />
        <Route
          path="productos/nuevo"
          element={
            <ProtectedRoute adminOnly>
              <ProductoForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="productos/:id/editar"
          element={
            <ProtectedRoute adminOnly>
              <ProductoForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="categorias"
          element={
            <ProtectedRoute adminOnly>
              <Categorias />
            </ProtectedRoute>
          }
        />
        <Route path="stock/movimientos" element={<Movimientos />} />
        <Route
          path="stock/ajuste"
          element={
            <ProtectedRoute adminOnly>
              <AjusteStock />
            </ProtectedRoute>
          }
        />
        <Route path="ventas/nueva" element={<POS />} />
        <Route path="ventas" element={<VentasList />} />
        <Route path="ventas/:id" element={<VentaDetalle />} />
        <Route path="proveedores" element={<Proveedores />} />
        <Route path="compras" element={<ComprasList />} />
        <Route path="compras/:id" element={<CompraDetalle />} />
        <Route
          path="compras/nueva"
          element={
            <ProtectedRoute adminOnly>
              <CompraForm />
            </ProtectedRoute>
          }
        />
        <Route path="clientes" element={<Clientes />} />
        <Route path="caja" element={<Caja />} />
        <Route
          path="reportes"
          element={
            <ProtectedRoute adminOnly>
              <Reportes />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}