export type TipoComprobanteArca = "FACTURA_A" | "FACTURA_B" | "FACTURA_C";

export interface SolicitudCAE {
  puntoVenta: number;
  tipoComprobante: TipoComprobanteArca;
  importeTotal: number;
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