import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calcularResumenFiscal,
  codigoIvaArca,
  prorratearDescuento,
} from "../src/modules/ventas/descuentoComprobante";

const D = (valor: number | string) => new Prisma.Decimal(valor);

describe("descuento global del comprobante", () => {
  it("prorratea el descuento por ítem según su subtotal", () => {
    const items = prorratearDescuento(
      [
        { subtotal: D("100.00"), alicuotaIva: 21 },
        { subtotal: D("50.00"), alicuotaIva: 10.5 },
      ],
      "15.00"
    );

    expect(items.map((item) => Number(item.descuento))).toEqual([10, 5]);
    expect(items.map((item) => Number(item.subtotalNeto))).toEqual([90, 45]);
    expect(items.reduce((suma, item) => suma + Number(item.descuento), 0)).toBe(15);
  });

  it("no pierde centavos al repartir descuentos que no son proporciones exactas", () => {
    const items = prorratearDescuento(
      [
        { subtotal: D("33.33"), alicuotaIva: 21 },
        { subtotal: D("33.33"), alicuotaIva: 21 },
        { subtotal: D("33.34"), alicuotaIva: 10.5 },
      ],
      "10.00"
    );

    const descuentoTotal = items.reduce((suma, item) => suma + Number(item.descuento), 0);
    const netoTotal = items.reduce((suma, item) => suma + Number(item.subtotalNeto), 0);

    expect(descuentoTotal).toBe(10);
    expect(netoTotal).toBe(90);
  });

  it("calcula Neto + IVA por alícuota sin descontar dos veces", () => {
    const resumen = calcularResumenFiscal(
      [
        { subtotal: D("100.00"), alicuotaIva: 21 },
        { subtotal: D("50.00"), alicuotaIva: 10.5 },
      ],
      "15.00"
    );

    expect(Number(resumen.subtotalBruto)).toBe(150);
    expect(Number(resumen.descuento)).toBe(15);
    expect(Number(resumen.total)).toBe(135);
    expect(Number(resumen.importeNeto.add(resumen.importeIva))).toBe(135);

    const iva21 = resumen.desgloseIva.find((d) => d.alicuota === 21)!;
    const iva105 = resumen.desgloseIva.find((d) => d.alicuota === 10.5)!;

    // 100 - 10 = 90 con IVA; base 90 / 1.21 = 74.38, IVA 15.62
    expect(Number(iva21.totalNeto)).toBe(90);
    expect(Number(iva21.baseImponible)).toBe(74.38);
    expect(Number(iva21.montoIva)).toBe(15.62);

    // 50 - 5 = 45 con IVA; base 45 / 1.105 = 40.72, IVA 4.28
    expect(Number(iva105.totalNeto)).toBe(45);
    expect(Number(iva105.baseImponible)).toBe(40.72);
    expect(Number(iva105.montoIva)).toBe(4.28);
  });

  it("con descuento cero mantiene los subtotales intactos", () => {
    const resumen = calcularResumenFiscal(
      [{ subtotal: D("123.45"), alicuotaIva: 0 }],
      "0"
    );

    expect(Number(resumen.descuento)).toBe(0);
    expect(Number(resumen.total)).toBe(123.45);
    expect(resumen.desgloseIva).toHaveLength(1);
    expect(Number(resumen.desgloseIva[0].montoIva)).toBe(0);
  });

  it("mapea las alícuotas a los códigos de WSFEv1", () => {
    expect(codigoIvaArca(0)).toBe(3);
    expect(codigoIvaArca(2.5)).toBe(9);
    expect(codigoIvaArca(5)).toBe(8);
    expect(codigoIvaArca(10.5)).toBe(4);
    expect(codigoIvaArca(21)).toBe(5);
    expect(codigoIvaArca(27)).toBe(6);
    expect(codigoIvaArca(99)).toBeNull();
  });
});
