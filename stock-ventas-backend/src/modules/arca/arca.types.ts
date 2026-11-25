export type TipoComprobanteArca = "FACTURA_A" | "FACTURA_B" | "FACTURA_C";

export interface IvaArca {
  /** Código de alícuota WSFEv1: 3=0%, 4=10,5%, 5=21%, 6=27%, 8=5%, 9=2,5%. */
  id: number;
  baseImponible: number;
  importe: number;
}

export interface SolicitudCAE {
  puntoVenta: number;
  tipoComprobante: TipoComprobanteArca;
  importeTotal: number;
  /**
   * Desglose fiscal ya prorrateado (descuento global incluido).
   * En Factura C (Monotributo) no se discrimina IVA: importeNeto = total e
   * importeIva = 0, y el array `iva` va vacío.
   */
  importeNeto?: number;
  importeIva?: number;
  iva?: IvaArca[];
  fecha: Date;
  /** CUIT del receptor. Si no hay, se factura como consumidor final. */
  cuitReceptor?: string;
  /**
   * Correlativo calculado por el caller (dentro de su transacción, con lock).
   * Solo lo usa el modo mock; el modo real pide el próximo número a ARCA
   * (FECompUltimoAutorizado).
   */
  numeroComprobanteSugerido?: number;
}

export interface ResultadoCAE {
  cae: string;
  caeVencimiento: Date;
  numeroComprobante: number;
  puntoVenta: number;
  tipoComprobante: TipoComprobanteArca;
  observaciones?: string[];
}