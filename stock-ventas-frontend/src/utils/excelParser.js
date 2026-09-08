import * as XLSX from 'xlsx'

/**
 * Parsea un archivo Excel (.xlsx, .xls) o CSV y retorna headers + filas como strings.
 *
 * La opción `raw: false` (cellDates=false + raw:false) hace que SheetJS devuelva
 * el valor formateado de cada celda como string, preservando ceros a la izquierda
 * en SKUs o Códigos de Barras numéricos.
 *
 * @param {File} file - Archivo seleccionado por el usuario
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No se proporcionó ningún archivo'))
      return
    }

    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, {
          type: 'array',
          raw: false,       // ← devuelve valores formateados como string
          cellDates: false,  // ← fechas como string en vez de Date objects
          codepage: 65001,   // ← UTF-8 para compatibilidad con CSVs
        })

        const sheetName = workbook.SheetNames[0]
        if (!sheetName) {
          reject(new Error('El archivo no contiene hojas de cálculo'))
          return
        }

        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(sheet, {
          header: 1,         // ← retorna array de arrays (posicional)
          raw: false,        // ← string formateado
          defval: '',        // ← celdas vacías como string vacío
          blankrows: false,  // ← descarta filas completamente vacías
        })

        if (jsonData.length === 0) {
          reject(new Error('El archivo no contiene filas de datos'))
          return
        }

        // Primera fila = encabezados
        const headers = jsonData[0].map((h) => String(h || '').trim())

        // Verificar que haya al menos un header válido
        if (headers.every((h) => h === '')) {
          reject(new Error('No se detectaron encabezados de columna válidos'))
          return
        }

        // Resto de filas = datos
        const rows = jsonData.slice(1).map((row) => {
          const obj = {}
          headers.forEach((header, i) => {
            if (header) {
              obj[header] = row[i] !== undefined ? String(row[i]).trim() : ''
            }
          })
          return obj
        })

        // Filtrar filas donde todos los valores sean vacíos
        const rowsConDatos = rows.filter((row) =>
          Object.values(row).some((v) => v !== '')
        )

        if (rowsConDatos.length === 0) {
          reject(new Error('El archivo solo contiene encabezados sin datos'))
          return
        }

        resolve({ headers, rows: rowsConDatos })
      } catch (err) {
        reject(new Error(`Error al leer el archivo: ${err.message}`))
      }
    }

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo desde el disco'))
    }

    reader.readAsArrayBuffer(file)
  })
}

/**
 * Nombres de columnas soportados para el mapeo de importación de productos.
 * Cada clave es el nombre canónico del campo; los valores son posibles
 * encabezados que el usuario podría usar en su planilla.
 */
export const COLUMNAS_PRODUCTOS = {
  sku: ['sku', 'código', 'codigo', 'cod', 'referencia'],
  nombre: ['nombre', 'producto', 'descripción', 'descripcion', 'name'],
  categoriaNombre: ['categoría', 'categoria', 'category', 'cat'],
  precioCosto: ['precio costo', 'precio_costo', 'costo', 'cost', 'price cost'],
  precioVenta: ['precio venta', 'precio_venta', 'venta', 'price', 'price sale', 'precio de venta'],
  stockActual: ['stock', 'stock actual', 'stock_actual', 'cantidad', 'stock inicial', 'stock_inicial'],
  stockMinimo: ['stock mínimo', 'stock minimo', 'stock_minimo', 'mínimo', 'minimo', 'min'],
  codigoBarras: ['código de barras', 'codigo de barras', 'código barras', 'codigo barras', 'código_barras', 'codigo_barras', 'barcode', 'ean', 'upc'],
  alicuotaIva: ['iva', 'alícuota iva', 'alicuota iva', 'alicuota_iva', 'alícuota', 'alicuota'],
  unidadMedida: ['unidad', 'unidad de medida', 'unidad_medida', 'um', 'unit'],
}

/**
 * Intenta mapear los headers del archivo a los campos esperados por el backend.
 * Retorna un mapa { campoBackend: nombreHeaderOriginal }.
 *
 * @param {string[]} headers - Encabezados del archivo
 * @returns {Record<string, string>}
 */
export function mapearColumnas(headers) {
  const mapa = {}

  for (const [campo, aliases] of Object.entries(COLUMNAS_PRODUCTOS)) {
    for (const header of headers) {
      const normalizado = header.toLowerCase().trim()
      if (aliases.some((alias) => normalizado === alias || normalizado.includes(alias))) {
        mapa[campo] = header
        break
      }
    }
  }

  return mapa
}
