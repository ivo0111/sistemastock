import { AppError } from "../../utils/AppError";
import { arcaConfig } from "../../config/arca.config";
import { SolicitudCAE, ResultadoCAE } from "./arca.types";
import { prisma } from "../../lib/prisma";
import { Prisma, TipoComprobante } from "@prisma/client";

// Clave del advisory lock de Postgres para serializar la asignación de números
// de comprobante (en la práctica son pocas por segundo: pedir un comprobante).
// El lock se libera solo al hacer commit/rollback de la transacción que lo tomó.
const LOCK_ASIGNACION_NUMEROS = 710_001;

/**
 * Integración con ARCA (ex-AFIP) — Web Service de Facturación Electrónica
 * (WSFEv1), para obtener el CAE (Código de Autorización Electrónico) que
 * hace válido fiscalmente un comprobante.
 *
 * Flujo real (fuera del alcance de este entorno, ver TODO más abajo):
 *  1. WSAA (autenticación): se arma un TRA (Ticket de Requerimiento de
 *     Acceso, XML con <uniqueId>/<generationTime>/<expirationTime>), se firma
 *     con el certificado digital (.crt) y clave privada (.key) de la empresa
 *     (CMS/PKCS#7, vía openssl) y se envía a wsaaUrl. Devuelve un
 *     Token + Sign válidos por ~12hs.
 *  2. WSFEv1 (facturación): con ese Token/Sign se llama primero a
 *     FECompUltimoAutorizado(puntoVenta, tipoComprobante) para saber el
 *     próximo número a usar, y después a FECAESolicitar con los datos del
 *     comprobante para obtener el CAE.
 *
 * Requisitos que esto implica y que HOY no están cubiertos por el proyecto:
 *  - CUIT de la empresa habilitado en ARCA para Facturación Electrónica.
 *  - Certificado digital vigente (.crt/.key) generado desde el sitio de ARCA.
 *  - Una librería SOAP (ej. el paquete npm "soap") para hablar con los WS.
 *
 * Nada de esto puede probarse desde este entorno de desarrollo (sin acceso
 * de red a los dominios de ARCA ni certificados reales), por eso el modo por
 * defecto es "mock": genera un CAE simulado, sin validez fiscal, que permite
 * ejercitar todo el flujo (guardar el comprobante, imprimirlo, etc.).
 */
export async function solicitarCAE(input: SolicitudCAE): Promise<ResultadoCAE> {
  if (arcaConfig.modo === "mock") {
    return solicitarCAEMock(input);
  }

  // TODO(real): implementar WSAA + WSFEv1 con la librería "soap"
  // (`npm install soap`), siguiendo los 6 pasos:
  //   1. Generar el TRA (XML).
  //   2. Firmarlo con arcaConfig.certPath / arcaConfig.keyPath.
  //   3. POST del CMS resultante a arcaConfig.wsaaUrl -> <token>, <sign>.
  //   4. FECompUltimoAutorizado(puntoVenta, tipoComprobante) en wsfeUrl.
  //   5. FECAESolicitar con el número siguiente y los datos de `input`.
  //   6. Si el resultado es "R" (rechazado), lanzar AppError con el detalle
  //      que devuelve ARCA en <Observaciones>.
  throw new AppError(
    "ARCA_NO_CONFIGURADO",
    `La integración real con ARCA (modo "${arcaConfig.modo}") todavía no está implementada. ` +
      `Usá ARCA_MODO=mock para desarrollo, o completá arca.service.ts con las llamadas WSAA/WSFEv1.`,
    501
  );
}

/**
 * Próximo número de comprobante correlativo para (punto de venta, tipo).
 *
 * Se llama DENTRO de la transacción que va a persistir el número: el advisory
 * lock serializa los pedidos concurrentes, así dos ventas nunca reciben el
 * mismo número ni el secuencial se repite dentro del mismo segundo (el cálculo
 * anterior, `Date.now()` en segundos, colisionaba y podía ir "hacia atrás").
 *
 * En modo real esto lo reemplaza FECompUltimoAutorizado de ARCA.
 */
export async function proximoNumeroComprobante(
  tx: Prisma.TransactionClient,
  puntoVenta: number,
  tipoComprobante: TipoComprobante
): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_ASIGNACION_NUMEROS}::bigint)`;

  const ultimo = await tx.venta.aggregate({
    where: { puntoVenta, tipoComprobante },
    _max: { numeroComprobante: true },
  });

  return (ultimo._max.numeroComprobante ?? 0) + 1;
}

async function solicitarCAEMock(input: SolicitudCAE): Promise<ResultadoCAE> {
  const numeroComprobante =
    input.numeroComprobanteSugerido ?? (await ultimoNumeroGlobal()) + 1;
  const caeVencimiento = new Date();
  caeVencimiento.setDate(caeVencimiento.getDate() + 10);

  return {
    cae: `MOCK${String(numeroComprobante).padStart(10, "0")}`,
    caeVencimiento,
    numeroComprobante,
    puntoVenta: input.puntoVenta,
    tipoComprobante: input.tipoComprobante,
    observaciones: ["CAE simulado (ARCA_MODO=mock) — no tiene validez fiscal"],
  };
}

// Respaldo si el caller no envió el correlativo (solo posible invocando la
// función a mano): sigue siendo correlativo (max + 1), no un timestamp.
async function ultimoNumeroGlobal(): Promise<number> {
  const ultimo = await prisma.venta.aggregate({ _max: { numeroComprobante: true } });
  return ultimo._max.numeroComprobante ?? 0;
}

/**
 * Decide el tipo de comprobante según la condición de IVA del emisor y del
 * receptor, siguiendo las reglas generales de ARCA:
 *  - Emisor Monotributista  -> siempre Factura C.
 *  - Emisor Responsable Inscripto, receptor también RI -> Factura A.
 *  - Emisor Responsable Inscripto, receptor no RI (o sin CUIT) -> Factura B.
 */
export function determinarTipoComprobante(condicionIvaReceptor?: string | null) {
  if (arcaConfig.condicionIvaEmisor === "MONOTRIBUTO") {
    return "FACTURA_C" as const;
  }
  if (condicionIvaReceptor === "RESPONSABLE_INSCRIPTO") {
    return "FACTURA_A" as const;
  }
  return "FACTURA_B" as const;
}