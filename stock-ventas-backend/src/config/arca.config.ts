// Configuración de la integración con ARCA (ex-AFIP), el organismo que
// autoriza los comprobantes fiscales electrónicos en Argentina.
//
// modo:
//  - "mock":          no llama a ningún servicio real. Genera un CAE simulado
//                      para poder desarrollar/probar el flujo completo sin
//                      tener certificado digital ni CUIT habilitado. Es el
//                      default, pensado para este proyecto de escala personal.
//  - "homologacion":   ambiente de pruebas real de ARCA (wsaahomo/wswhomo).
//  - "produccion":     ambiente real. Requiere certificado y CUIT habilitados.
export type ArcaModo = "mock" | "homologacion" | "produccion";

export const arcaConfig = {
  modo: (process.env.ARCA_MODO as ArcaModo) || "mock",

  // Datos del emisor (tu empresa), necesarios para armar el comprobante y
  // para decidir si corresponde Factura A, B o C.
  cuitEmisor: process.env.ARCA_CUIT_EMISOR || "",
  razonSocial: process.env.ARCA_RAZON_SOCIAL || "Mi Empresa",
  condicionIvaEmisor: process.env.ARCA_CONDICION_IVA_EMISOR || "MONOTRIBUTO",
  puntoVenta: Number(process.env.ARCA_PUNTO_VENTA || 1),
  domicilioComercial: process.env.ARCA_DOMICILIO_COMERCIAL || "",
  ingresosBrutos: process.env.ARCA_INGRESOS_BRUTOS || "",
  fechaInicioActividades: process.env.ARCA_FECHA_INICIO_ACTIVIDADES || "",

  // Certificado digital emitido por ARCA (portal "Administración de
  // Certificados Digitales"), necesario solo en modo homologacion/produccion.
  certPath: process.env.ARCA_CERT_PATH || "",
  keyPath: process.env.ARCA_KEY_PATH || "",

  // Endpoints SOAP de ARCA.
  wsaaUrl:
    process.env.ARCA_WSAA_URL || "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  wsfeUrl:
    process.env.ARCA_WSFE_URL || "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
};