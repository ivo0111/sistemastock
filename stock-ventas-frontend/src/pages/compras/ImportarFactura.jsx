import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, getBlob, post, postForm } from '../../api/client'

const ALICUOTAS = [21, 10.5, 27, 5, 2.5, 0]

const CONDICIONES_IVA = [
  { value: 'RESPONSABLE_INSCRIPTO', label: 'Responsable Inscripto' },
  { value: 'MONOTRIBUTO', label: 'Monotributo' },
  { value: 'CONSUMIDOR_FINAL', label: 'Consumidor Final' },
  { value: 'EXENTO', label: 'Exento' },
]

const money = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
})

function redondear(valor) {
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return 0
  return Math.round((numero + Number.EPSILON) * 100) / 100
}

function numeroOpcional(valor) {
  if (valor === '' || valor === null || valor === undefined) return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function textoOpcional(valor) {
  const texto = String(valor ?? '').trim()
  return texto || null
}

function fechaCorta(valor) {
  if (!valor) return '-'
  return new Date(valor).toLocaleString('es-AR')
}

export default function ImportarFactura() {
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [proveedores, setProveedores] = useState([])
  const [productos, setProductos] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [importacion, setImportacion] = useState(null)
  const [revision, setRevision] = useState(null)

  const [cargandoDatos, setCargandoDatos] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    ;(async () => {
      try {
        const [listaProveedores, listaPendientes] = await Promise.all([
          get('/proveedores'),
          get('/compras/importaciones', { estado: 'PENDIENTE' }),
        ])
        if (!vigente) return
        setProveedores(Array.isArray(listaProveedores) ? listaProveedores : [])
        setPendientes(Array.isArray(listaPendientes) ? listaPendientes : [])

        // El endpoint de productos pagina de a 100: para el selector se traen
        // todas las páginas. El catálogo de un comercio minorista entra holgado.
        const todos = []
        let page = 1
        for (;;) {
          const res = await get('/productos', { page, limit: 100 })
          const data = Array.isArray(res?.data) ? res.data : []
          todos.push(...data)
          const total = Number(res?.total ?? todos.length)
          if (data.length === 0 || todos.length >= total || page >= 50) break
          page += 1
        }
        if (vigente) setProductos(todos)
      } catch (err) {
        if (vigente) setError(err.message || 'No se pudieron cargar los datos')
      } finally {
        if (vigente) setCargandoDatos(false)
      }
    })()
    return () => {
      vigente = false
    }
  }, [])

  async function recargarPendientes() {
    try {
      const lista = await get('/compras/importaciones', { estado: 'PENDIENTE' })
      setPendientes(Array.isArray(lista) ? lista : [])
    } catch {
      // No es crítico: la pantalla principal ya muestra el error del flujo.
    }
  }

  function crearRevision(data) {
    const proveedorSugerido = data?.proveedorSugerido
    const proveedorId = data?.proveedorId ?? proveedorSugerido?.id ?? null
    const proveedorExistente = proveedores.find((p) => p.id === proveedorId)

    const proveedorSeleccion = proveedorId
      ? String(proveedorId)
      : data?.proveedorNombre
        ? '__nuevo__'
        : ''

    const items = (data?.items ?? []).map((item) => {
      const costo = Number(item.precioUnitario) || 0
      return {
        ...item,
        sugerencias: item.sugerencias ?? [],
        asignacion: item.productoIdSugerido ? String(item.productoIdSugerido) : '',
        sugerenciaAuto: Boolean(item.productoIdSugerido),
        alicuotaIva:
          item.alicuotaIva === null || item.alicuotaIva === undefined
            ? ''
            : String(item.alicuotaIva),
        nuevo: {
          nombre: item.descripcion || '',
          sku: item.codigoProveedor || '',
          precioVenta: String(redondear(costo * 1.3)),
        },
      }
    })

    return {
      proveedorSeleccion,
      crearProveedor: {
        nombre: data?.proveedorNombre || proveedorExistente?.nombre || '',
        cuit: data?.proveedorCuit || proveedorExistente?.cuit || '',
        condicionIva: proveedorExistente?.condicionIva || '',
      },
      comprobante: {
        tipoComprobante: data?.tipoComprobante || '',
        puntoVenta: data?.puntoVenta ?? '',
        numeroComprobante: data?.numeroComprobante || '',
        fechaComprobante: data?.fechaComprobante
          ? String(data.fechaComprobante).slice(0, 10)
          : '',
        subtotal: data?.subtotal ?? '',
        iva: data?.iva ?? '',
        percepciones: data?.percepciones ?? '',
        total: data?.total ?? '',
        cae: data?.cae || '',
      },
      items,
    }
  }

  async function abrirImportacion(data) {
    setImportacion(data)
    setRevision(crearRevision(data))
    setError('')
  }

  async function handleArchivo(event) {
    const archivo = event.target.files?.[0]
    if (!archivo) return
    setError('')

    if (!archivo.name.toLowerCase().endsWith('.pdf')) {
      setError('Seleccioná un archivo PDF de la factura')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setSubiendo(true)
    try {
      const formData = new FormData()
      formData.append('archivo', archivo)
      const data = await postForm('/compras/importaciones', formData)
      await abrirImportacion(data)
      await recargarPendientes()
    } catch (err) {
      setError(err.message || 'No se pudo importar la factura')
    } finally {
      setSubiendo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function revisarPendiente(id) {
    setError('')
    setSubiendo(true)
    try {
      const data = await get(`/compras/importaciones/${id}`)
      await abrirImportacion(data)
    } catch (err) {
      setError(err.message || 'No se pudo abrir la importación')
    } finally {
      setSubiendo(false)
    }
  }

  async function verPdf() {
    if (!importacion) return
    try {
      const blob = await getBlob(`/compras/importaciones/${importacion.id}/archivo`)
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.target = '_blank'
      enlace.rel = 'noopener'
      enlace.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      setError(err.message || 'No se pudo abrir el PDF')
    }
  }

  async function descartar() {
    if (!importacion) return
    if (!window.confirm('¿Descartar esta importación? El PDF quedará guardado, pero no se creará ninguna compra.')) {
      return
    }
    setGuardando(true)
    setError('')
    try {
      await post(`/compras/importaciones/${importacion.id}/descartar`)
      setImportacion(null)
      setRevision(null)
      await recargarPendientes()
    } catch (err) {
      setError(err.message || 'No se pudo descartar la importación')
    } finally {
      setGuardando(false)
    }
  }

  function actualizarComprobante(campo, valor) {
    setRevision((prev) => ({
      ...prev,
      comprobante: { ...prev.comprobante, [campo]: valor },
    }))
  }

  function actualizarProveedor(campo, valor) {
    setRevision((prev) => ({
      ...prev,
      crearProveedor: { ...prev.crearProveedor, [campo]: valor },
    }))
  }

  function actualizarItem(index, campo, valor) {
    setRevision((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [campo]: valor } : item)),
    }))
  }

  function actualizarNuevo(index, campo, valor) {
    setRevision((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, nuevo: { ...item.nuevo, [campo]: valor } } : item
      ),
    }))
  }

  function asignarProducto(index, valor) {
    setRevision((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item

        const siguiente = { ...item, asignacion: valor, sugerenciaAuto: false }
        if (valor && valor !== '__nuevo__') {
          const producto = productos.find((p) => String(p.id) === valor)
          if (producto && siguiente.alicuotaIva === '') {
            siguiente.alicuotaIva = String(producto.alicuotaIva ?? '')
          }
        }
        if (valor === '__nuevo__' && !Number(item.nuevo.precioVenta)) {
          siguiente.nuevo = {
            ...item.nuevo,
            precioVenta: String(redondear(Number(item.precioUnitario) * 1.3)),
          }
        }
        return siguiente
      }),
    }))
  }

  const sinProducto = revision
    ? revision.items.filter((item) => !item.asignacion).length
    : 0

  const cantidadesInvalidas = revision
    ? revision.items.filter(
        (item) => !Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) <= 0
      ).length
    : 0

  const productosNuevosIncompletos = revision
    ? revision.items.filter(
        (item) =>
          item.asignacion === '__nuevo__' &&
          (!item.nuevo.nombre.trim() ||
            !Number.isFinite(Number(item.nuevo.precioVenta)) ||
            Number(item.nuevo.precioVenta) < 0)
      ).length
    : 0

  const proveedorValido = revision
    ? revision.proveedorSeleccion === '__nuevo__'
      ? Boolean(revision.crearProveedor.nombre.trim())
      : Boolean(revision.proveedorSeleccion)
    : false

  const totalItems = revision
    ? redondear(
        revision.items.reduce(
          (suma, item) => suma + Number(item.cantidad || 0) * Number(item.precioUnitario || 0),
          0
        )
      )
    : 0

  const totalFactura = revision ? Number(revision.comprobante.total || 0) : 0
  const diferenciaTotal = redondear(totalItems - totalFactura)

  const puedeConfirmar =
    revision &&
    importacion &&
    proveedorValido &&
    sinProducto === 0 &&
    cantidadesInvalidas === 0 &&
    productosNuevosIncompletos === 0 &&
    !guardando

  async function confirmar() {
    if (!revision || !importacion) return
    setError('')

    if (!proveedorValido) {
      setError('Elegí un proveedor existente o completá los datos del proveedor nuevo')
      return
    }
    if (sinProducto > 0) {
      setError(`Falta asignar un producto a ${sinProducto} línea(s)`)
      return
    }
    if (cantidadesInvalidas > 0) {
      setError('Las cantidades deben ser números enteros mayores a cero')
      return
    }
    if (productosNuevosIncompletos > 0) {
      setError('Completá nombre y precio de venta de los productos nuevos')
      return
    }

    const body = {
      items: revision.items.map((item) => {
        const base = {
          linea: item.linea,
          cantidad: Number(item.cantidad),
          precioUnitario: Number(item.precioUnitario),
          ...(item.alicuotaIva !== '' ? { alicuotaIva: Number(item.alicuotaIva) } : {}),
        }
        if (item.asignacion === '__nuevo__') {
          return {
            ...base,
            crearProducto: {
              nombre: item.nuevo.nombre.trim(),
              ...(item.nuevo.sku.trim() ? { sku: item.nuevo.sku.trim() } : {}),
              precioVenta: Number(item.nuevo.precioVenta),
            },
          }
        }
        return { ...base, productoId: Number(item.asignacion) }
      }),
      comprobante: {
        tipoComprobante: textoOpcional(revision.comprobante.tipoComprobante),
        puntoVenta: numeroOpcional(revision.comprobante.puntoVenta),
        numeroComprobante: textoOpcional(revision.comprobante.numeroComprobante),
        fechaComprobante: revision.comprobante.fechaComprobante || null,
        subtotal: numeroOpcional(revision.comprobante.subtotal),
        iva: numeroOpcional(revision.comprobante.iva),
        percepciones: numeroOpcional(revision.comprobante.percepciones),
        total: numeroOpcional(revision.comprobante.total),
        cae: textoOpcional(revision.comprobante.cae),
      },
    }

    if (revision.proveedorSeleccion === '__nuevo__') {
      body.crearProveedor = {
        nombre: revision.crearProveedor.nombre.trim(),
        ...(revision.crearProveedor.cuit.trim()
          ? { cuit: revision.crearProveedor.cuit.trim() }
          : {}),
        ...(revision.crearProveedor.condicionIva
          ? { condicionIva: revision.crearProveedor.condicionIva }
          : {}),
      }
    } else {
      body.proveedorId = Number(revision.proveedorSeleccion)
    }

    setGuardando(true)
    try {
      const compra = await post(
        `/compras/importaciones/${importacion.id}/confirmar`,
        body
      )
      navigate(`/compras/${compra.id}`)
    } catch (err) {
      setError(err.message || 'No se pudo confirmar la importación')
    } finally {
      setGuardando(false)
    }
  }

  function volverAlInicio() {
    setImportacion(null)
    setRevision(null)
    setError('')
    recargarPendientes()
  }

  if (cargandoDatos) return <div className="loading">Cargando...</div>

  if (!importacion || !revision) {
    return (
      <div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Importar Factura de Compra</span>
            <button className="btn btn-outline" onClick={() => navigate('/compras')}>
              Volver
            </button>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div
            style={{
              border: '2px dashed var(--gray-300)',
              borderRadius: 8,
              padding: '40px 24px',
              textAlign: 'center',
              background: 'var(--gray-50)',
              cursor: subiendo ? 'wait' : 'pointer',
              marginBottom: 16,
            }}
            onClick={() => {
              if (!subiendo) fileRef.current?.click()
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleArchivo}
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: 36, marginBottom: 8, color: 'var(--gray-400)' }}>
              &#128196;
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {subiendo ? 'Leyendo la factura...' : 'Hacé clic para seleccionar el PDF'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              Factura electrónica ARCA (PDF con texto seleccionable), hasta 15 MB
            </div>
          </div>

          <div
            style={{
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: 6,
              padding: '12px 16px',
              fontSize: 13,
              color: '#1E40AF',
              lineHeight: 1.6,
            }}
          >
            <strong>No impacta stock todavía.</strong> Primero se muestran los datos detectados
            y las sugerencias de productos. Recién al confirmar la revisión se registra la
            compra y se suma el stock.
          </div>
        </div>

        {pendientes.length > 0 && (
          <div className="card mt-4">
            <div className="card-header">
              <span className="card-title">Importaciones pendientes ({pendientes.length})</span>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Archivo</th>
                    <th>Proveedor detectado</th>
                    <th>Comprobante</th>
                    <th>Importe</th>
                    <th>Importada</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((item) => (
                    <tr key={item.id}>
                      <td>{item.nombreArchivo || `Importación #${item.id}`}</td>
                      <td>{item.proveedorNombre || item.proveedor?.nombre || '-'}</td>
                      <td>
                        {item.tipoComprobante || '-'}{' '}
                        {item.puntoVenta !== null && item.numeroComprobante
                          ? `${item.puntoVenta}-${item.numeroComprobante}`
                          : ''}
                      </td>
                      <td>{item.total !== null ? money.format(Number(item.total)) : '-'}</td>
                      <td>{fechaCorta(item.creadoEn)}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={subiendo}
                          onClick={() => revisarPendiente(item.id)}
                        >
                          Revisar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  const confianza = Number(importacion.confianza ?? 0)
  const confianzaClase =
    confianza >= 80 ? 'badge-success' : confianza >= 50 ? 'badge-warning' : 'badge-danger'
  const proveedorSugerido = importacion.proveedorSugerido

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Revisar factura importada</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-outline" onClick={verPdf}>
              Ver PDF
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={descartar}
              disabled={guardando}
            >
              Descartar
            </button>
            <button className="btn btn-sm btn-outline" onClick={volverAlInicio}>
              Volver
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="grid-4" style={{ marginBottom: 16 }}>
          <div>
            <div className="text-sm text-gray">Archivo</div>
            <div style={{ wordBreak: 'break-word' }}>
              {importacion.nombreArchivo || `Importación #${importacion.id}`}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray">Extracción</div>
            <div>
              <span className="badge badge-info">{importacion.motor}</span>{' '}
              <span className={`badge ${confianzaClase}`}>{confianza}% confianza</span>
            </div>
          </div>
          <div>
            <div className="text-sm text-gray">Estado</div>
            <div>
              <span className="badge badge-warning">{importacion.estado}</span>
            </div>
          </div>
          <div>
            <div className="text-sm text-gray">Líneas detectadas</div>
            <div style={{ fontWeight: 600 }}>{revision.items.length}</div>
          </div>
        </div>

        {importacion.advertencias?.length > 0 && (
          <div className="alert alert-info">
            <strong>Revisá estos puntos:</strong>
            <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
              {importacion.advertencias.map((advertencia, index) => (
                <li key={`${advertencia.codigo}-${index}`}>{advertencia.mensaje}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Proveedor</span>
          {proveedorSugerido && (
            <span className="badge badge-info">
              Sugerido: {proveedorSugerido.nombre} ({proveedorSugerido.puntaje}%)
            </span>
          )}
        </div>

        <div className="form-group">
          <label>Proveedor de la factura</label>
          <select
            className="form-control"
            value={revision.proveedorSeleccion}
            onChange={(e) =>
              setRevision((prev) => ({ ...prev, proveedorSeleccion: e.target.value }))
            }
          >
            <option value="">Seleccionar proveedor...</option>
            {proveedores.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.nombre}
                {proveedor.cuit ? ` — ${proveedor.cuit}` : ''}
              </option>
            ))}
            <option value="__nuevo__">+ Crear proveedor nuevo</option>
          </select>
          {revision.proveedorSeleccion === '__nuevo__' && (
            <div className="grid-3" style={{ marginTop: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Nombre / Razón social</label>
                <input
                  className="form-control"
                  value={revision.crearProveedor.nombre}
                  onChange={(e) => actualizarProveedor('nombre', e.target.value)}
                  placeholder="Razón social del proveedor"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>CUIT</label>
                <input
                  className="form-control"
                  value={revision.crearProveedor.cuit}
                  onChange={(e) => actualizarProveedor('cuit', e.target.value)}
                  placeholder="30-71234567-8"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Condición IVA</label>
                <select
                  className="form-control"
                  value={revision.crearProveedor.condicionIva}
                  onChange={(e) => actualizarProveedor('condicionIva', e.target.value)}
                >
                  <option value="">Sin especificar</option>
                  {CONDICIONES_IVA.map((condicion) => (
                    <option key={condicion.value} value={condicion.value}>
                      {condicion.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {importacion.proveedorCuit && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--gray-500)' }}>
              CUIT detectado en la factura: {importacion.proveedorCuit}
            </div>
          )}
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Comprobante</span>
        </div>

        <div className="grid-4">
          <div className="form-group">
            <label>Tipo</label>
            <input
              className="form-control"
              value={revision.comprobante.tipoComprobante}
              onChange={(e) => actualizarComprobante('tipoComprobante', e.target.value)}
              placeholder="A / B / C"
            />
          </div>
          <div className="form-group">
            <label>Punto de venta</label>
            <input
              className="form-control"
              type="number"
              min="0"
              value={revision.comprobante.puntoVenta}
              onChange={(e) => actualizarComprobante('puntoVenta', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Número</label>
            <input
              className="form-control"
              value={revision.comprobante.numeroComprobante}
              onChange={(e) => actualizarComprobante('numeroComprobante', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Fecha</label>
            <input
              className="form-control"
              type="date"
              value={revision.comprobante.fechaComprobante}
              onChange={(e) => actualizarComprobante('fechaComprobante', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Subtotal</label>
            <input
              className="form-control"
              type="number"
              step="0.01"
              value={revision.comprobante.subtotal}
              onChange={(e) => actualizarComprobante('subtotal', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>IVA</label>
            <input
              className="form-control"
              type="number"
              step="0.01"
              value={revision.comprobante.iva}
              onChange={(e) => actualizarComprobante('iva', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Percepciones</label>
            <input
              className="form-control"
              type="number"
              step="0.01"
              value={revision.comprobante.percepciones}
              onChange={(e) => actualizarComprobante('percepciones', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Total a pagar</label>
            <input
              className="form-control"
              type="number"
              step="0.01"
              value={revision.comprobante.total}
              onChange={(e) => actualizarComprobante('total', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>CAE</label>
            <input
              className="form-control"
              value={revision.comprobante.cae}
              onChange={(e) => actualizarComprobante('cae', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Productos de la factura</span>
          <span className="text-sm text-gray">
            {sinProducto > 0
              ? `${sinProducto} línea(s) sin asignar`
              : 'Todas las líneas tienen producto'}
          </span>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Descripción del proveedor</th>
                <th>Cantidad</th>
                <th>P. Unitario</th>
                <th>Subtotal</th>
                <th>Producto del sistema</th>
                <th>IVA %</th>
              </tr>
            </thead>
            <tbody>
              {revision.items.map((item, index) => {
                const cantidadNumero = Number(item.cantidad)
                const cantidadInvalida =
                  !Number.isInteger(cantidadNumero) || cantidadNumero <= 0

                return (
                  <tr key={item.linea}>
                    <td style={{ verticalAlign: 'top', color: 'var(--gray-500)' }}>
                      {item.linea}
                      {item.codigoProveedor && (
                        <div style={{ fontSize: 11 }}>{item.codigoProveedor}</div>
                      )}
                    </td>
                    <td style={{ verticalAlign: 'top', minWidth: 180, maxWidth: 280 }}>
                      {item.descripcion}
                    </td>
                    <td style={{ verticalAlign: 'top' }}>
                      <input
                        className="form-control"
                        type="number"
                        min="1"
                        step="1"
                        value={item.cantidad}
                        onChange={(e) => actualizarItem(index, 'cantidad', e.target.value)}
                        style={{
                          width: 80,
                          ...(cantidadInvalida ? { borderColor: 'var(--danger)' } : {}),
                        }}
                      />
                      {cantidadInvalida && (
                        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>
                          Entero mayor a 0
                        </div>
                      )}
                    </td>
                    <td style={{ verticalAlign: 'top' }}>
                      <input
                        className="form-control"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.precioUnitario}
                        onChange={(e) => actualizarItem(index, 'precioUnitario', e.target.value)}
                        style={{ width: 110 }}
                      />
                    </td>
                    <td style={{ verticalAlign: 'top', fontWeight: 600 }}>
                      {money.format(redondear(cantidadNumero * Number(item.precioUnitario || 0)))}
                    </td>
                    <td style={{ verticalAlign: 'top', minWidth: 240 }}>
                      <select
                        className="form-control"
                        value={item.asignacion}
                        onChange={(e) => asignarProducto(index, e.target.value)}
                      >
                        <option value="">Seleccionar producto...</option>
                        {productos.map((producto) => (
                          <option key={producto.id} value={producto.id}>
                            {producto.nombre} ({producto.sku})
                          </option>
                        ))}
                        <option value="__nuevo__">+ Crear producto nuevo</option>
                      </select>

                      {item.sugerenciaAuto && item.asignacion && item.asignacion !== '__nuevo__' && (
                        <div style={{ marginTop: 4 }}>
                          <span className="badge badge-success">Sugerido automáticamente</span>
                        </div>
                      )}

                      {!item.asignacion && item.sugerencias.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {item.sugerencias.map((sugerencia) => (
                            <button
                              key={sugerencia.productoId}
                              type="button"
                              className="btn btn-sm btn-outline"
                              style={{ textAlign: 'left' }}
                              onClick={() => asignarProducto(index, String(sugerencia.productoId))}
                            >
                              {sugerencia.nombre} ({sugerencia.puntaje}%)
                            </button>
                          ))}
                        </div>
                      )}

                      {item.asignacion === '__nuevo__' && (
                        <div
                          style={{
                            marginTop: 8,
                            padding: 8,
                            background: 'var(--gray-50)',
                            border: '1px solid var(--gray-200)',
                            borderRadius: 6,
                          }}
                        >
                          <div className="form-group" style={{ marginBottom: 6 }}>
                            <label style={{ fontSize: 11 }}>Nombre del producto</label>
                            <input
                              className="form-control"
                              value={item.nuevo.nombre}
                              onChange={(e) => actualizarNuevo(index, 'nombre', e.target.value)}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                              <label style={{ fontSize: 11 }}>SKU (opcional)</label>
                              <input
                                className="form-control"
                                value={item.nuevo.sku}
                                onChange={(e) => actualizarNuevo(index, 'sku', e.target.value)}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                              <label style={{ fontSize: 11 }}>Precio venta</label>
                              <input
                                className="form-control"
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.nuevo.precioVenta}
                                onChange={(e) =>
                                  actualizarNuevo(index, 'precioVenta', e.target.value)
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={{ verticalAlign: 'top' }}>
                      <select
                        className="form-control"
                        value={item.alicuotaIva}
                        onChange={(e) => actualizarItem(index, 'alicuotaIva', e.target.value)}
                        style={{ width: 90 }}
                      >
                        <option value="">-</option>
                        {ALICUOTAS.map((alicuota) => (
                          <option key={alicuota} value={alicuota}>
                            {alicuota}%
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 32,
            marginTop: 16,
            paddingTop: 12,
            borderTop: '1px solid var(--gray-200)',
          }}
        >
          <div style={{ textAlign: 'right' }}>
            <div className="text-sm text-gray">Suma de ítems revisados</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{money.format(totalItems)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="text-sm text-gray">Total de la factura</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{money.format(totalFactura)}</div>
          </div>
        </div>

        {Math.abs(diferenciaTotal) > 0.5 && (
          <div className="alert alert-info" style={{ marginTop: 12 }}>
            La suma de los ítems no coincide con el total de la factura (diferencia{' '}
            {money.format(diferenciaTotal)}). Se guardará el total de la factura y el costo
            unitario revisado de cada línea. Verificá bonificaciones o percepciones.
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-success" onClick={confirmar} disabled={!puedeConfirmar}>
            {guardando ? 'Confirmando...' : 'Confirmar e impactar stock'}
          </button>
          <button className="btn btn-outline" onClick={volverAlInicio} disabled={guardando}>
            Cancelar
          </button>
          <span className="text-sm text-gray" style={{ marginLeft: 'auto' }}>
            {sinProducto > 0
              ? `Faltan ${sinProducto} producto(s) por asignar`
              : 'La compra y el stock se registran recién al confirmar'}
          </span>
        </div>
      </div>
    </div>
  )
}
