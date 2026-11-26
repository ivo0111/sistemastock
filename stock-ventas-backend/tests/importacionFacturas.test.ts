import { beforeAll, describe, expect, it } from "vitest";
import { OrigenCompra, Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { parsearFactura, parsearImporte, normalizarCuit } from "../src/modules/compras/importacion/parser";
import { buscarProveedorPorNombre, similitud, sugerirProductos } from "../src/modules/compras/importacion/matching";
import { confirmarImportacion } from "../src/modules/compras/importacion/importacion.service";
import type { ItemFactura, LineaTexto, PaginaTexto } from "../src/modules/compras/importacion/types";
import {
  crearProductoTest,
  crearUsuarioTest,
  idUnico,
  limpiarBase,
  rechazarCon,
} from "./helpers";

beforeAll(limpiarBase);

function linea(y: number, fragmentos: Array<{ x: number; texto: string }>): LineaTexto {
  const conAncho = fragmentos.map((fragmento) => ({
    ...fragmento,
    ancho: fragmento.texto.length * 5,
  }));
  return {
    y,
    x: conAncho[0]?.x ?? 0,
    texto: conAncho.map((fragmento) => fragmento.texto).join(" "),
    fragmentos: conAncho,
  };
}

function facturaDePrueba(): PaginaTexto {
  return {
    ancho: 595,
    alto: 842,
    lineas: [
      linea(780, [{ x: 40, texto: "PROVEEDOR TEST S.A." }]),
      linea(770, [{ x: 300, texto: "FACTURA A" }]),
      linea(760, [{ x: 40, texto: "Razón Social: PROVEEDOR TEST S.A." }]),
      linea(750, [{ x: 40, texto: "CUIT: 30-71234567-8 Fecha: 20/11/2026" }]),
      linea(720, [
        { x: 40, texto: "Código" },
        { x: 120, texto: "Descripción" },
        { x: 330, texto: "Cant." },
        { x: 400, texto: "P. Unitario" },
        { x: 480, texto: "% Bonif." },
        { x: 550, texto: "Subtotal" },
      ]),
      linea(710, [
        { x: 40, texto: "P001" },
        { x: 120, texto: "Producto Uno" },
        { x: 330, texto: "10" },
        { x: 400, texto: "1.500,00" },
        { x: 480, texto: "0" },
        { x: 550, texto: "15.000,00" },
      ]),
      linea(700, [
        { x: 40, texto: "P002" },
        { x: 120, texto: "Producto Dos" },
        { x: 330, texto: "24" },
        { x: 400, texto: "950,50" },
        { x: 480, texto: "0" },
        { x: 550, texto: "22.812,00" },
      ]),
      linea(680, [{ x: 450, texto: "Subtotal: $ 37.812,00" }]),
      linea(670, [{ x: 450, texto: "IVA 21%: $ 7.940,52" }]),
      linea(660, [{ x: 430, texto: "Importe Total: $ 45.752,52" }]),
      linea(640, [{ x: 40, texto: "CAE N°: 71234567890123" }]),
    ],
  };
}

function itemImportado(
  lineaFactura: number,
  descripcion: string,
  cantidad: number,
  precioUnitario: number,
  codigoProveedor: string | null = null
): ItemFactura {
  return {
    linea: lineaFactura,
    codigoProveedor,
    descripcion,
    cantidad,
    precioUnitario,
    subtotal: cantidad * precioUnitario,
    alicuotaIva: 21,
  };
}

async function crearImportacionTest(input: {
  usuarioId: number;
  proveedorId?: number | null;
  numeroComprobante?: string;
  items: ItemFactura[];
  total?: number;
}) {
  return prisma.importacionFactura.create({
    data: {
      usuarioId: input.usuarioId,
      nombreArchivo: "factura-test.pdf",
      archivoMime: "application/pdf",
      estado: "PENDIENTE",
      motor: "LOCAL",
      proveedorId: input.proveedorId ?? null,
      proveedorCuit: "30-71234567-8",
      proveedorNombre: "PROVEEDOR TEST S.A.",
      tipoComprobante: "A",
      puntoVenta: 1,
      numeroComprobante: input.numeroComprobante ?? idUnico("C"),
      fechaComprobante: new Date("2026-11-20T12:00:00.000Z"),
      subtotal: input.items.reduce((suma, item) => suma + item.subtotal, 0),
      iva: 0,
      total: input.total ?? input.items.reduce((suma, item) => suma + item.subtotal, 0),
      itemsJson: input.items as unknown as Prisma.InputJsonValue,
      advertencias: [] as unknown as Prisma.InputJsonValue,
      confianza: 100,
    },
  });
}

describe("parser de facturas", () => {
  it("interpreta importes argentinos y normaliza CUIT", () => {
    expect(parsearImporte("1.234,56")).toBe(1234.56);
    expect(parsearImporte("$ 60.012,00")).toBe(60012);
    expect(parsearImporte("1500.50")).toBe(1500.5);
    expect(parsearImporte("1.500")).toBe(1500);
    expect(normalizarCuit("30712345678")).toBe("30-71234567-8");
    expect(normalizarCuit("123")).toBeNull();
  });

  it("detecta encabezado e ítems por coordenadas sin confundir el subtotal", () => {
    const factura = parsearFactura([facturaDePrueba()]);

    expect(factura.encabezado).toMatchObject({
      proveedorCuit: "30-71234567-8",
      proveedorNombre: "PROVEEDOR TEST S.A.",
      tipoComprobante: "A",
      fechaComprobante: "2026-11-20",
      subtotal: 37812,
      iva: 7940.52,
      total: 45752.52,
      cae: "71234567890123",
    });
    expect(factura.advertencias).toHaveLength(0);
    expect(factura.items).toHaveLength(2);
    expect(factura.items[0]).toMatchObject({
      codigoProveedor: "P001",
      descripcion: "Producto Uno",
      cantidad: 10,
      precioUnitario: 1500,
      subtotal: 15000,
    });
    expect(factura.items[1]).toMatchObject({
      codigoProveedor: "P002",
      descripcion: "Producto Dos",
      cantidad: 24,
      precioUnitario: 950.5,
      subtotal: 22812,
    });
  });
});

describe("matching de productos y proveedores", () => {
  it("prioriza código de proveedor, SKU y nombre similar", () => {
    const productos = [
      {
        id: 1,
        sku: "YER-001",
        nombre: "Yerba Mate Tradicional 1 kg",
        codigoBarras: null,
        precioCosto: 1000,
        precioVenta: 1500,
        alicuotaIva: 21,
      },
      {
        id: 2,
        sku: "AZU-001",
        nombre: "Azúcar Ledesma 1 kg",
        codigoBarras: "7791234567890",
        precioCosto: 700,
        precioVenta: 1000,
        alicuotaIva: 21,
      },
    ];

    const items = [
      itemImportado(1, "Yerba Mate Tradicional 1 kg", 1, 1000, "P001"),
      itemImportado(2, "Azucar Ledesma 1kg", 1, 700),
      itemImportado(3, "Producto inexistente XYZ", 1, 500),
    ];

    const resultado = sugerirProductos(items, productos, [
      { codigoProveedor: "P001", productoId: 1 },
    ]);

    expect(resultado[0].productoIdSugerido).toBe(1);
    expect(resultado[0].sugerencias[0]).toMatchObject({
      productoId: 1,
      puntaje: 100,
      motivo: "código de proveedor",
    });
    expect(resultado[1].productoIdSugerido).toBe(2);
    expect(resultado[2].productoIdSugerido).toBeNull();
  });

  it("no sugiere un proveedor si el nombre no es suficientemente parecido", () => {
    expect(
      buscarProveedorPorNombre("DISTRIBUIDORA DEL NORTE S.A.", [
        { id: 1, nombre: "DISTRIBUIDORA DEL NORTE S.A." },
        { id: 2, nombre: "OTRO PROVEEDOR" },
      ])
    ).toEqual({ proveedorId: 1, puntaje: 1 });

    expect(
      buscarProveedorPorNombre("DISTRIBUIDORA DEL NORTE S.A.", [
        { id: 2, nombre: "OTRO PROVEEDOR" },
      ])
    ).toBeNull();
    expect(similitud("Azúcar Ledesma", "Azucar Ledesma")).toBe(1);
  });
});

describe("confirmación de importaciones", () => {
  it("crea la compra, impacta stock, guarda equivalencias y no permite confirmar dos veces", async () => {
    const usuario = await crearUsuarioTest();
    const proveedor = await prisma.proveedor.create({
      data: { nombre: "PROVEEDOR TEST S.A.", cuit: "30-71234567-8" },
    });
    const productoUno = await crearProductoTest({
      nombre: "Producto Uno",
      sku: "P-UNO",
      stockActual: 5,
      precioCosto: 1000,
    });
    const productoDos = await crearProductoTest({
      nombre: "Producto Dos",
      sku: "P-DOS",
      stockActual: 2,
      precioCosto: 800,
    });

    const importacion = await crearImportacionTest({
      usuarioId: usuario.id,
      proveedorId: proveedor.id,
      items: [
        itemImportado(1, "Producto Uno", 10, 1500, "P001"),
        itemImportado(2, "Producto Dos", 24, 950.5, "P002"),
      ],
      total: 45752.52,
    });

    const compra = await confirmarImportacion(
      importacion.id,
      {
        proveedorId: proveedor.id,
        items: [
          { linea: 1, productoId: productoUno.id, cantidad: 10, precioUnitario: 1500 },
          { linea: 2, productoId: productoDos.id, cantidad: 24, precioUnitario: 950.5 },
        ],
        actualizarPrecioCosto: true,
      },
      usuario.id
    );

    expect(compra.origen).toBe(OrigenCompra.IMPORTADA);
    expect(Number(compra.total)).toBe(45752.52);

    const [uno, dos] = await Promise.all([
      prisma.producto.findUniqueOrThrow({ where: { id: productoUno.id } }),
      prisma.producto.findUniqueOrThrow({ where: { id: productoDos.id } }),
    ]);
    expect(uno.stockActual).toBe(15);
    expect(dos.stockActual).toBe(26);
    expect(Number(uno.precioCosto)).toBe(1500);
    expect(Number(dos.precioCosto)).toBe(950.5);

    const movimientos = await prisma.movimientoStock.count({
      where: { referenciaTipo: "compra", referenciaId: compra.id },
    });
    expect(movimientos).toBe(2);

    const equivalentes = await prisma.productoProveedor.findMany({
      where: { proveedorId: proveedor.id },
      orderBy: { codigoProveedor: "asc" },
    });
    expect(equivalentes).toHaveLength(2);
    expect(equivalentes[0]).toMatchObject({
      codigoProveedor: "P001",
      productoId: productoUno.id,
    });

    const actualizada = await prisma.importacionFactura.findUniqueOrThrow({
      where: { id: importacion.id },
    });
    expect(actualizada.estado).toBe("CONFIRMADA");
    expect(actualizada.compraId).toBe(compra.id);

    await rechazarCon("IMPORTACION_NO_PENDIENTE", () =>
      confirmarImportacion(
        importacion.id,
        {
          proveedorId: proveedor.id,
          items: [
            { linea: 1, productoId: productoUno.id, cantidad: 10, precioUnitario: 1500 },
          ],
        },
        usuario.id
      )
    );
  });

  it("crea proveedor y producto nuevo dentro de la misma transacción", async () => {
    const usuario = await crearUsuarioTest();
    const importacion = await crearImportacionTest({
      usuarioId: usuario.id,
      items: [itemImportado(1, "Producto Nuevo", 3, 100, "NUEVO-1")],
    });

    const compra = await confirmarImportacion(
      importacion.id,
      {
        crearProveedor: {
          nombre: "PROVEEDOR NUEVO",
          cuit: "20-11111111-2",
          condicionIva: "MONOTRIBUTO",
        },
        items: [
          {
            linea: 1,
            crearProducto: {
              nombre: "Producto Nuevo",
              precioVenta: 250,
            },
            cantidad: 3,
            precioUnitario: 100,
            alicuotaIva: 21,
          },
        ],
      },
      usuario.id
    );

    const proveedor = await prisma.proveedor.findUniqueOrThrow({
      where: { cuit: "20-11111111-2" },
    });
    expect(compra.proveedorId).toBe(proveedor.id);
    expect(proveedor.nombre).toBe("PROVEEDOR NUEVO");

    const producto = await prisma.producto.findFirstOrThrow({
      where: { nombre: "Producto Nuevo" },
    });
    expect(producto.stockActual).toBe(3);
    expect(Number(producto.precioCosto)).toBe(100);
    expect(Number(producto.precioVenta)).toBe(250);
    expect(producto.sku).toBe("NUEVO-1");

    const equivalencia = await prisma.productoProveedor.findFirst({
      where: { proveedorId: proveedor.id, codigoProveedor: "NUEVO-1" },
    });
    expect(equivalencia?.productoId).toBe(producto.id);
  });

  it("rollbackea todo si falta mapear una línea", async () => {
    const usuario = await crearUsuarioTest();
    const proveedor = await prisma.proveedor.create({
      data: { nombre: "PROVEEDOR ROLLBACK", cuit: "20-22222222-3" },
    });
    const producto = await crearProductoTest({ nombre: "Producto Rollback", stockActual: 1 });
    const importacion = await crearImportacionTest({
      usuarioId: usuario.id,
      proveedorId: proveedor.id,
      items: [
        itemImportado(1, "Producto Rollback", 2, 100),
        itemImportado(2, "Otra línea", 1, 50),
      ],
    });

    await rechazarCon("ITEMS_INCOMPLETOS", () =>
      confirmarImportacion(
        importacion.id,
        {
          proveedorId: proveedor.id,
          items: [
            { linea: 1, productoId: producto.id, cantidad: 2, precioUnitario: 100 },
          ],
        },
        usuario.id
      )
    );

    const sinCambios = await prisma.importacionFactura.findUniqueOrThrow({
      where: { id: importacion.id },
    });
    expect(sinCambios.estado).toBe("PENDIENTE");
    expect(sinCambios.compraId).toBeNull();

    const productoPosterior = await prisma.producto.findUniqueOrThrow({
      where: { id: producto.id },
    });
    expect(productoPosterior.stockActual).toBe(1);
    expect(await prisma.compra.count({ where: { proveedorId: proveedor.id } })).toBe(0);
  });

  it("rechaza un comprobante ya registrado para el mismo proveedor", async () => {
    const usuario = await crearUsuarioTest();
    const proveedor = await prisma.proveedor.create({
      data: { nombre: "PROVEEDOR DUPLICADO", cuit: "20-33333333-4" },
    });
    const producto = await crearProductoTest({ nombre: "Producto Duplicado", stockActual: 0 });
    const items = [itemImportado(1, "Producto Duplicado", 1, 100)];
    const numeroComprobante = idUnico("DUP");

    const primera = await crearImportacionTest({
      usuarioId: usuario.id,
      proveedorId: proveedor.id,
      numeroComprobante,
      items,
    });
    await confirmarImportacion(
      primera.id,
      {
        proveedorId: proveedor.id,
        items: [{ linea: 1, productoId: producto.id, cantidad: 1, precioUnitario: 100 }],
      },
      usuario.id
    );

    const segunda = await crearImportacionTest({
      usuarioId: usuario.id,
      proveedorId: proveedor.id,
      numeroComprobante,
      items,
    });

    await rechazarCon("COMPROBANTE_DUPLICADO", () =>
      confirmarImportacion(
        segunda.id,
        {
          proveedorId: proveedor.id,
          items: [{ linea: 1, productoId: producto.id, cantidad: 1, precioUnitario: 100 }],
        },
        usuario.id
      )
    );

    const pendiente = await prisma.importacionFactura.findUniqueOrThrow({
      where: { id: segunda.id },
    });
    expect(pendiente.estado).toBe("PENDIENTE");
  });
});
