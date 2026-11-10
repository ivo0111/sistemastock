import { describe, expect, it } from "vitest";
import { zFechaDesde, zFechaHasta } from "../src/utils/fechas";

describe("zFechaDesde / zFechaHasta", () => {
  it("interpreta YYYY-MM-DD como día del negocio (hora Argentina, UTC-3)", () => {
    // 00:00 local = 03:00 UTC. Sin esto, "desde=2026-10-12" era 00:00 UTC
    // (= 21:00 del 11 en Argentina) y excluía la madrugada del día elegido.
    expect(zFechaDesde.parse("2026-10-12").toISOString()).toBe("2026-10-12T03:00:00.000Z");

    // Fin de día local inclusivo: un "hasta=2026-10-12" cubre el día 12
    // entero. En UTC es 02:59 del día siguiente, no 00:00 del 12 (que
    // cortaba la venta a las 21:00 del 11).
    expect(zFechaHasta.parse("2026-10-12").toISOString()).toBe("2026-10-13T02:59:59.999Z");
  });

  it("acepta un ISO con zona como instante absoluto", () => {
    expect(zFechaDesde.parse("2026-10-12T15:00:00Z").toISOString()).toBe("2026-10-12T15:00:00.000Z");
  });

  it("rechaza fechas inválidas", () => {
    expect(zFechaDesde.safeParse("ayer").success).toBe(false);
    expect(zFechaHasta.safeParse("no-es-fecha").success).toBe(false);
  });
});
