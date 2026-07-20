import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { TipoMovimientoCuentaCorriente, Prisma } from "@prisma/client";

interface ClienteInput {
  nombre: string;
  telefono?: string;
  email?: string;
}

export async function listarClientes(busqueda?: string) {
  return prisma.cliente.findMany({
    where: busqueda
      ? { nombre: { contains: busqueda, mode: "insensitive" } }
      : undefined,
    orderBy: { nombre: "asc" },
  });
}

export async function obtenerCliente(id: number) {
  const cliente = await prisma.cliente.findUnique({ where: { id } });
  if (!cliente) throw new AppError("CLIENTE_NO_ENCONTRADO", "El cliente no existe", 404);
  return cliente;
}

export async function crearCliente(input: ClienteInput) {
  return prisma.cliente.create({ data: { ...input, cuentaCorrienteSaldo: 0 } });
}

export async function actualizarCliente(id: number, input: Partial<ClienteInput>) {
  await obtenerCliente(id);
  return prisma.cliente.update({ where: { id }, data: input });
}

export async function eliminarCliente(id: number) {
  const cliente = await obtenerCliente(id);

  if (!cliente.cuentaCorrienteSaldo.equals(0)) {
    throw new AppError(
      "CUENTA_CORRIENTE_PENDIENTE",
      "No se puede borrar: el cliente tiene saldo pendiente en cuenta corriente",
      409
    );
  }

  const ventasAsociadas = await prisma.venta.count({ where: { clienteId: id } });
  if (ventasAsociadas > 0) {
    throw new AppError(
      "CLIENTE_EN_USO",
      `No se puede borrar: tiene ${ventasAsociadas} venta(s) asociada(s)`,
      409
    );
  }

  return prisma.cliente.delete({ where: { id } });
}

export async function obtenerHistorial(id: number) {
  await obtenerCliente(id);
  return prisma.venta.findMany({
    where: { clienteId: id },
    include: { items: true },
    orderBy: { fecha: "desc" },
  });
}

// Registra un movimiento de cuenta corriente (pago, cargo o ajuste manual)
// y actualiza el saldo del cliente, todo en una única transacción — mismo
// patrón que usamos para stock: el saldo en `Cliente` es un caché, la fuente
// de verdad es la tabla de movimientos.
export async function ajustarCuentaCorriente(
  id: number,
  monto: number,
  motivo: string,
  usuarioId: number,
  tipo: TipoMovimientoCuentaCorriente = "AJUSTE"
) {
  await obtenerCliente(id);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.movimientoCuentaCorriente.create({
      data: {
        clienteId: id,
        tipo,
        monto,
        usuarioId,
        motivo,
      },
    });

    return tx.cliente.update({
      where: { id },
      data: { cuentaCorrienteSaldo: { increment: monto } },
    });
  });
}

export async function obtenerMovimientosCuentaCorriente(id: number) {
  await obtenerCliente(id);
  return prisma.movimientoCuentaCorriente.findMany({
    where: { clienteId: id },
    orderBy: { fecha: "desc" },
  });
}