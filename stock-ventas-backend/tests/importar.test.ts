import { beforeAll, describe, expect, it } from "vitest";
import { TipoMovimientoStock } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { importarProductos } from "../src/modules/productos/productos.service";
import { crearProductoTest, crearUsuarioTest, limpiarBase } from "./helpers";

beforeAll(limpiarBase);

describe("importarProductos", () => {
  it("crea productos nuevos, su movimiento inicial y la categoría", async () => {
    const usuario = await crearUsuarioTest();

    const resultado = await importarProductos(
      [
        {
          sku: "IMP-001",
          nombre: "Producto importado",
          categoriaNombre: "Importados",
          precioCosto: 80,
          precioVenta: 150,
          stockActual: 12,
          stockMinimo: 3,
        },
      ],
      usuario.id
    );

    expect(resultado).toMatchObject({ creados: 1, actualizados: 0, omitidos: 0 });
    expect(resultado.errores).toHaveLength(0);

    const producto = await prisma.producto.findUnique({ where: { sku: "IMP-001" } });
    expect(producto?.stockActual).toBe(12);
    expect(producto?.stockMinimo).toBe(3);
    expect(Number(producto?.precioVenta)).toBe(150);
    expect(producto?.categoriaId).not.toBeNull();

    const categoria = await prisma.categoria.findUnique({ where: { id: producto!.categoriaId! } });
    expect(categoria?.nombre).toBe("Importados");

    const movimiento = await prisma.movimientoStock.findFirst({
      where: { productoId: producto!.id, tipo: TipoMovimientoStock.AJUSTE_INICIAL },
    });
    expect(movimiento?.cantidad).toBe(12);
  });

  it("omite SKUs existentes y actualiza solo cuando se pide", async () => {
    const usuario = await crearUsuarioTest();
    const existente = await crearProductoTest({
      sku: "IMP-EXISTE",
      precioVenta: 100,
      stockActual: 5,
    });

    // Sin acción definida → el existente queda intacto
    const sinAccion = await importarProductos(
      [{ sku: "IMP-EXISTE", nombre: "No me toques", precioCosto: 50, precioVenta: 100 }],
      usuario.id
    );
    expect(sinAccion).toMatchObject({ creados: 0, actualizados: 0, omitidos: 1 });

    const antes = await prisma.producto.findUnique({ where: { id: existente.id } });
    expect(antes?.nombre).toBe("Producto test");
    expect(Number(antes?.precioVenta)).toBe(100);
    expect(antes?.stockActual).toBe(5);

    // Con accionSiExiste: "actualizar" → aplica nombre, precio y stock objetivo
    const actualizada = await importarProductos(
      [
        {
          sku: "IMP-EXISTE",
          nombre: "Actualizado por import",
          precioCosto: 50,
          precioVenta: 190,
          stockActual: 20,
          accionSiExiste: "actualizar",
        },
      ],
      usuario.id
    );
    expect(actualizada).toMatchObject({ creados: 0, actualizados: 1, omitidos: 0 });
    expect(actualizada.errores).toHaveLength(0);

    const producto = await prisma.producto.findUnique({ where: { id: existente.id } });
    expect(producto?.nombre).toBe("Actualizado por import");
    expect(Number(producto?.precioVenta)).toBe(190);
    expect(producto?.stockActual).toBe(20);

    // La diferencia de stock (20 - 5 = +15) queda auditada como ajuste
    const ajuste = await prisma.movimientoStock.findFirst({
      where: { productoId: existente.id, tipo: TipoMovimientoStock.AJUSTE },
    });
    expect(ajuste?.cantidad).toBe(15);
    expect(ajuste?.motivo).toBe("Importación masiva - ajuste de stock");
  });

  it("rechaza códigos de barras que ya le pertenecen a otro producto", async () => {
    const usuario = await crearUsuarioTest();
    await crearProductoTest({ sku: "DUENO", codigoBarras: "7790000000001" });

    const resultado = await importarProductos(
      [
        {
          sku: "INTRUSO",
          nombre: "Intenta robar el código",
          precioCosto: 10,
          precioVenta: 20,
          codigoBarras: "7790000000001",
        },
      ],
      usuario.id
    );

    expect(resultado.creados).toBe(0);
    expect(resultado.errores).toHaveLength(1);
    expect(resultado.errores[0].motivo).toMatch(/ya pertenece al producto DUENO/);

    const intruso = await prisma.producto.findUnique({ where: { sku: "INTRUSO" } });
    expect(intruso).toBeNull();
  });

  it("rechaza códigos de barras repetidos dentro del archivo", async () => {
    const usuario = await crearUsuarioTest();

    const resultado = await importarProductos(
      [
        {
          sku: "CB-A",
          nombre: "A",
          precioCosto: 10,
          precioVenta: 20,
          codigoBarras: "7791111111111",
        },
        {
          sku: "CB-B",
          nombre: "B",
          precioCosto: 10,
          precioVenta: 20,
          codigoBarras: "7791111111111",
        },
      ],
      usuario.id
    );

    expect(resultado.creados).toBe(1);
    expect(resultado.errores).toHaveLength(1);
    expect(resultado.errores[0].sku).toBe("CB-B");
    expect(resultado.errores[0].motivo).toMatch(/duplicado/i);
  });
});
