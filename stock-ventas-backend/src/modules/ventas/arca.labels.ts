// Mapeos reutilizables entre los valores internos del sistema y el texto /
// código que exige ARCA para mostrarlos en el comprobante impreso.

export const CONDICION_IVA_LABEL: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: "IVA Responsable Inscripto",
  MONOTRIBUTO: "Responsable Monotributo",
  CONSUMIDOR_FINAL: "Consumidor Final",
  EXENTO: "IVA Exento",
};

export const CODIGO_TIPO_COMPROBANTE: Record<string, string> = {
  FACTURA_A: "01",
  FACTURA_B: "06",
  FACTURA_C: "11",
};