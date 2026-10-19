import { useState, useRef, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseExcelFile, mapearColumnas } from '../../utils/excelParser'
import { post } from '../../api/client'
import {
  PASOS,
  CAMPOS_SISTEMA,
  SCHEMA_DEFAULTS,
  FILAS_POR_PAGINA,
  FILAS_POR_LOTE_IMPORTACION,
  parseDecimalArgentina,
  toNumberSafe,
  getPreviewValues,
  getDistinctValues,
  descargarCsv,
} from './importar/importarHelpers'

export default function ImportarProductos() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [pasoActual, setPasoActual] = useState(1)
  const [file, setFile] = useState(null)
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Paso B
  const [mapeoColumnas, setMapeoColumnas] = useState({})
  const [usarSkuComoNombre, setUsarSkuComoNombre] = useState(false)

  // Paso C
  const [defaults, setDefaults] = useState({ ...SCHEMA_DEFAULTS })
  const [defaultsPorCategoria, setDefaultsPorCategoria] = useState({})
  const [overridesManuales, setOverridesManuales] = useState({})
  const [selActiva, setSelActiva] = useState(null)
  const [selFilas, setSelFilas] = useState(new Set())
  const [selValor, setSelValor] = useState('')

  // Paso D
  const [filasPreview, setFilasPreview] = useState([])
  const [accionesConflicto, setAccionesConflicto] = useState({})
  const [conflictoGlobal, setConflictoGlobal] = useState('')
  const [pagePreview, setPagePreview] = useState(1)
  const [loadingConflicto, setLoadingConflicto] = useState(false)

  // Paso E
  const [importando, setImportando] = useState(false)
  const [resultadoImportacion, setResultadoImportacion] = useState(null)

  // --- Derived ---

  const camposSinMapear = useMemo(() => {
    return CAMPOS_SISTEMA.filter(c => {
      if (c.key === 'sku') return false
      if (c.key === 'nombre' && usarSkuComoNombre) return false
      if (c.key === 'categoriaId') return false
      if (c.key === 'codigoBarras') return false
      return !mapeoColumnas[c.key]
    })
  }, [mapeoColumnas, usarSkuComoNombre])

  const camposRequierenValor = useMemo(() => {
    return camposSinMapear.filter(c => !c.defaultVal)
  }, [camposSinMapear])

  const categoriasDetectadas = useMemo(() => {
    if (!mapeoColumnas.categoriaId) return []
    return getDistinctValues(rows, mapeoColumnas.categoriaId)
  }, [rows, mapeoColumnas.categoriaId])

  const contadores = useMemo(() => {
    let total = 0, aCrear = 0, aActualizar = 0, aOmitir = 0, conErrores = 0
    filasPreview.forEach(f => {
      total++
      if (f.error) conErrores++
      else if (f.estado === 'a_crear') aCrear++
      else if (f.estado === 'a_actualizar') aActualizar++
      else if (f.estado === 'omitir') aOmitir++
    })
    return { total, aCrear, aActualizar, aOmitir, conErrores }
  }, [filasPreview])

  const filasImportables = useMemo(() => {
    return filasPreview.filter(f => !f.error && f.estado !== 'omitir')
  }, [filasPreview])

  const totalPaginasPreview = useMemo(() => {
    return Math.max(1, Math.ceil(filasPreview.length / FILAS_POR_PAGINA))
  }, [filasPreview.length])

  const filasPaginaActual = useMemo(() => {
    const start = (pagePreview - 1) * FILAS_POR_PAGINA
    return filasPreview.slice(start, start + FILAS_POR_PAGINA)
  }, [filasPreview, pagePreview])

  // Initialize defaultsPorCategoria when entering Step C
  useEffect(() => {
    if (pasoActual !== 3) return
    setDefaultsPorCategoria(prev => {
      if (categoriasDetectadas.length === 0) return {}
      const updated = {}
      categoriasDetectadas.forEach(cat => {
        updated[cat] = prev[cat] || { ...SCHEMA_DEFAULTS }
      })
      return updated
    })
  }, [pasoActual, categoriasDetectadas])

  // --- Step A ---

  async function handleFileChange(e) {
    const selected = e.target.files?.[0]
    if (!selected) return
    setError('')
    setLoading(true)
    try {
      const result = await parseExcelFile(selected)
      setFile(selected)
      setHeaders(result.headers)
      setRows(result.rows)
      setMapeoColumnas(mapearColumnas(result.headers))
      setPasoActual(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // --- Navigation ---

  function avanzarPasoB() {
    if (!mapeoColumnas.sku) {
      setError('Debe mapear la columna SKU para continuar')
      return
    }
    setError('')
    setPasoActual(3)
  }

  function puedeAvanzarPasoC() {
    return camposRequierenValor.every(c => {
      const v = defaults[c.key]
      return v !== undefined && v !== ''
    })
  }

  async function avanzarPasoD() {
    if (!puedeAvanzarPasoC()) {
      setError('Complete los campos requeridos sin mapear antes de continuar')
      return
    }
    setError('')
    setLoading(true)
    try {
      const preview = construirFilasPreview()
      setFilasPreview(preview)
      setAccionesConflicto({})
      setPagePreview(1)
      setPasoActual(4)
      verificarExistenciaEnDB(preview)
    } catch (err) {
      setError(err.message || 'Error al generar la vista previa')
    } finally {
      setLoading(false)
    }
  }

  // --- Manual selection ---

  function aplicarSeleccionManual() {
    if (!selActiva || selFilas.size === 0 || !selValor) return
    setOverridesManuales(prev => {
      const updated = { ...prev }
      if (!updated[selActiva]) updated[selActiva] = {}
      selFilas.forEach(idx => { updated[selActiva][idx] = selValor })
      return updated
    })
    setSelFilas(new Set())
    setSelValor('')
  }

  function toggleSelFila(idx) {
    setSelFilas(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function toggleSelTodas() {
    setSelFilas(prev => prev.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)))
  }

  // --- Step D: Build preview rows ---

  function construirFilasPreview() {
    const filas = []
    const skusVistos = new Set()
    const codigosVistos = new Set()

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const fila = { _idx: i, error: null, estado: 'a_crear', existeEnDB: false }

      // Resolve SKU
      const skuRaw = mapeoColumnas.sku ? row[mapeoColumnas.sku] : ''
      fila.sku = String(skuRaw ?? '').trim()

      // Resolve Nombre
      if (usarSkuComoNombre) {
        fila.nombre = fila.sku
      } else if (mapeoColumnas.nombre) {
        fila.nombre = String(row[mapeoColumnas.nombre] ?? '').trim()
      } else {
        fila.nombre = fila.sku
      }

      // Resolve Categoria
      fila.categoriaNombre = mapeoColumnas.categoriaId
        ? String(row[mapeoColumnas.categoriaId] ?? '').trim()
        : ''

      // Resolve Codigo de Barras
      fila.codigoBarras = mapeoColumnas.codigoBarras
        ? String(row[mapeoColumnas.codigoBarras] ?? '').trim()
        : ''

      // Resolve remaining fields with priority chain
      const camposAResolver = CAMPOS_SISTEMA.filter(c =>
        !['sku', 'nombre', 'categoriaId', 'codigoBarras'].includes(c.key)
      )

      for (const campo of camposAResolver) {
        let valor = ''

        // 1. Mapped from file
        if (mapeoColumnas[campo.key]) {
          valor = row[mapeoColumnas[campo.key]]
          if (valor !== undefined && valor !== null) valor = String(valor).trim()
          else valor = ''
        }

        // 2. Manual override
        if (!valor && overridesManuales[campo.key]?.[i] !== undefined) {
          valor = overridesManuales[campo.key][i]
        }

        // 3. Per-category default
        if (!valor && fila.categoriaNombre && defaultsPorCategoria[fila.categoriaNombre]?.[campo.key]) {
          valor = defaultsPorCategoria[fila.categoriaNombre][campo.key]
        }

        // 4. Global default
        if (!valor && defaults[campo.key]) {
          valor = defaults[campo.key]
        }

        // 5. Schema default
        if (!valor && campo.defaultVal) {
          valor = campo.defaultVal
        }

        fila[campo.key] = valor || ''
      }
      // --- Local validations ---

      // SKU vacio
      if (!fila.sku) {
        fila.error = 'SKU vacio'
        fila.estado = 'error'
      }
      // SKU duplicado en archivo
      else if (skusVistos.has(fila.sku)) {
        fila.error = 'SKU duplicado en el archivo'
        fila.estado = 'error'
      } else {
        skusVistos.add(fila.sku)
      }

      // Codigo de barras duplicado en archivo
      if (!fila.error && fila.codigoBarras) {
        if (codigosVistos.has(fila.codigoBarras)) {
          fila.error = 'Codigo de Barras duplicado en el archivo'
          fila.estado = 'error'
        } else {
          codigosVistos.add(fila.codigoBarras)
        }
      }

      // Precios vacios o no numericos
      if (!fila.error) {
        const pc = toNumberSafe(fila.precioCosto)
        const pv = toNumberSafe(fila.precioVenta)
        if (fila.precioCosto === '' || isNaN(pc)) {
          fila.error = 'Precio Costo vacio o no numerico'
          fila.estado = 'error'
        } else if (fila.precioVenta === '' || isNaN(pv)) {
          fila.error = 'Precio Venta vacio o no numerico'
          fila.estado = 'error'
        }
      }

      filas.push(fila)
    }
    return filas
  }

  // --- Step D: Check DB existence ---

  async function verificarExistenciaEnDB(preview) {
    setLoadingConflicto(true)
    try {
      const skusValidos = preview
        .filter(f => !f.error && f.sku)
        .map(f => f.sku)
      const codigosValidos = preview
        .filter(f => !f.error && f.codigoBarras)
        .map(f => f.codigoBarras)

      if (skusValidos.length === 0 && codigosValidos.length === 0) return

      const res = await post('/productos/verificar-existencia', {
        skus: skusValidos,
        codigosBarras: codigosValidos,
      })

      const skusExistentes = new Set(res?.skusExistentes || [])
      const codigosExistentes = new Set(res?.codigosExistentes || [])

      setFilasPreview(prev => prev.map(f => {
        if (f.error) return f

        const existeSKU = skusExistentes.has(f.sku)
        const existeCB = f.codigoBarras && codigosExistentes.has(f.codigoBarras)

        if (existeSKU || existeCB) {
          return {
            ...f,
            existeEnDB: true,
            estado: 'a_actualizar',
          }
        }
        return f
      }))
    } catch (err) {
      // Silent fail - user can still proceed without DB check
      console.warn('No se pudo verificar existencia en DB:', err.message)
    } finally {
      setLoadingConflicto(false)
    }
  }

  // --- Step D: Conflict resolution ---

  function aplicarConflictoGlobal(accion) {
    setConflictoGlobal(accion)
    setFilasPreview(prev => prev.map(f => {
      if (!f.existeEnDB || f.error) return f
      return { ...f, estado: accion === 'omitir' ? 'omitir' : 'a_actualizar' }
    }))
  }

  function toggleConflictoFila(idx) {
    setFilasPreview(prev => prev.map(f => {
      if (f._idx !== idx || !f.existeEnDB || f.error) return f
      const nuevoEstado = f.estado === 'a_actualizar' ? 'omitir' : 'a_actualizar'
      return { ...f, estado: nuevoEstado }
    }))
  }

  // --- Step D: Inline edit ---

  function editarCampoFila(idx, campo, valor) {
    setFilasPreview(prev => {
      const updated = prev.map(f => {
        if (f._idx !== idx) return f
        return { ...f, [campo]: valor, editado: true }
      })

      return revalidarFilas(updated)
    })
  }

  // --- Step D: Delete row ---

  function eliminarFila(idx) {
    setFilasPreview(prev => {
      const updated = prev.filter(f => f._idx !== idx)
      return revalidarFilas(updated)
    })
  }

  // --- Step D: Re-validate all rows (shared by edit and delete) ---

  function revalidarFilas(filas) {
    const skuCounts = {}
    const codigoCounts = {}
    for (const f of filas) {
      if (f.sku) skuCounts[f.sku] = (skuCounts[f.sku] || 0) + 1
      if (f.codigoBarras) codigoCounts[f.codigoBarras] = (codigoCounts[f.codigoBarras] || 0) + 1
    }

    return filas.map(f => {
      if (f.estado === 'omitir' && !f.error) return f

      let error = null

      if (!f.sku) {
        error = 'SKU vacio'
      } else if (skuCounts[f.sku] > 1) {
        error = 'SKU duplicado en el archivo'
      } else if (f.codigoBarras && codigoCounts[f.codigoBarras] > 1) {
        error = 'Codigo de Barras duplicado en el archivo'
      } else {
        const pc = toNumberSafe(f.precioCosto)
        const pv = toNumberSafe(f.precioVenta)
        if (f.precioCosto === '' || isNaN(pc)) {
          error = 'Precio Costo vacio o no numerico'
        } else if (f.precioVenta === '' || isNaN(pv)) {
          error = 'Precio Venta vacio o no numerico'
        }
      }

      if (error) {
        return { ...f, error, estado: 'error' }
      }
      return { ...f, error: null, estado: f.existeEnDB ? 'a_actualizar' : 'a_crear' }
    })
  }

  // --- Step E: Import ---

  async function importarEnLotes(filasParaEnviar) {
    const total = { creados: 0, actualizados: 0, omitidos: 0, errores: [] }
    for (let i = 0; i < filasParaEnviar.length; i += FILAS_POR_LOTE_IMPORTACION) {
      const lote = filasParaEnviar.slice(i, i + FILAS_POR_LOTE_IMPORTACION)
      const res = await post('/productos/importar', { filas: lote })
      total.creados += res?.creados || 0
      total.actualizados += res?.actualizados || 0
      total.omitidos += res?.omitidos || 0
      if (res?.errores?.length) total.errores.push(...res.errores)
    }
    return total
  }

  async function confirmarImportacion() {
    if (filasImportables.length === 0) return

    setImportando(true)
    setError('')
    try {
      const filasParaEnviar = filasImportables.map(f => {
        const fila = {
          sku: f.sku,
          nombre: f.nombre,
          precioCosto: toNumberSafe(f.precioCosto),
          precioVenta: toNumberSafe(f.precioVenta),
        }
        if (f.categoriaNombre) fila.categoriaNombre = f.categoriaNombre
        if (f.codigoBarras) fila.codigoBarras = f.codigoBarras
        const stockActual = toNumberSafe(f.stockActual)
        if (!isNaN(stockActual)) fila.stockActual = stockActual
        const stockMinimo = toNumberSafe(f.stockMinimo)
        if (!isNaN(stockMinimo)) fila.stockMinimo = stockMinimo
        const alicuotaIva = toNumberSafe(f.alicuotaIva)
        if (!isNaN(alicuotaIva)) fila.alicuotaIva = alicuotaIva
        if (f.unidadMedida) fila.unidadMedida = f.unidadMedida
        if (f.existeEnDB) {
          fila.accionSiExiste = f.estado === 'a_actualizar' ? 'actualizar' : 'omitir'
        }
        return fila
      })

      const res = await importarEnLotes(filasParaEnviar)
      setResultadoImportacion(res)
      setPasoActual(6)
    } catch (err) {
      setError(err.message || 'Error al importar productos')
    } finally {
      setImportando(false)
    }
  }

  // --- Step E: Download CSV results ---

  function descargarCsvResultados() {
    if (!resultadoImportacion) return
    const now = new Date()
    const fecha = now.toISOString().slice(0, 10)
    const nombreArchivo = `importacion-productos_${fecha}.csv`

    const csvHeaders = ['SKU', 'Resultado', 'Motivo']
    const csvRows = []

    // successes
    if (resultadoImportacion.creados > 0 || resultadoImportacion.actualizados > 0) {
      filasImportables.forEach(f => {
        let resultado = 'Creado'
        if (f.existeEnDB) resultado = f.estado === 'a_actualizar' ? 'Actualizado' : 'Omitido'
        csvRows.push([f.sku, resultado, ''])
      })
    }

    // errors
    if (resultadoImportacion.errores) {
      resultadoImportacion.errores.forEach(e => {
        csvRows.push([e.sku, 'Rechazado', e.motivo])
      })
    }

    // omitted from file-level errors
    filasPreview.filter(f => f.error).forEach(f => {
      csvRows.push([f.sku || `Fila ${f._idx + 1}`, 'Rechazado (validacion local)', f.error])
    })

    descargarCsv(nombreArchivo, csvHeaders, csvRows)
  }

  // --- Render Step A ---

  function renderPasoA() {
    return (
      <div>
        <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}>Seleccione el archivo a importar</h3>
        <p style={{ color: 'var(--gray-600)', marginBottom: 16, lineHeight: 1.5, fontSize: 13 }}>
          Formatos soportados: <strong>.xlsx</strong>, <strong>.xls</strong> y <strong>.csv</strong>.
          La primera fila del archivo debe contener los encabezados de columna.
        </p>
        <div
          style={{
            border: '2px dashed var(--gray-300)', borderRadius: 8, padding: '32px 24px',
            textAlign: 'center', background: 'var(--gray-50)', marginBottom: 16, cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--gray-300)'}
        >
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} style={{ display: 'none' }} />
          <div style={{ fontSize: 32, marginBottom: 8, color: 'var(--gray-400)' }}>&#128206;</div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
            {loading ? 'Procesando archivo...' : 'Haga clic para seleccionar un archivo'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>o arrastre y suelte aqui</div>
        </div>
        <div style={{
          background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 6,
          padding: '10px 14px', fontSize: 12, color: '#9A3412', lineHeight: 1.5,
        }}>
          <strong>Importante:</strong> Para evitar la perdida de ceros a la izquierda en SKUs o
          Codigos de Barras numericos, asegurese de formatear esas columnas como <strong>Texto</strong>{' '}
          en Excel antes de importar.
        </div>
        {file && (
          <div style={{ marginTop: 16, padding: '8px 12px', background: 'var(--gray-100)', borderRadius: 6, fontSize: 13 }}>
            Archivo seleccionado: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
          </div>
        )}
      </div>
    )
  }

  // --- Render Step B ---

  function renderPasoB() {
    return (
      <div>
        <h3 style={{ marginBottom: 4, fontSize: 16, fontWeight: 600 }}>Mapeo de columnas</h3>
        <p style={{ color: 'var(--gray-500)', marginBottom: 20, fontSize: 13 }}>
          Asocie cada campo del sistema con la columna del archivo Excel.
          Las preview muestran los primeros valores detectados.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {CAMPOS_SISTEMA.map(campo => {
            const isDisabled = campo.key === 'nombre' && usarSkuComoNombre
            const colMapeada = mapeoColumnas[campo.key]
            const previewVals = colMapeada ? getPreviewValues(rows, colMapeada) : []

            return (
              <div
                key={campo.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '150px 1fr',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--gray-100)',
                  opacity: isDisabled ? 0.5 : 1,
                }}
              >
                <div>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>
                    {campo.label}
                    {campo.obligatorio && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
                  </span>
                  {colMapeada && (
                    <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 2 }}>Mapeada</div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {campo.key === 'nombre' && (
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                      background: usarSkuComoNombre ? '#EFF6FF' : 'var(--gray-50)',
                      border: '1px solid ' + (usarSkuComoNombre ? '#BFDBFE' : 'var(--gray-200)'),
                      borderRadius: 4, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                      <input
                        type="checkbox"
                        checked={usarSkuComoNombre}
                        onChange={e => setUsarSkuComoNombre(e.target.checked)}
                        style={{ margin: 0 }}
                      />
                      Usar SKU como Nombre
                    </label>
                  )}

                  {!isDisabled && (
                    <>
                      <select
                        className="form-control"
                        value={colMapeada || ''}
                        onChange={e => setMapeoColumnas(prev => ({
                          ...prev,
                          [campo.key]: e.target.value || undefined,
                        }))}
                        style={{ maxWidth: 260, fontSize: 13, padding: '5px 8px' }}
                      >
                        <option value="">-- No mapear / completar despues --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>

                      {previewVals.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {previewVals.map((v, i) => (
                            <span
                              key={i}
                              className="badge badge-info"
                              title={v}
                              style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {isDisabled && (
                    <span style={{ fontSize: 12, color: 'var(--gray-400)', fontStyle: 'italic' }}>
                      Se usara el valor del SKU
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {!mapeoColumnas.sku && (
          <div style={{
            marginTop: 16, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 6, fontSize: 13, color: '#991B1B',
          }}>
            La columna <strong>SKU</strong> es obligatoria para poder importar.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn btn-outline" onClick={() => { setError(''); setPasoActual(1) }}>
            Volver
          </button>
          <button className="btn btn-primary" onClick={avanzarPasoB} disabled={!mapeoColumnas.sku}>
            Siguiente
          </button>
        </div>
      </div>
    )
  }

  // --- Render individual field for Step C ---

  function renderCampoPasoC(campo, requerido) {
    const esNumero = campo.numerico
    const catMapped = categoriasDetectadas.length > 0

    return (
      <div
        key={campo.key}
        style={{
          border: '1px solid var(--gray-200)', borderRadius: 8, padding: 16, marginBottom: 16,
          background: requerido ? '#FFFBEB' : 'white',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <strong style={{ fontSize: 14 }}>{campo.label}</strong>
          {requerido && <span className="badge badge-danger">Requerido</span>}
          {campo.defaultVal && (
            <span className="badge badge-info">Default: {campo.defaultVal}</span>
          )}
        </div>

        {/* Global value */}
        <div className="form-group" style={{ marginBottom: catMapped ? 12 : 0 }}>
          <label style={{ fontSize: 12 }}>Valor unico general</label>
          <input
            type="text"
            className="form-control"
            value={defaults[campo.key] ?? ''}
            onChange={e => setDefaults(prev => ({ ...prev, [campo.key]: e.target.value }))}
            placeholder={requerido ? 'Ingrese un valor para todas las filas...' : `Vacio = usar default (${campo.defaultVal})`}
            style={{ maxWidth: 220, fontSize: 13 }}
          />
          {esNumero && defaults[campo.key] && defaults[campo.key].includes(',') && (
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
              Se convertira: {defaults[campo.key]} - {parseDecimalArgentina(defaults[campo.key])}
            </div>
          )}
        </div>

        {/* Per-category */}
        {catMapped && (
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Valores por categoria</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {categoriasDetectadas.map(cat => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ minWidth: 130, fontSize: 12, color: 'var(--gray-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cat}>
                    {cat}
                  </span>
                  <input
                    type="text"
                    className="form-control"
                    value={defaultsPorCategoria[cat]?.[campo.key] ?? ''}
                    onChange={e => setDefaultsPorCategoria(prev => ({
                      ...prev,
                      [cat]: { ...(prev[cat] || {}), [campo.key]: e.target.value },
                    }))}
                    placeholder={`Vacio = usar "${defaults[campo.key] || ''}"`}
                    style={{ maxWidth: 180, fontSize: 12, padding: '4px 8px' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manual selection */}
        <div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              if (selActiva === campo.key) {
                setSelActiva(null)
                setSelFilas(new Set())
                setSelValor('')
              } else {
                setSelActiva(campo.key)
                setSelFilas(new Set())
                setSelValor('')
              }
            }}
          >
            {selActiva === campo.key ? 'Cerrar seleccion' : 'Seleccionar filas manualmente'}
          </button>

          {selActiva === campo.key && (
            <div style={{
              marginTop: 8, border: '1px solid var(--gray-200)', borderRadius: 6, overflow: 'hidden',
            }}>
              <div style={{
                padding: '8px 12px', background: 'var(--gray-50)', display: 'flex', gap: 8,
                alignItems: 'center', borderBottom: '1px solid var(--gray-200)',
              }}>
                <input
                  type="text"
                  className="form-control"
                  value={selValor}
                  onChange={e => setSelValor(e.target.value)}
                  placeholder="Valor para aplicar..."
                  style={{ maxWidth: 180, fontSize: 12, padding: '4px 8px' }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={aplicarSeleccionManual}
                  disabled={selFilas.size === 0 || !selValor}
                >
                  Aplicar a {selFilas.size} fila{selFilas.size !== 1 ? 's' : ''}
                </button>
                {overridesManuales[campo.key] && Object.keys(overridesManuales[campo.key]).length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    {Object.keys(overridesManuales[campo.key]).length} filas con override
                  </span>
                )}
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36, padding: '6px 8px' }}>
                        <input type="checkbox" checked={selFilas.size === rows.length && rows.length > 0} onChange={toggleSelTodas} />
                      </th>
                      <th style={{ padding: '6px 8px' }}>SKU</th>
                      <th style={{ padding: '6px 8px' }}>Nombre</th>
                      <th style={{ padding: '6px 8px' }}>Valor actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const skuVal = mapeoColumnas.sku ? row[mapeoColumnas.sku] : ''
                      const nomVal = usarSkuComoNombre
                        ? skuVal
                        : (mapeoColumnas.nombre ? row[mapeoColumnas.nombre] : '')
                      const actual = overridesManuales[campo.key]?.[idx]

                      return (
                        <tr key={idx} style={{ background: actual ? '#EFF6FF' : undefined }}>
                          <td style={{ padding: '4px 8px' }}>
                            <input
                              type="checkbox"
                              checked={selFilas.has(idx)}
                              onChange={() => toggleSelFila(idx)}
                            />
                          </td>
                          <td style={{ padding: '4px 8px', fontWeight: 500 }}>{skuVal || `#${idx + 1}`}</td>
                          <td style={{ padding: '4px 8px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {nomVal || '--'}
                          </td>
                          <td style={{ padding: '4px 8px', color: actual ? 'var(--primary)' : 'var(--gray-400)' }}>
                            {actual || '--'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- Render Step C ---

  function renderPasoC() {
    const requeridos = camposRequierenValor
    const opcionales = camposSinMapear.filter(c => c.defaultVal)

    return (
      <div>
        <h3 style={{ marginBottom: 4, fontSize: 16, fontWeight: 600 }}>Completar campos sin mapear</h3>
        <p style={{ color: 'var(--gray-500)', marginBottom: 20, fontSize: 13 }}>
          Para cada campo no mapeado, defina un valor unico, valores por categoria, y/o seleccione filas especificas.
          Prioridad: seleccion manual &gt; valor por grupo &gt; valor unico &gt; default del schema.
        </p>

        {requeridos.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Campos requeridos
            </h4>
            {requeridos.map(c => renderCampoPasoC(c, true))}
          </div>
        )}

        {opcionales.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Campos opcionales (valores por defecto modificables)
            </h4>
            {opcionales.map(c => renderCampoPasoC(c, false))}
          </div>
        )}

        {requeridos.length === 0 && opcionales.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '32px 0', color: 'var(--gray-400)',
            background: 'var(--gray-50)', borderRadius: 8, marginBottom: 16,
          }}>
            Todos los campos requeridos estan mapeados. Puede continuar al siguiente paso.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn btn-outline" onClick={() => { setError(''); setPasoActual(2) }}>
            Volver
          </button>
          <button className="btn btn-primary" onClick={avanzarPasoD} disabled={!puedeAvanzarPasoC() || loading}>
            {loading ? 'Procesando...' : 'Siguiente'}
          </button>
        </div>
      </div>
    )
  }

  // --- Render editable cell helper ---

  function renderCeldaEditable(fila, campo, valor, style = {}) {
    const esEditable = true
    return (
      <td
        style={{ ...style, cursor: esEditable ? 'text' : undefined, padding: 0 }}
      >
        <input
          type="text"
          value={valor ?? ''}
          onChange={e => editarCampoFila(fila._idx, campo, e.target.value)}
          style={{
            width: '100%',
            border: 'none',
            background: 'transparent',
            fontSize: 13,
            padding: '8px 12px',
            margin: 0,
            outline: 'none',
            fontFamily: 'inherit',
            color: 'inherit',
          }}
          onFocus={e => {
            e.target.style.background = '#EFF6FF'
            e.target.style.boxShadow = 'inset 0 0 0 2px var(--primary)'
          }}
          onBlur={e => {
            e.target.style.background = 'transparent'
            e.target.style.boxShadow = 'none'
          }}
        />
      </td>
    )
  }

  // --- Render Step D ---

  function renderPasoD() {
    const { total, aCrear, aActualizar, aOmitir, conErrores } = contadores
    const conflictosDB = filasPreview.filter(f => f.existeEnDB && !f.error)

    return (
      <div>
        <h3 style={{ marginBottom: 4, fontSize: 16, fontWeight: 600 }}>Vista previa de la importacion</h3>
        <p style={{ color: 'var(--gray-500)', marginBottom: 16, fontSize: 13 }}>
          Revise las filas antes de importar. Los conflictos con productos existentes requieren una decision.
        </p>

        {/* Counters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="stat-card" style={{ flex: '1 1 100px', padding: '10px 14px' }}>
            <div className="stat-label">Total filas</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{total}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 100px', padding: '10px 14px', borderLeft: '3px solid var(--success)' }}>
            <div className="stat-label">A crear</div>
            <div className="stat-value" style={{ fontSize: 20, color: 'var(--success)' }}>{aCrear}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 100px', padding: '10px 14px', borderLeft: '3px solid var(--primary)' }}>
            <div className="stat-label">A actualizar</div>
            <div className="stat-value" style={{ fontSize: 20, color: 'var(--primary)' }}>{aActualizar}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 100px', padding: '10px 14px', borderLeft: '3px solid var(--gray-400)' }}>
            <div className="stat-label">A omitir</div>
            <div className="stat-value" style={{ fontSize: 20, color: 'var(--gray-500)' }}>{aOmitir}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 100px', padding: '10px 14px', borderLeft: '3px solid var(--danger)' }}>
            <div className="stat-label">Con errores</div>
            <div className="stat-value" style={{ fontSize: 20, color: 'var(--danger)' }}>{conErrores}</div>
          </div>
        </div>

        {/* Global conflict control */}
        {conflictosDB.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
            padding: '10px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6,
          }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {conflictosDB.length} producto{conflictosDB.length !== 1 ? 's' : ''} existente{conflictosDB.length !== 1 ? 's' : ''} en base de datos:
            </span>
            <select
              className="form-control"
              value={conflictoGlobal}
              onChange={e => aplicarConflictoGlobal(e.target.value)}
              style={{ maxWidth: 260, fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">-- Seleccionar accion para todos --</option>
              <option value="actualizar">Actualizar todos</option>
              <option value="omitir">Omitir todos</option>
            </select>
            {loadingConflicto && (
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Verificando...</span>
            )}
          </div>
        )}

        {loadingConflicto && conflictosDB.length === 0 && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 6, fontSize: 13, color: 'var(--gray-500)' }}>
            Verificando existencia en base de datos...
          </div>
        )}

        {/* Table */}
        <div className="table-container" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Categoria</th>
                <th>Precio Costo</th>
                <th>Precio Venta</th>
                <th>Stock</th>
                <th>Stock Min.</th>
                <th>Cod. Barras</th>
                <th>Estado</th>
                <th style={{ width: 140 }}>Accion</th>
              </tr>
            </thead>
            <tbody>
              {filasPaginaActual.map(f => {
                const globalIdx = f._idx
                const startIdx = (pagePreview - 1) * FILAS_POR_PAGINA
                const numRow = startIdx + filasPaginaActual.indexOf(f) + 1

                let estadoBadge = null
                if (f.error) {
                  estadoBadge = <span className="badge badge-danger" title={f.error} style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{f.error}</span>
                } else if (f.estado === 'a_crear') {
                  estadoBadge = <span className="badge badge-success">A crear</span>
                } else if (f.estado === 'a_actualizar') {
                  estadoBadge = <span className="badge badge-info">A actualizar</span>
                } else if (f.estado === 'omitir') {
                  estadoBadge = <span className="badge badge-warning">Omitir</span>
                }

                const bgFila = f.error ? '#FEF2F2' : f.existeEnDB ? '#EFF6FF' : f.editado ? '#F0FDF4' : undefined

                return (
                  <tr
                    key={globalIdx}
                    style={{ background: bgFila }}
                  >
                    <td style={{ fontSize: 12, color: 'var(--gray-500)', padding: '8px 12px' }}>
                      {numRow}
                      {f.editado && (
                        <span title="Editado" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', marginLeft: 4, verticalAlign: 'middle' }} />
                      )}
                    </td>
                    {renderCeldaEditable(f, 'sku', f.sku, { fontWeight: 500 })}
                    {renderCeldaEditable(f, 'nombre', f.nombre, { maxWidth: 180 })}
                    {renderCeldaEditable(f, 'categoriaNombre', f.categoriaNombre)}
                    {renderCeldaEditable(f, 'precioCosto', f.precioCosto)}
                    {renderCeldaEditable(f, 'precioVenta', f.precioVenta)}
                    {renderCeldaEditable(f, 'stockActual', f.stockActual)}
                    {renderCeldaEditable(f, 'stockMinimo', f.stockMinimo)}
                    {renderCeldaEditable(f, 'codigoBarras', f.codigoBarras)}
                    <td style={{ padding: '8px 12px' }}>{estadoBadge}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {f.existeEnDB && !f.error && (
                          <select
                            className="form-control"
                            value={f.estado === 'omitir' ? 'omitir' : 'actualizar'}
                            onChange={() => toggleConflictoFila(globalIdx)}
                            style={{ fontSize: 11, padding: '2px 4px', maxWidth: 90 }}
                          >
                            <option value="actualizar">Actualizar</option>
                            <option value="omitir">Omitir</option>
                          </select>
                        )}
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => eliminarFila(globalIdx)}
                          title="Eliminar fila"
                          style={{ padding: '2px 6px', fontSize: 11, lineHeight: 1 }}
                        >
                          X
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filasPreview.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>
                    No hay filas para mostrar
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPaginasPreview > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            <button
              className="btn btn-sm btn-outline"
              disabled={pagePreview <= 1}
              onClick={() => setPagePreview(p => p - 1)}
            >
              Anterior
            </button>
            <span style={{ padding: '4px 8px', fontSize: 13, color: 'var(--gray-500)' }}>
              Pag. {pagePreview} de {totalPaginasPreview}
            </span>
            <button
              className="btn btn-sm btn-outline"
              disabled={pagePreview >= totalPaginasPreview}
              onClick={() => setPagePreview(p => p + 1)}
            >
              Siguiente
            </button>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn btn-outline" onClick={() => { setError(''); setPasoActual(3) }}>
            Volver
          </button>
          <button
            className="btn btn-success"
            onClick={() => setPasoActual(5)}
            disabled={filasImportables.length === 0}
          >
            Confirmar importacion ({filasImportables.length} fila{filasImportables.length !== 1 ? 's' : ''})
          </button>
        </div>
      </div>
    )
  }

  // --- Render Step E ---

  function renderPasoE() {
    return (
      <div>
        <h3 style={{ marginBottom: 4, fontSize: 16, fontWeight: 600 }}>Confirmar importacion</h3>
        <p style={{ color: 'var(--gray-500)', marginBottom: 20, fontSize: 13 }}>
          Se importaran <strong>{filasImportables.length}</strong> producto{filasImportables.length !== 1 ? 's' : ''}.
          {contadores.conErrores > 0 && (
            <span> <strong>{contadores.conErrores}</strong> fila{contadores.conErrores !== 1 ? 's' : ''} con errores seran excluidas.</span>
          )}
          {contadores.aOmitir > 0 && (
            <span> <strong>{contadores.aOmitir}</strong> fila{contadores.aOmitir !== 1 ? 's' : ''} marcadas como omitir seran excluidas.</span>
          )}
        </p>

        {/* Summary of what will happen */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--gray-700)' }}>
            <strong>Resumen de la operacion:</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {contadores.aCrear > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span className="badge badge-success">+</span>
                {contadores.aCrear} producto{contadores.aCrear !== 1 ? 's' : ''} nuevo{contadores.aCrear !== 1 ? 's' : ''} a crear
              </div>
            )}
            {contadores.aActualizar > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span className="badge badge-info">~</span>
                {contadores.aActualizar} producto{contadores.aActualizar !== 1 ? 's' : ''} existente{contadores.aActualizar !== 1 ? 's' : ''} a actualizar
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setPasoActual(4)} disabled={importando}>
            Volver
          </button>
          <button className="btn btn-primary" onClick={confirmarImportacion} disabled={filasImportables.length === 0 || importando}>
            {importando ? 'Importando...' : 'Ejecutar importacion'}
          </button>
        </div>
      </div>
    )
  }

  // --- Render Step F (Results) ---

  function renderPasoF() {
    if (!resultadoImportacion) return null

    return (
      <div>
        <h3 style={{ marginBottom: 4, fontSize: 16, fontWeight: 600 }}>Resultado de la importacion</h3>
        <p style={{ color: 'var(--gray-500)', marginBottom: 20, fontSize: 13 }}>
          La importacion se ha completado. A continuacion el resumen:
        </p>

        {/* Result counters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div className="stat-card" style={{ flex: '1 1 120px', padding: '16px 20px', borderLeft: '4px solid var(--success)' }}>
            <div className="stat-label">Creados</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>{resultadoImportacion.creados}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 120px', padding: '16px 20px', borderLeft: '4px solid var(--primary)' }}>
            <div className="stat-label">Actualizados</div>
            <div className="stat-value" style={{ color: 'var(--primary)' }}>{resultadoImportacion.actualizados}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 120px', padding: '16px 20px', borderLeft: '4px solid var(--gray-400)' }}>
            <div className="stat-label">Omitidos</div>
            <div className="stat-value" style={{ color: 'var(--gray-500)' }}>{resultadoImportacion.omitidos}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 120px', padding: '16px 20px', borderLeft: '4px solid var(--danger)' }}>
            <div className="stat-label">Rechazados</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>{resultadoImportacion.errores?.length || 0}</div>
          </div>
        </div>

        {/* Errors table */}
        {resultadoImportacion.errores && resultadoImportacion.errores.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 12 }}>
              Errores durante la importacion
            </h4>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadoImportacion.errores.map((e, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{e.sku}</td>
                      <td style={{ color: 'var(--danger)' }}>{e.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => navigate('/productos')}>
            Ir a Productos
          </button>
          <button className="btn btn-outline" onClick={descargarCsvResultados}>
            Descargar detalle CSV
          </button>
          <button className="btn btn-primary" onClick={() => {
            // Reset everything to start fresh
            setPasoActual(1)
            setFile(null)
            setHeaders([])
            setRows([])
            setMapeoColumnas({})
            setUsarSkuComoNombre(false)
            setDefaults({ ...SCHEMA_DEFAULTS })
            setDefaultsPorCategoria({})
            setOverridesManuales({})
            setFilasPreview([])
            setAccionesConflicto({})
            setConflictoGlobal('')
            setResultadoImportacion(null)
            setError('')
          }}>
            Nueva importacion
          </button>
        </div>
      </div>
    )
  }

  // --- Main render ---

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Importar Productos</span>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/productos')}>Volver</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 24 }}>
          {PASOS.map(p => (
            <div
              key={p.num}
              style={{
                flex: 1, height: 4, borderRadius: 2,
                background: p.num <= pasoActual ? 'var(--primary)' : 'var(--gray-200)',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        <div style={{ marginBottom: 20, fontSize: 12, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Paso {pasoActual} de {PASOS.length}: {PASOS[pasoActual - 1].label}
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
        )}

        {pasoActual === 1 && renderPasoA()}
        {pasoActual === 2 && renderPasoB()}
        {pasoActual === 3 && renderPasoC()}
        {pasoActual === 4 && renderPasoD()}
        {pasoActual === 5 && renderPasoE()}
        {pasoActual === 6 && renderPasoF()}
      </div>
    </div>
  )
}
