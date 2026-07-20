-- CreateEnum
CREATE TYPE "TipoMovimientoCuentaCorriente" AS ENUM ('CARGO', 'PAGO', 'AJUSTE');

-- CreateTable
CREATE TABLE "movimientos_cuenta_corriente" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "tipo" "TipoMovimientoCuentaCorriente" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" INTEGER NOT NULL,
    "referencia_tipo" TEXT,
    "referencia_id" INTEGER,
    "motivo" TEXT,

    CONSTRAINT "movimientos_cuenta_corriente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_cuenta_corriente_cliente_id_idx" ON "movimientos_cuenta_corriente"("cliente_id");

-- CreateIndex
CREATE INDEX "movimientos_cuenta_corriente_fecha_idx" ON "movimientos_cuenta_corriente"("fecha");

-- AddForeignKey
ALTER TABLE "movimientos_cuenta_corriente" ADD CONSTRAINT "movimientos_cuenta_corriente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta_corriente" ADD CONSTRAINT "movimientos_cuenta_corriente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
