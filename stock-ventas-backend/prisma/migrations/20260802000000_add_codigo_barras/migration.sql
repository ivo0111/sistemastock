-- AlterTable
ALTER TABLE "productos" ADD COLUMN "codigo_barras" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigo_barras_key" ON "productos"("codigo_barras");
