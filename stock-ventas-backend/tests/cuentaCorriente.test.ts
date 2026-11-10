import { beforeAll, describe, expect, it } from "vitest";
import { FormaPago, TipoMovimientoCuentaCorriente } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { ajustarCuentaCorriente } from "../src/modules/clientes/clientes.service";
import { anularVenta, crearVenta } from "../src/modules/ventas/ventas.service";
import {
  crearCajaAbiertaTest,
  crearClienteTest,
  crearProductoTest,
  crearUsuarioTest,
  limpiarBase,
  rechazarCon,
} from "./helpers";

beforeAll(limpiarBase);

async function saldoDe(clienteId: number) {
  const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: clienteId } });
  return Number(cliente.cuentaCorrienteSaldo);
}

describe("venta a cuenta corriente", () => {
  it("genera un CARGO y sube el saldo del cliente", async () => {
    const usuario = await crearUsuarioTest();
    const cliente = await crearClienteTest();
    const producto = await crearProductoTest({ precioVenta: 300, stockActual: 5 });

    const venta = await crearVenta({
      items: [{ productoId: producto.id, cantidad: 2 }],
      formaPago: FormaPago.CUENTA_CORRIENTE,
      clienteId: cliente.id,
      usuarioId: usuario.id,
    });

    expect(await saldoDe(cliente.id)).toBe(600);

    const cargo = await prisma.movimientoCuentaCorriente.findFirst({
      where: { clienteId: cliente.id, referenciaId: venta.id },
    });
    expect(cargo?.tipo).toBe(TipoMovimientoCuentaCorriente.CARGO);
    expect(Number(cargo?.monto)).toBe(600);
  });

  it("anular la venta revierte el cargo y baja el saldo", async () => {
    const usuario = await crearUsuarioTest();
    const cliente = await crearClienteTest();
    const producto = await crearProductoTest({ precioVenta: 300, stockActual: 5 });

    const venta = await crearVenta({
      items: [{ productoId: producto.id, cantidad: 2 }],
      formaPago: FormaPago.CUENTA_CORRIENTE,
      clienteId: cliente.id,
      usuarioId: usuario.id,
    });

    await anularVenta(venta.id, "Se arrepintió", usuario.id);

    expect(await saldoDe(cliente.id)).toBe(0);

    // La anulación revierte el cargo como AJUSTE (no como PAGO: el cliente
    // no pagó nada, se anuló la venta).
    const reversion = await prisma.movimientoCuentaCorriente.findFirst({
      where: { clienteId: cliente.id, tipo: TipoMovimientoCuentaCorriente.AJUSTE },
    });
    expect(Number(reversion?.monto)).toBe(-600);
    expect(reversion?.motivo).toBe(`Anulación de venta #${venta.id}`);

    const pagos = await prisma.movimientoCuentaCorriente.count({
      where: { clienteId: cliente.id, tipo: TipoMovimientoCuentaCorriente.PAGO },
    });
    expect(pagos).toBe(0);
  });
});

describe("ajustarCuentaCorriente", () => {
  it("valida el signo: un CARGO no puede ser negativo", async () => {
    const usuario = await crearUsuarioTest();
    const cliente = await crearClienteTest();

    await rechazarCon("MONTO_SIGNO_INVALIDO", () =>
      ajustarCuentaCorriente(cliente.id, -100, "Mal cargado", usuario.id, "CARGO")
    );

    expect(await saldoDe(cliente.id)).toBe(0);
  });

  it("valida el signo: un PAGO no puede ser positivo", async () => {
    const usuario = await crearUsuarioTest();
    const cliente = await crearClienteTest();

    await rechazarCon("MONTO_SIGNO_INVALIDO", () =>
      ajustarCuentaCorriente(cliente.id, 250, "Mal cargado", usuario.id, "PAGO")
    );

    expect(await saldoDe(cliente.id)).toBe(0);
  });

  it("aplica un PAGO negativo y reduce la deuda", async () => {
    const usuario = await crearUsuarioTest();
    await crearCajaAbiertaTest(usuario.id);
    const cliente = await crearClienteTest();

    await ajustarCuentaCorriente(cliente.id, -500, "Pago en efectivo", usuario.id, "PAGO");

    expect(await saldoDe(cliente.id)).toBe(-500);

    const movimiento = await prisma.movimientoCuentaCorriente.findFirst({
      where: { clienteId: cliente.id },
    });
    expect(movimiento?.tipo).toBe(TipoMovimientoCuentaCorriente.PAGO);
    expect(Number(movimiento?.monto)).toBe(-500);
    expect(movimiento?.motivo).toBe("Pago en efectivo");
  });

  it("un PAGO sin caja abierta se rechaza", async () => {
    const usuario = await crearUsuarioTest();
    const cliente = await crearClienteTest();

    await rechazarCon("CAJA_NO_ABIERTA", () =>
      ajustarCuentaCorriente(cliente.id, -500, "Cobro sin caja", usuario.id, "PAGO")
    );

    expect(await saldoDe(cliente.id)).toBe(0);
  });

  it("un AJUSTE no exige caja abierta", async () => {
    const usuario = await crearUsuarioTest();
    const cliente = await crearClienteTest();

    await ajustarCuentaCorriente(cliente.id, 100, "Saldo de apertura", usuario.id, "AJUSTE");

    expect(await saldoDe(cliente.id)).toBe(100);
  });
});
