import { useState, useEffect, useRef } from 'react'
import { get, post } from '../../api/client'
import { useNavigate } from 'react-router-dom'

export default function POS() {
  const navigate = useNavigate()
  const [productos, setProductos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cart, setCart] = useState([])
  const [formaPago, setFormaPago] = useState('efectivo')
  const [clienteId, setClienteId] = useState('')
  const [descuento, setDescuento] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    get('/productos/buscar', { q: busqueda || '__all__' })
      .then(r => setProductos(r.data || r || []))
      .catch(() => {})
  }, [busqueda])

  function addToCart(p) {
    if (p.stockActual <= 0) return
    setCart(prev => {
      const existing = prev.find(item => item.productoId === p.id)
      if (existing) {
        return prev.map(item =>
          item.productoId === p.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        )
      }
      return [...prev, { productoId: p.id, nombre: p.nombre, sku: p.sku, precioUnitario: Number(p.precioVenta), cantidad: 1, stockActual: p.stockActual }]
    })
    searchRef.current?.focus()
  }

  function updateQty(productoId, cantidad) {
    if (cantidad <= 0) {
      setCart(prev => prev.filter(item => item.productoId !== productoId))
      return
    }
    setCart(prev => prev.map(item =>
      item.productoId === productoId ? { ...item, cantidad: Math.min(cantidad, item.stockActual) } : item
    ))
  }

  function removeFromCart(productoId) {
    setCart(prev => prev.filter(item => item.productoId !== productoId))
  }

  const subtotal = cart.reduce((sum, item) => sum + item.precioUnitario * item.cantidad, 0)
  const total = Math.max(0, subtotal - Number(descuento))

  async function handleCheckout() {
    if (cart.length === 0) return
    setError('')
    setSaving(true)
    try {
      const res = await post('/ventas', {
        ...(clienteId ? { clienteId: Number(clienteId) } : {}),
        items: cart.map(item => ({
          productoId: item.productoId,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
        })),
        formaPago: formaPago.toUpperCase(),
        descuento: Number(descuento),
      })
      navigate(`/ventas/${res.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pos-layout">
      <div>
        <div className="pos-search">
          <input
            ref={searchRef}
            placeholder="Buscar producto por nombre o SKU..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            autoFocus
          />
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="pos-products">
          {productos.filter(p => p.activo !== false).map(p => (
            <div key={p.id} className="pos-product-card" onClick={() => addToCart(p)}>
              <div className="name">{p.nombre}</div>
              <div className="price">${Number(p.precioVenta).toFixed(2)}</div>
              <div className="stock">Stock: {p.stockActual}</div>
            </div>
          ))}
          {productos.length === 0 && <div className="text-sm text-gray" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20 }}>Sin resultados</div>}
        </div>
      </div>

      <div className="pos-cart">
        <h3>Carrito ({cart.length} items)</h3>
        <div className="pos-cart-items">
          {cart.map(item => (
            <div key={item.productoId} className="pos-cart-item">
              <div className="item-name">{item.nombre}</div>
              <div>
                <button className="btn btn-sm btn-outline" onClick={() => updateQty(item.productoId, item.cantidad - 1)}>-</button>
                <span className="item-qty">{item.cantidad}</span>
                <button className="btn btn-sm btn-outline" onClick={() => updateQty(item.productoId, item.cantidad + 1)}>+</button>
              </div>
              <div className="item-total">${(item.precioUnitario * item.cantidad).toFixed(2)}</div>
              <button className="item-remove" onClick={() => removeFromCart(item.productoId)}>×</button>
            </div>
          ))}
          {cart.length === 0 && <div className="text-sm text-gray" style={{ textAlign: 'center', padding: 20 }}>Agregá productos para iniciar la venta</div>}
        </div>

        <div className="form-group">
          <label>Forma de pago</label>
          <select className="form-control" value={formaPago} onChange={e => setFormaPago(e.target.value)}>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </div>

        <div className="form-group">
          <label>Cliente ID (opcional)</label>
          <input className="form-control" type="number" value={clienteId} onChange={e => setClienteId(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Descuento ($)</label>
          <input className="form-control" type="number" value={descuento} onChange={e => setDescuento(e.target.value)} />
        </div>

        <div className="pos-cart-total">
          <span>Total: </span>${total.toFixed(2)}
        </div>

        <button
          className="btn btn-success"
          style={{ width: '100%', padding: 12, fontSize: 16 }}
          disabled={cart.length === 0 || saving}
          onClick={handleCheckout}
        >
          {saving ? 'Procesando...' : `Confirmar Venta ($${total.toFixed(2)})`}
        </button>
      </div>
    </div>
  )
}