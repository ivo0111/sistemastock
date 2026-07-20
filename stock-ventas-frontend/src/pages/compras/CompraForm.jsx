import { useState, useEffect, useRef, useCallback } from 'react'
import { get, post } from '../../api/client'
import { useNavigate } from 'react-router-dom'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export default function CompraForm() {
  const navigate = useNavigate()
  const [proveedores, setProveedores] = useState([])
  const [proveedorId, setProveedorId] = useState('')
  const [items, setItems] = useState([{ productoId: '', cantidad: 1, precioUnitario: '', busqueda: '', resultados: [], abierto: false }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const searchRefs = useRef([])

  useEffect(() => {
    get('/proveedores').then(r => setProveedores(r.data || r || [])).catch(() => {})
  }, [])

  function addItem() {
    setItems([...items, { productoId: '', cantidad: 1, precioUnitario: '', busqueda: '', resultados: [], abierto: false }])
  }

  const updateItem = useCallback((index, field, value) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }, [])

  function removeItem(index) {
    if (items.length <= 1) return
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  function seleccionarProducto(index, prod) {
    setItems(prev => prev.map((item, i) =>
      i === index
        ? { ...item, productoId: prod.id, busqueda: `${prod.nombre} (${prod.sku})`, precioUnitario: String(Number(prod.precioUltimaCompra || prod.precioCosto || 0)), resultados: [], abierto: false }
        : item
    ))
  }

  function abrirDropdown(index) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, abierto: true } : item))
  }

  function cerrarDropdown(index) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, abierto: false } : item))
  }

  const buscar = useCallback(async (index, q) => {
    if (!q.trim()) { updateItem(index, 'resultados', []); return }
    try {
      const res = await get('/productos/buscar', { q })
      const lista = res.data || res || []
      updateItem(index, 'resultados', lista)
    } catch { updateItem(index, 'resultados', []) }
  }, [updateItem])

  const total = items.reduce((s, item) => s + (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0), 0)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!proveedorId) { setError('Seleccioná un proveedor'); return }
    if (items.some(i => !i.productoId)) { setError('Completá todos los productos'); return }
    setError('')
    setSaving(true)
    try {
      const res = await post('/compras', {
        proveedorId: Number(proveedorId),
        items: items.map(i => ({
          productoId: Number(i.productoId),
          cantidad: Number(i.cantidad),
          precioUnitario: Number(i.precioUnitario),
        })),
      })
      navigate(`/compras/${res.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 700 }}>
      <div className="card-header">
        <span className="card-title">Nueva Compra</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Proveedor</label>
          <select className="form-control" value={proveedorId} onChange={e => setProveedorId(e.target.value)} required>
            <option value="">Seleccionar proveedor</option>
            {proveedores.map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        <div className="card-header" style={{ padding: 0, marginTop: 16 }}>
          <span className="card-title">Productos</span>
          <button type="button" className="btn btn-sm btn-outline" onClick={addItem}>+ Agregar</button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>P. Unitario</th>
                <th>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <ItemRow
                  key={i}
                  item={item}
                  index={i}
                  updateItem={updateItem}
                  removeItem={removeItem}
                  seleccionarProducto={seleccionarProducto}
                  abrirDropdown={abrirDropdown}
                  cerrarDropdown={cerrarDropdown}
                  buscar={buscar}
                  itemsLength={items.length}
                  searchRefs={searchRefs}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ textAlign: 'right', padding: '8px 0', fontWeight: 700, fontSize: 18 }}>
          Total: ${total.toFixed(2)}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-success" disabled={saving}>{saving ? 'Guardando...' : 'Registrar Compra'}</button>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/compras')}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}

function ItemRow({ item, index, updateItem, removeItem, seleccionarProducto, abrirDropdown, cerrarDropdown, buscar, itemsLength, searchRefs }) {
  const debouncedBusqueda = useDebounce(item.busqueda, 300)
  const inputRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (debouncedBusqueda && item.abierto) {
      buscar(index, debouncedBusqueda)
    }
  }, [debouncedBusqueda, item.abierto, index, buscar])

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        cerrarDropdown(index)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [index, cerrarDropdown])

  function handleInputChange(e) {
    const val = e.target.value
    updateItem(index, 'busqueda', val)
    updateItem(index, 'productoId', '')
    updateItem(index, 'resultados', [])
    abrirDropdown(index)
  }

  function handleSelect(prod) {
    seleccionarProducto(index, prod)
    inputRef.current?.focus()
  }

  return (
    <tr>
      <td style={{ position: 'relative' }}>
        <div ref={wrapperRef}>
          <input
            ref={inputRef}
            className="form-control"
            placeholder="Buscar producto..."
            value={item.productoId ? item.busqueda : item.busqueda}
            onChange={handleInputChange}
            onFocus={() => { if (item.busqueda) abrirDropdown(index) }}
            required={!item.productoId}
            style={{ width: 220 }}
          />
          {item.abierto && item.resultados.length > 0 && (
            <ul style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
              listStyle: 'none', margin: 0, padding: 0, maxHeight: 200, overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,.1)',
            }}>
              {item.resultados.map(p => (
                <li
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  style={{
                    padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                    borderBottom: '1px solid #f3f4f6',
                    display: 'flex', justifyContent: 'space-between', gap: 8,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <span>{p.nombre}</span>
                  <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{p.sku}</span>
                </li>
              ))}
            </ul>
          )}
          {item.productoId && (
            <input type="hidden" value={item.productoId} required />
          )}
        </div>
      </td>
      <td>
        <input className="form-control" type="number" min={1} value={item.cantidad} onChange={e => updateItem(index, 'cantidad', e.target.value)} required style={{ width: 80 }} />
      </td>
      <td>
        <input className="form-control" type="number" step="0.01" value={item.precioUnitario} onChange={e => updateItem(index, 'precioUnitario', e.target.value)} required style={{ width: 120 }} />
      </td>
      <td style={{ fontWeight: 600 }}>${((Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0)).toFixed(2)}</td>
      <td>
        {itemsLength > 1 && (
          <button type="button" className="btn btn-sm btn-danger" onClick={() => removeItem(index)}>×</button>
        )}
      </td>
    </tr>
  )
}
