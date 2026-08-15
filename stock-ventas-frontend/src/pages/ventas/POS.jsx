import { useState, useEffect, useRef } from 'react'
import { get, post } from '../../api/client'
import { useNavigate } from 'react-router-dom'

let nextLineId = 1

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export default function POS() {
  const navigate = useNavigate()
  const [productos, setProductos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cart, setCart] = useState([])
  const [formaPago, setFormaPago] = useState('efectivo')
  const [clienteId, setClienteId] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [clientesBusqueda, setClientesBusqueda] = useState('')
  const [clientes, setClientes] = useState([])
  const [clientesAbierto, setClientesAbierto] = useState(false)
  const [descuento, setDescuento] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const searchRef = useRef(null)
  const clienteWrapperRef = useRef(null)
  const debouncedClientesBusqueda = useDebounce(clientesBusqueda, 300)

  useEffect(() => {
    get('/productos/buscar', { q: busqueda || '__all__' })
      .then(r => setProductos(r.data || r || []))
      .catch(() => {})
  }, [busqueda])

  useEffect(() => {
    if (!debouncedClientesBusqueda || !clientesAbierto) { setClientes([]); return }
    get('/clientes', { busqueda: debouncedClientesBusqueda })
      .then(r => setClientes(r.data || r || []))
      .catch(() => setClientes([]))
  }, [debouncedClientesBusqueda, clientesAbierto])

  useEffect(() => {
    function handleClick(e) {
      if (clienteWrapperRef.current && !clienteWrapperRef.current.contains(e.target)) {
        setClientesAbierto(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function addToCart(p, bonificacion = 0) {
    if (p.stockActual <= 0) return
    setCart(prev => {
      const existing = prev.find(
        item => item.productoId === p.id && item.bonificacion === bonificacion
      )
      if (existing) {
        return prev.map(item =>
          item.productoId === p.id && item.bonificacion === bonificacion
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        )
      }
      return [...prev, {
        lineId: nextLineId++,
        productoId: p.id,
        nombre: p.nombre,
        sku: p.sku,
        precioUnitario: Number(p.precioVenta),
        cantidad: 1,
        stockActual: p.stockActual,
        bonificacion,
      }]
    })
    searchRef.current?.focus()
  }

  function addFirstResultToCart() {
    const activos = productos.filter(p => p.activo !== false)
    if (activos.length > 0) {
      addToCart(activos[0])
      setBusqueda('')
    }
  }

  function updateQty(lineId, cantidad) {
    if (cantidad <= 0) {
      setCart(prev => prev.filter(item => item.lineId !== lineId))
      return
    }
    setCart(prev => prev.map(item =>
      item.lineId === lineId ? { ...item, cantidad: Math.min(cantidad, item.stockActual) } : item
    ))
  }

  function updateBonificacion(lineId, nuevaBonificacion) {
    const bn = Math.min(100, Math.max(0, Number(nuevaBonificacion) || 0))
    setCart(prev => {
      const target = prev.find(item => item.lineId === lineId)
      if (!target) return prev
      const existing = prev.find(
        item => item.productoId === target.productoId && item.bonificacion === bn && item.lineId !== lineId
      )
      if (existing) {
        return prev
          .map(item =>
            item.lineId === lineId
              ? { ...item, cantidad: item.cantidad + existing.cantidad }
              : item
          )
          .filter(item => item.lineId !== existing.lineId)
      }
      return prev.map(item =>
        item.lineId === lineId ? { ...item, bonificacion: bn } : item
      )
    })
  }

  function removeFromCart(lineId) {
    setCart(prev => prev.filter(item => item.lineId !== lineId))
  }

  function cartItemSubtotal(item) {
    return item.precioUnitario * item.cantidad * (1 - item.bonificacion / 100)
  }

  const subtotal = cart.reduce((sum, item) => sum + cartItemSubtotal(item), 0)
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
          bonificacion: item.bonificacion,
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
            placeholder="Buscar producto por nombre, SKU o código de barras..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && busqueda) {
                e.preventDefault()
                const exactMatch = productos.filter(p => p.codigoBarras === busqueda)
                if (exactMatch.length === 1) {
                  addToCart(exactMatch[0])
                  setBusqueda('')
                } else {
                  addFirstResultToCart()
                }
              }
            }}
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
            <div key={item.lineId} className="pos-cart-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="item-name">
                  {item.nombre}
                  {item.bonificacion > 0 && (
                    <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: 11 }}>
                      -{item.bonificacion}%
                    </span>
                  )}
                </div>
                <div>
                  <button className="btn btn-sm btn-outline" onClick={() => updateQty(item.lineId, item.cantidad - 1)}>-</button>
                  <span className="item-qty">{item.cantidad}</span>
                  <button className="btn btn-sm btn-outline" onClick={() => updateQty(item.lineId, item.cantidad + 1)}>+</button>
                </div>
                <div className="item-total">${cartItemSubtotal(item).toFixed(2)}</div>
                <button className="item-remove" onClick={() => removeFromCart(item.lineId)}>×</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 4 }}>
                <label style={{ fontSize: 12, color: 'var(--gray-500)' }}>% Bonif:</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={item.bonificacion}
                  onChange={e => updateBonificacion(item.lineId, e.target.value)}
                  style={{ width: 56, padding: '2px 4px', fontSize: 12, border: '1px solid var(--gray-300)', borderRadius: 4 }}
                />
                <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>%</span>
              </div>
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

        <div className="form-group" style={{ position: 'relative' }} ref={clienteWrapperRef}>
          <label>Cliente (opcional)</label>
          {clienteSeleccionado ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: 6 }}>
              <span style={{ flex: 1 }}>{clienteSeleccionado.nombre}</span>
              <button
                type="button"
                onClick={() => { setClienteId(''); setClienteSeleccionado(null); setClientesBusqueda('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 18, lineHeight: 1 }}
              >×</button>
            </div>
          ) : (
            <>
              <input
                className="form-control"
                placeholder="Buscar cliente por nombre..."
                value={clientesBusqueda}
                onChange={e => { setClientesBusqueda(e.target.value); setClientesAbierto(true); setClienteId('') }}
                onFocus={() => { if (clientesBusqueda) setClientesAbierto(true) }}
              />
              {clientesAbierto && clientes.length > 0 && (
                <ul style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  background: '#fff', border: '1px solid var(--gray-300)', borderRadius: 6,
                  listStyle: 'none', margin: 0, padding: 0, maxHeight: 200, overflowY: 'auto',
                  boxShadow: '0 4px 12px rgba(0,0,0,.1)',
                }}>
                  {clientes.map(c => (
                    <li
                      key={c.id}
                      onClick={() => { setClienteId(c.id); setClienteSeleccionado(c); setClientesBusqueda(''); setClientesAbierto(false) }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                        borderBottom: '1px solid var(--gray-100)',
                        display: 'flex', justifyContent: 'space-between', gap: 8,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-100)'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      <span>{c.nombre}</span>
                      {c.cuit && <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>CUIT: {c.cuit}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
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
