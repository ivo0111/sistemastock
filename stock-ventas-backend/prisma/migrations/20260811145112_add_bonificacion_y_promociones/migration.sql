-- CreateEnum
CREATE TYPE "TipoPromocion" AS ENUM ('DOS_POR_UNO', 'DESCUENTO_PORCENTUAL', 'SEGUNDA_UNIDAD');

-- AlterTable
ALTER TABLE "venta_items" ADD COLUMN     "bonificacion_porcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "promociones" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoPromocion" NOT NULL,
    "producto_id" INTEGER,
    "valor" DECIMAL(5,2) NOT NULL,
    "cantidad_minima" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_inicio" TIMESTAMP(3),
    "fecha_fin" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promociones_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
