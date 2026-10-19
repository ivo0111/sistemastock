import { beforeAll, describe, expect, it } from "vitest";
import { EstadoVenta, FormaPago, TipoMovimientoStock } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { AppError } from "../src/utils/AppError";
import { anularVenta, crearVenta } from "../src/modules/ventas/ventas.service";
import {
  crearProductoTest,
  crearUsuarioTest,
  limpiarBase,
  rechazarCon,
} from "./helpers";

beforeAll(limpiarBase);

describe("crearVenta", () => {
  it("descuenta stock, registra movimientos y calcula el total", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest({ precioVenta: 200, stockActual: 10 });

    const venta = await crearVenta({
      items: [{ productoId: producto.id, cantidad: 2, bonificacion: 10 }],
      formaPago: FormaPago.EFECTIVO,
      usuarioId: usuario.id,
    });

    // 200 * 2 * 0.90 = 360
    expect(Number(venta.total)).toBe(360);
    expect(venta.estado).toBe(EstadoVenta.CONFIRMADA);
    expect(venta.items).toHaveLength(1);
    expect(Number(venta.items[0].subtotal)).toBe(360);
    expect(Number(venta.items[0].bonificacionPorcentaje)).toBe(10);

    const sigue = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(sigue?.stockActual).toBe(8);

    const movimiento = await prisma.movimientoStock.findFirst({
      where: { productoId: producto.id, tipo: TipoMovimientoStock.VENTA },
    });
    expect(movimiento?.cantidad).toBe(-2);
    expect(movimiento?.referenciaId).toBe(venta.id);
  });

  it("aplica el descuento global sobre el total", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest({ precioVenta: 400, stockActual: 5 });

    const venta = await crearVenta({
      items: [{ productoId: producto.id, cantidad: 1 }],
      formaPago: FormaPago.EFECTIVO,
      descuento: 50,
      usuarioId: usuario.id,
    });

    expect(Number(venta.total)).toBe(350);
    expect(Number(venta.descuento)).toBe(50);
  });

  it("rechaza la venta sin stock suficiente sin modificar nada", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest({ stockActual: 1 });

    await rechazarCon("STOCK_INSUFICIENTE", () =>
      crearVenta({
        items: [{ productoId: producto.id, cantidad: 2 }],
        formaPago: FormaPago.EFECTIVO,
        usuarioId: usuario.id,
      })
    );

    const sigue = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(sigue?.stockActual).toBe(1);

    const ventasDelUsuario = await prisma.venta.count({ where: { usuarioId: usuario.id } });
    expect(ventasDelUsuario).toBe(0);
  });

  it("rechaza un descuento mayor al subtotal", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest({ precioVenta: 100, stockActual: 5 });

    await rechazarCon("DESCUENTO_INVALIDO", () =>
      crearVenta({
        items: [{ productoId: producto.id, cantidad: 1 }],
        formaPago: FormaPago.EFECTIVO,
        descuento: 500,
        usuarioId: usuario.id,
      })
    );
  });

  it("no permite vender un producto inactivo", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest({ activo: false });

    await rechazarCon("PRODUCTO_INACTIVO", () =>
      crearVenta({
        items: [{ productoId: producto.id, cantidad: 1 }],
        formaPago: FormaPago.EFECTIVO,
        usuarioId: usuario.id,
      })
    );
  });

  it("exige cliente para la venta a cuenta corriente", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest();

    await rechazarCon("CLIENTE_REQUERIDO", () =>
      crearVenta({
        items: [{ productoId: producto.id, cantidad: 1 }],
        formaPago: FormaPago.CUENTA_CORRIENTE,
        usuarioId: usuario.id,
      })
    );
  });

  it("con stock acotado, ventas concurrentes no sobre-venden", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest({ stockActual: 3 });

    const resultados = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        crearVenta({
          items: [{ productoId: producto.id, cantidad: 1 }],
          formaPago: FormaPago.EFECTIVO,
          usuarioId: usuario.id,
        })
      )
    );

    const ok = resultados.filter((r) => r.status === "fulfilled");
    const fallidos = resultados.filter((r) => r.status === "rejected");

    expect(ok).toHaveLength(3);
    expect(fallidos).toHaveLength(2);
    for (const fallo of fallidos) {
      const motivo = (fallo as PromiseRejectedResult).reason as AppError;
      expect(motivo.code).toBe("STOCK_INSUFICIENTE");
    }

    const sigue = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(sigue?.stockActual).toBe(0);

    const movimientos = await prisma.movimientoStock.count({
      where: { productoId: producto.id, tipo: TipoMovimientoStock.VENTA },
    });
    expect(movimientos).toBe(3);
  });
});

describe("anularVenta", () => {
  it("revierte stock y marca la venta como anulada", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest({ stockActual: 10 });

    const venta = await crearVenta({
      items: [{ productoId: producto.id, cantidad: 4 }],
      formaPago: FormaPago.EFECTIVO,
      usuarioId: usuario.id,
    });

    const anulada = await anularVenta(venta.id, "Error de carga", usuario.id);

    expect(anulada.estado).toBe(EstadoVenta.ANULADA);
    expect(anulada.motivoAnulacion).toBe("Error de carga");

    const sigue = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(sigue?.stockActual).toBe(10);

    const devolucion = await prisma.movimientoStock.findFirst({
      where: { productoId: producto.id, tipo: TipoMovimientoStock.DEVOLUCION },
    });
    expect(devolucion?.cantidad).toBe(4);
  });

  it("no permite anular dos veces (no duplica la devolución)", async () => {
    const usuario = await crearUsuarioTest();
    const producto = await crearProductoTest({ stockActual: 10 });

    const venta = await crearVenta({
      items: [{ productoId: producto.id, cantidad: 1 }],
      formaPago: FormaPago.EFECTIVO,
      usuarioId: usuario.id,
    });

    await anularVenta(venta.id, "Primera", usuario.id);
    await rechazarCon("VENTA_YA_ANULADA", () => anularVenta(venta.id, "Segunda", usuario.id));

    const sigue = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(sigue?.stockActual).toBe(10);

    const devoluciones = await prisma.movimientoStock.count({
      where: { productoId: producto.id, tipo: TipoMovimientoStock.DEVOLUCION },
    });
    expect(devoluciones).toBe(1);
  });

  it("devuelve VENTA_NO_ENCONTRADA para un id inexistente", async () => {
    const usuario = await crearUsuarioTest();
    await rechazarCon("VENTA_NO_ENCONTRADA", () => anularVenta(999999, "Nada", usuario.id));
  });
});
