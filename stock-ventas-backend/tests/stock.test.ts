import { beforeAll, describe, expect, it } from "vitest";
import { TipoMovimientoStock } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { ajustarStock } from "../src/modules/productos/productos.service";
import { crearProductoTest, crearUsuarioTest, limpiarBase, rechazarCon } from "./helpers";

beforeAll(limpiarBase);

describe("ajustarStock", () => {
  it("suma stock y registra el movimiento de ajuste", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest({ stockActual: 10 });

    const actualizado = await ajustarStock(producto.id, 5, "Reconteo físico", usuario.id);

    expect(actualizado.stockActual).toBe(15);

    const movimiento = await prisma.movimientoStock.findFirst({
      where: { productoId: producto.id, tipo: TipoMovimientoStock.AJUSTE },
    });
    expect(movimiento?.cantidad).toBe(5);
    expect(movimiento?.motivo).toBe("Reconteo físico");
    expect(movimiento?.usuarioId).toBe(usuario.id);
  });

  it("resta stock con ajuste negativo", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest({ stockActual: 10 });

    const actualizado = await ajustarStock(producto.id, -4, "Rotura", usuario.id);

    expect(actualizado.stockActual).toBe(6);

    const movimiento = await prisma.movimientoStock.findFirst({
      where: { productoId: producto.id, tipo: TipoMovimientoStock.AJUSTE },
    });
    expect(movimiento?.cantidad).toBe(-4);
  });

  it("rechaza un ajuste que dejaría el stock en negativo, sin tocar nada", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest({ stockActual: 3 });

    await rechazarCon("STOCK_INSUFICIENTE", () =>
      ajustarStock(producto.id, -4, "Se perdieron", usuario.id)
    );

    const sigue = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(sigue?.stockActual).toBe(3);

    const movimientos = await prisma.movimientoStock.count({
      where: { productoId: producto.id },
    });
    expect(movimientos).toBe(0);
  });

  it("devuelve PRODUCTO_NO_ENCONTRADO para un id inexistente", async () => {
    const usuario = await crearUsuarioTest();
    await rechazarCon("PRODUCTO_NO_ENCONTRADO", () =>
      ajustarStock(999999, 1, "Nada", usuario.id)
    );
  });
});
