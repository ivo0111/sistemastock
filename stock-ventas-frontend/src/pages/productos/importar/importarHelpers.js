// Helpers puros del wizard de importación de productos.
// Extraídos de ImportarProductos.jsx para que ese archivo quede concentrado en
// la lógica de estado y el JSX del asistente.

export const PASOS = [
  { num: 1, label: 'Archivo' },
  { num: 2, label: 'Mapeo' },
  { num: 3, label: 'Completar' },
  { num: 4, label: 'Vista previa' },
  { num: 5, label: 'Importar' },
  { num: 6, label: 'Resultado' },
]

export const CAMPOS_SISTEMA = [
  { key: 'sku', label: 'SKU', obligatorio: true },
  { key: 'nombre', label: 'Nombre' },
  { key: 'categoriaId', label: 'Categoría' },
  { key: 'precioCosto', label: 'Precio Costo', numerico: true },
  { key: 'precioVenta', label: 'Precio Venta', numerico: true },
  { key: 'stockActual', label: 'Stock Actual', numerico: true, defaultVal: '0' },
  { key: 'stockMinimo', label: 'Stock Mínimo', numerico: true, defaultVal: '0' },
  { key: 'codigoBarras', label: 'Código de Barras' },
  { key: 'alicuotaIva', label: 'Alícuota IVA', numerico: true, defaultVal: '21' },
  { key: 'unidadMedida', label: 'Unidad de Medida', defaultVal: 'unidades' },
]

export const SCHEMA_DEFAULTS = {
  precioCosto: '',
  precioVenta: '',
  stockActual: '0',
  stockMinimo: '0',
  alicuotaIva: '21',
  unidadMedida: 'unidades',
}

export const FILAS_POR_PAGINA = 20

// El backend acepta como máximo 500 filas por request (zod importarSchema):
// las importaciones grandes se envían en lotes de este tamaño.
export const FILAS_POR_LOTE_IMPORTACION = 500

export function parseDecimalArgentina(valor) {
  if (typeof valor !== 'string') return valor
  const trimmed = valor.trim()
  if (!trimmed) return ''
  if (trimmed.includes(',')) {
    return trimmed.replace(/\./g, '').replace(',', '.')
  }
  return trimmed
}

export function toNumberSafe(valor) {
  const converted = parseDecimalArgentina(valor)
  if (converted === '' || converted === undefined || converted === null) return NaN
  return Number(converted)
}

export function getPreviewValues(rows, columnName, count = 3) {
  const vals = []
  for (let i = 0; i < Math.min(rows.length, count); i++) {
    const v = rows[i][columnName]
    if (v !== undefined && v !== null && String(v).trim()) vals.push(String(v).trim())
  }
  return vals
}

export function getDistinctValues(rows, columnName) {
  const values = new Set()
  rows.forEach(row => {
    const val = row[columnName]
    if (val && String(val).trim()) values.add(String(val).trim())
  })
  return [...values].sort()
}

// --- CSV helpers (mismo patrón que Reportes.jsx) ---

function escaparCeldaCsv(valor) {
  const str = String(valor ?? '')
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

function filasACsv(headers, filas) {
  const encabezado = headers.map(escaparCeldaCsv).join(';')
  const lineas = filas.map(fila => fila.map(escaparCeldaCsv).join(';'))
  return [encabezado, ...lineas].join('\r\n')
}

export function descargarCsv(nombreArchivo, headers, filas) {
  const csv = filasACsv(headers, filas)
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombreArchivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
