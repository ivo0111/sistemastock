-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "domicilio_comercial" TEXT;

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "alicuota_iva" DECIMAL(4,2) NOT NULL DEFAULT 21.00,
ADD COLUMN     "unidad_medida" TEXT NOT NULL DEFAULT 'unidades';
