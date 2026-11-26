// Tipos compartidos por la importación de facturas de compra.
//
// El parser trabaja sobre líneas con coordenadas (no sobre texto plano): así
// puede distinguir la columna de cantidad de la de precio unitario aunque el
// PDF tenga un layout distinto al de otro proveedor.

export interface FragmentoTexto {
  x: number;
  ancho: number;
  texto: string;
}

export interface LineaTexto {
  /** Coordenada Y en el sistema de PDF (crece hacia arriba). */
  y: number;
  /** Coordenada X del fragmento más a la izquierda. */
  x: number;
  texto: string;
  fragmentos: FragmentoTexto[];
}

export interface PaginaTexto {
  ancho: number;
  alto: number;
  lineas: LineaTexto[];
}

export interface ItemFactura {
  /** Número de línea estable dentro de esta factura (1-based). */
  linea: number;
  codigoProveedor: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  alicuotaIva: number | null;
}

export interface AdvertenciaFactura {
  codigo: string;
  mensaje: string;
}

export interface EncabezadoFactura {
  proveedorCuit: string | null;
  proveedorNombre: string | null;
  /** "A", "B", "C", "M", "NC_A", "ND_B", ... */
  tipoComprobante: string | null;
  puntoVenta: number | null;
  numeroComprobante: string | null;
  /** ISO yyyy-mm-dd */
  fechaComprobante: string | null;
  subtotal: number | null;
  iva: number | null;
  percepciones: number | null;
  total: number | null;
  cae: string | null;
}

export interface FacturaExtraida {
  encabezado: EncabezadoFactura;
  items: ItemFactura[];
  advertencias: AdvertenciaFactura[];
  /** 0-100: cuán completa y consistente quedó la extracción. */
  confianza: number;
  texto: string;
}

export interface SugerenciaProducto {
  productoId: number;
  nombre: string;
  sku: string;
  puntaje: number;
  motivo: string;
}

/** Línea tal como se guarda en el borrador de importación. */
export interface ItemImportado extends ItemFactura {
  sugerencias: SugerenciaProducto[];
  productoIdSugerido: number | null;
}

export interface ProductoLigero {
  id: number;
  sku: string;
  nombre: string;
  codigoBarras: string | null;
  precioCosto: number;
  precioVenta: number;
  alicuotaIva: number;
}

export interface EquivalenciaProveedor {
  codigoProveedor: string | null;
  productoId: number;
}
