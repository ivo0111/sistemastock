import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import JsBarcode from 'jsbarcode'
import { get } from '../../api/client'

// Vista imprimible de etiquetas. Se abre en una pestaña nueva (sin el layout
// con sidebar) a partir de la selección hecha en ProductosList.
//
// El código de barras se genera en Code128 codificando `codigoBarras` si el
// producto lo tiene cargado (código real de fábrica), o el `sku` si no lo
// tiene. Así todos los productos terminan con una etiqueta escaneable, sin
// necesidad de inventar un código: el sku ya es único por diseño.
export default function EtiquetasImprimibles() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const barcodeRefs = useRef({})

  const ids = searchParams.get('ids') || ''

  useEffect(() => {
    if (!ids) {
      setError('No se seleccionó ningún producto')
      setLoading(false)
      return
    }
    get('/productos/etiquetas', { ids })
      .then(setProductos)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [ids])

  const setBarcodeRef = useCallback((productoId, el) => {
    barcodeRefs.current[productoId] = el
  }, [])

  useEffect(() => {
    productos.forEach(p => {
      const valor = p.codigoBarras || p.sku
      const el = barcodeRefs.current[p.id]
      if (!el || !valor) return
      try {
        JsBarcode(el, valor, {
          format: 'CODE128',
          width: 1.6,
          height: 40,
          fontSize: 12,
          margin: 4,
          displayValue: true,
        })
      } catch (err) {
        // Si el valor tiene algún caracter no soportado por Code128, no
        // rompemos toda la vista: esa etiqueta queda sin barras, solo texto.
        console.error(`No se pudo generar el código de barras para "${valor}"`, err)
      }
    })
  }, [productos])

  if (loading) return <div className="loading">Cargando...</div>

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-outline" onClick={() => navigate('/productos')}>Volver</button>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span className="card-title">Etiquetas ({productos.length})</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => navigate('/productos')}>Volver</button>
          <button className="btn btn-primary" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>

      <div className="etiquetas-grid">
        {productos.map(p => (
          <div className="etiqueta" key={p.id}>
            <div className="etiqueta-nombre">{p.nombre}</div>
            <div className="etiqueta-precio">${Number(p.precioVenta).toFixed(2)}</div>
            {(p.codigoBarras || p.sku) ? (
              <svg ref={el => setBarcodeRef(p.id, el)} className="etiqueta-barcode" />
            ) : (
              <div className="etiqueta-sin-codigo">Sin código</div>
            )}
          </div>
        ))}
        {productos.length === 0 && (
          <div className="empty-state">No se encontraron productos para imprimir</div>
        )}
      </div>
    </div>
  )
}