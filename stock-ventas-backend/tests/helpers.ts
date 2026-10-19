import { expect } from "vitest";
import { Rol } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { AppError } from "../src/utils/AppError";

let contador = 0;

export function idUnico(prefijo: string) {
  contador += 1;
  return `${prefijo}-${contador}-${Date.now().toString(36)}`;
}

// Vacía todas las tablas del dominio entre archivos de test. La suite corre
// con singleFork (base compartida), así que cada archivo arranca limpio.
export async function limpiarBase() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE usuarios, categorias, productos, movimientos_stock, clientes, movimientos_cuenta_corriente, ventas, venta_items, proveedores, compras, compra_items, caja, promociones RESTART IDENTITY CASCADE`
  );
}

export async function crearUsuarioTest(rol: Rol = Rol.ADMIN) {
  return prisma.usuario.create({
    data: {
      nombre: "Usuario Test",
      usuario: idUnico("user"),
      passwordHash: "hash-de-test",
      rol,
    },
  });
}

export async function crearProductoTest(
  datos: Partial<{
    sku: string;
    nombre: string;
    precioCosto: number;
    precioVenta: number;
    stockActual: number;
    stockMinimo: number;
    codigoBarras: string | null;
    activo: boolean;
  }> = {}
) {
  return prisma.producto.create({
    data: {
      sku: datos.sku ?? idUnico("SKU"),
      nombre: datos.nombre ?? "Producto test",
      precioCosto: datos.precioCosto ?? 100,
      precioVenta: datos.precioVenta ?? 200,
      stockActual: datos.stockActual ?? 10,
      stockMinimo: datos.stockMinimo ?? 2,
      codigoBarras: datos.codigoBarras ?? null,
      activo: datos.activo ?? true,
    },
  });
}

export async function crearClienteTest(nombre = "Cliente test") {
  return prisma.cliente.create({ data: { nombre } });
}

// Assert de rechazo: valida que la promesa falle con un AppError del código
// esperado (si no falla, el test falla con un mensaje claro).
export async function rechazarCon(code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
    return;
  }
  throw new Error(`Se esperaba el error ${code} pero la operación no falló`);
}
