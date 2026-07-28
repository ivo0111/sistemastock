export type TipoComprobanteArca = "FACTURA_A" | "FACTURA_B" | "FACTURA_C";

export interface SolicitudCAE {
  puntoVenta: number;
  tipoComprobante: TipoComprobanteArca;
  importeTotal: number;
  fecha: Date;
  /** CUIT del receptor. Si no hay, se factura como consumidor final. */
  cuitReceptor?: string;
}

export interface ResultadoCAE {
  cae: string;
  caeVencimiento: Date;
  numeroComprobante: number;
  puntoVenta: number;
  tipoComprobante: TipoComprobanteArca;
  observaciones?: string[];
}