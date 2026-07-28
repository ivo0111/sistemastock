-- CreateEnum
CREATE TYPE "CondicionIva" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'CONSUMIDOR_FINAL', 'EXENTO');

-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('FACTURA_A', 'FACTURA_B', 'FACTURA_C');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "condicion_iva" "CondicionIva",
ADD COLUMN     "cuit" TEXT;

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "cae" TEXT,
ADD COLUMN     "cae_vencimiento" TIMESTAMP(3),
ADD COLUMN     "numero_comprobante" INTEGER,
ADD COLUMN     "punto_venta" INTEGER,
ADD COLUMN     "tipo_comprobante" "TipoComprobante";
