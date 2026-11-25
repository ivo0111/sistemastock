import { Prisma } from "@prisma/client";

/**
 * Cálculo único del descuento global de una venta y su desglose fiscal.
 *
 * Regla contable (ARCA / WSFEv1):
 *  - El descuento global es un importe en pesos, no un porcentaje por línea.
 *  - Se prorratea entre TODOS los ítems en proporción a su subtotal (que ya
 *    incluye la bonificación/promoción de la línea).
 *  - Cada ítem aporta su porción de descuento a la alícuota de IVA de su
 *    producto. La base imponible y el IVA se agrupan por alícuota, nunca se
 *    resta el descuento una sola vez del total (eso descuadraba Neto + IVA).
 *
 * El prorrateo se hace en centavos enteros con el método de "mayor resto":
 * la suma de los descuentos por ítem es exactamente el descuento global, sin
 * centavos perdidos por redondeo. La suma de las bases + IVA por alícuota es
 * exactamente el total de la venta (subtotal - descuento).
 *
 * Este módulo lo usan tanto el comprobante impreso como la solicitud a ARCA,
 * para que cálculo, impresión y presentación fiscal no puedan divergir.
 */

export interface ItemFiscal {
  subtotal: Prisma.Decimal | number | string;
  alicuotaIva?: number | Prisma.Decimal | string | null;
}

export interface ItemConDescuento {
  indice: number;
  alicuota: number;
  subtotalBruto: Prisma.Decimal;
  descuento: Prisma.Decimal;
  /** Subtotal con IVA después de aplicar la parte proporcional del descuento. */
  subtotalNeto: Prisma.Decimal;
}

export interface DetalleIva {
  alicuota: number;
  /** Suma de subtotales (con IVA) del grupo, ya descontados. */
  totalNeto: Prisma.Decimal;
  baseImponible: Prisma.Decimal;
  montoIva: Prisma.Decimal;
}

export interface ResumenFiscal {
  subtotalBruto: Prisma.Decimal;
  descuento: Prisma.Decimal;
  total: Prisma.Decimal;
  importeNeto: Prisma.Decimal;
  importeIva: Prisma.Decimal;
  items: ItemConDescuento[];
  desgloseIva: DetalleIva[];
}

