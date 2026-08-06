import { useState, useEffect, useRef, useCallback } from 'react'
import { get, post } from '../../api/client'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export default function AjusteStock() {
  const [productoId, setProductoId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)
  const debouncedBusqueda = useDebounce(busqueda, 300)

  useEffect(() => {
    if (debouncedBusqueda && abierto) {
      buscar(debouncedBusqueda)
    }
  }, [debouncedBusqueda, abierto])

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const buscar = useCallback(async (q) => {
    if (!q.trim()) { setResultados([]); return }
    try {
      const res = await get('/productos/buscar', { q })
      setResultados(res.data || res || [])
    } catch {
      setResultados([])
    }
  }, [])

  function seleccionarProducto(prod) {
    setProductoId(prod.id)
    setBusqueda(`${prod.nombre} (${prod.sku})`)
    setResultados([])
    setAbierto(false)
    inputRef.current?.focus()
  }

  function handleInputChange(e) {
    const val = e.target.value
    setBusqueda(val)
    setProductoId('')
    setResultados([])
    setAbierto(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      await post(`/productos/${Number(productoId)}/ajuste-stock`, {
        cantidad: Number(cantidad),
        motivo: motivo.trim(),
      })
      setSuccess('Ajuste registrado correctamente')
      setProductoId('')
      setBusqueda('')
      setCantidad('')
      setMotivo('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 500 }}>
      <div className="card-header">
        <span className="card-title">Ajuste de Stock Manual</span>
      </div>
      <p className="text-sm text-gray" style={{ marginBottom: 16 }}>
        Usar para correcciones: rotura, pérdida, conteo físico. Usar valores positivos para aumentar stock, negativos para disminuir.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Producto</label>
          <div ref={wrapperRef} style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              className="form-control"
              placeholder="Buscar producto por nombre o SKU..."
              value={busqueda}
              onChange={handleInputChange}
              onFocus={() => { if (busqueda) setAbierto(true) }}
              required
            />
            {abierto && resultados.length > 0 && (
              <ul style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
                listStyle: 'none', margin: 0, padding: 0, maxHeight: 200, overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,.1)',
              }}>
                {resultados.map(p => (
                  <li
                    key={p.id}
                    onClick={() => seleccionarProducto(p)}
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
          </div>
        </div>
        <div className="form-group">
          <label>Cantidad (positiva o negativa)</label>
          <input className="form-control" type="number" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Motivo</label>
          <textarea className="form-control" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} required />
        </div>
        <button className="btn btn-warning" disabled={saving}>{saving ? 'Registrando...' : 'Registrar Ajuste'}</button>
      </form>
    </div>
  )
}