import { z } from "zod";

// El negocio opera en Argentina (UTC-3, sin horario de verano). Las columnas
// de fecha de la BD (TIMESTAMP sin zona, en Prisma) guardan UTC, pero los
// filtros de los queries llegan como "YYYY-MM-DD" y representan un día del
// negocio, no un día UTC: sin este helper, "hasta=2026-10-12" se interpretaba
// como 00:00 UTC y excluía todo el día elegido, y las ventas después de las
// 21:00 UTC caían en el día siguiente.
export const TZ_NEGOCIO = "America/Argentina/Buenos_Aires";
const OFFSET_UTC_H = 3; // UTC = pared local + 3h

const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const ISO_SIN_ZONA = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/;

// "2026-10-12T21:30:00" (hora local, sin zona) → instante UTC
function paredLocalAUtc(pared: string): Date {
  const comoUtc = new Date(`${pared}Z`);
  return new Date(comoUtc.getTime() + OFFSET_UTC_H * 3_600_000);
}

function instanteDesdeString(s: string, finDeDia: boolean): Date | null {
  if (SOLO_DIA.test(s)) {
    // Día completo según el negocio: 00:00:00.000 (desde) o 23:59:59.999 (hasta)
    return paredLocalAUtc(`${s}T${finDeDia ? "23:59:59.999" : "00:00:00.000"}`);
  }
  const sinZona = ISO_SIN_ZONA.exec(s);
  if (sinZona) {
    const hora = sinZona[2].length === 5 ? `${sinZona[2]}:00` : sinZona[2];
    return paredLocalAUtc(`${sinZona[1]}T${hora}`);
  }
  // ISO con Z o offset explícito: instante absoluto, se usa tal cual
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function schemaFecha(finDeDia: boolean) {
  return z
    .string()
    .superRefine((v, ctx) => {
      if (instanteDesdeString(v, finDeDia) === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Fecha inválida (usá YYYY-MM-DD o un ISO 8601)",
        });
      }
    })
    .transform((v) => instanteDesdeString(v, finDeDia)!);
}

// Fin del día local inclusivo: un "hasta=YYYY-MM-DD" cubre todo el día elegido
export const zFechaDesde = schemaFecha(false);
export const zFechaHasta = schemaFecha(true);