function redondear2(valor: Prisma.Decimal): Prisma.Decimal {
  return valor.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function aCentavos(valor: Prisma.Decimal): number {
  return Number(
    valor
      .mul(100)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toString()
  );
}

function desdeCentavos(centavos: number): Prisma.Decimal {
  return new Prisma.Decimal(centavos).div(100);
}

/**
 * Reparte `descuento` entre los ítems en proporción a su subtotal.
 * Devuelve un descuento por ítem cuya suma (en centavos) es exactamente el
 * descuento solicitado (o el subtotal total si el descuento lo supera).
 */
export function prorratearDescuento(
  items: ItemFiscal[],
  descuento: Prisma.Decimal | number | string
): ItemConDescuento[] {
  const subtotales = items.map((item) => redondear2(new Prisma.Decimal(item.subtotal)));
  const subtotalesCents = subtotales.map(aCentavos);
  const totalCents = subtotalesCents.reduce((suma, valor) => suma + valor, 0);

  const descuentoPedidoCents = Math.max(0, aCentavos(new Prisma.Decimal(descuento)));
  const descuentoCents = Math.min(descuentoPedidoCents, Math.max(0, totalCents));

  if (totalCents === 0 || descuentoCents === 0) {
    return items.map((item, indice) => ({
      indice,
      alicuota: Number(item.alicuotaIva ?? 21),
      subtotalBruto: subtotales[indice],
      descuento: new Prisma.Decimal(0),
      subtotalNeto: subtotales[indice],
    }));
  }

  const totalBig = BigInt(totalCents);
  const descuentoBig = BigInt(descuentoCents);

  // Mayor resto: primero la parte entera de cada proporción y después se
  // reparten los centavos sobrantes entre los restos más grandes.
  const asignaciones = subtotalesCents.map((subtotalCents) => {
    const numerador = BigInt(subtotalCents) * descuentoBig;
    return {
      centavos: Number(numerador / totalBig),
      resto: numerador % totalBig,
    };
  });

  const asignado = asignaciones.reduce((suma, a) => suma + a.centavos, 0);
  let sobrante = descuentoCents - asignado;

  const orden = asignaciones
    .map((a, indice) => ({ indice, resto: a.resto }))
    .sort((a, b) => (a.resto === b.resto ? a.indice - b.indice : a.resto > b.resto ? -1 : 1));

  for (let i = 0; i < orden.length && sobrante > 0; i++) {
    asignaciones[orden[i].indice].centavos += 1;
    sobrante -= 1;
  }

  return items.map((item, indice) => {
    const subtotalCents = subtotalesCents[indice];
    // Blindaje: por cómo se calcula el global, nunca debería superar el ítem.
    const descuentoCentsItem = Math.min(asignaciones[indice].centavos, subtotalCents);
    return {
      indice,
      alicuota: Number(item.alicuotaIva ?? 21),
      subtotalBruto: subtotales[indice],
      descuento: desdeCentavos(descuentoCentsItem),
      subtotalNeto: desdeCentavos(subtotalCents - descuentoCentsItem),
    };
  });
}

/**
 * Arma el desglose de IVA por alícuota a partir del descuento ya prorrateado.
 * `totalNeto` es el importe con IVA del grupo; `baseImponible` se redondea a
 * 2 decimales y `montoIva` es la diferencia, de modo que
 * base + IVA = total del grupo y la suma de grupos = total de la venta.
 */
export function calcularResumenFiscal(
  items: ItemFiscal[],
  descuento: Prisma.Decimal | number | string
): ResumenFiscal {
  const itemsConDescuento = prorratearDescuento(items, descuento);

  const porAlicuota = new Map<number, { totalCents: number }>();
  for (const item of itemsConDescuento) {
    const actual = porAlicuota.get(item.alicuota) ?? { totalCents: 0 };
    actual.totalCents += aCentavos(item.subtotalNeto);
    porAlicuota.set(item.alicuota, actual);
  }

  const desgloseIva: DetalleIva[] = Array.from(porAlicuota.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([alicuota, grupo]) => {
      const totalNeto = desdeCentavos(grupo.totalCents);
      const divisor = new Prisma.Decimal(1).add(
        new Prisma.Decimal(alicuota).div(100)
      );
      const baseImponible = redondear2(totalNeto.div(divisor));
      return {
        alicuota,
        totalNeto,
        baseImponible,
        // Diferencia exacta: garantiza que Neto + IVA cierre contra el total.
        montoIva: totalNeto.sub(baseImponible),
      };
    });

  const subtotalBruto = itemsConDescuento.reduce(
    (suma, item) => suma.add(item.subtotalBruto),
    new Prisma.Decimal(0)
  );
  const descuentoAplicado = itemsConDescuento.reduce(
    (suma, item) => suma.add(item.descuento),
    new Prisma.Decimal(0)
  );
  const total = itemsConDescuento.reduce(
    (suma, item) => suma.add(item.subtotalNeto),
    new Prisma.Decimal(0)
  );
  const importeNeto = desgloseIva.reduce(
    (suma, detalle) => suma.add(detalle.baseImponible),
    new Prisma.Decimal(0)
  );
  const importeIva = desgloseIva.reduce(
    (suma, detalle) => suma.add(detalle.montoIva),
    new Prisma.Decimal(0)
  );

  return {
    subtotalBruto: redondear2(subtotalBruto),
    descuento: redondear2(descuentoAplicado),
    total: redondear2(total),
    importeNeto: redondear2(importeNeto),
    importeIva: redondear2(importeIva),
    items: itemsConDescuento,
    desgloseIva,
  };
}

/**
 * Códigos de alícuota de IVA que usa WSFEv1 en el array <Iva><Id>.
 * El proyecto guarda la alícuota como porcentaje (21, 10.5, 27, 5, 2.5, 0).
 */
export const CODIGO_IVA_ARCA: Record<number, number> = {
  0: 3,
  2.5: 9,
  5: 8,
  10.5: 4,
  21: 5,
  27: 6,
};

export function codigoIvaArca(alicuota: number): number | null {
  return CODIGO_IVA_ARCA[alicuota] ?? null;
}
