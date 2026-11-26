-- Importación de facturas de compra: datos fiscales del proveedor y del
-- comprobante, equivalencias producto-proveedor y borradores de importación.
-- Todo lo nuevo es nullable o tiene default, así que no rompe las compras
-- existentes.

-- ─────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────
CREATE TYPE "OrigenCompra" AS ENUM ('MANUAL', 'IMPORTADA');
CREATE TYPE "EstadoImportacion" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'DESCARTADA');
CREATE TYPE "MotorExtraccion" AS ENUM ('LOCAL', 'IA');

-- ─────────────────────────────────────────────
-- Proveedores: CUIT y condición frente al IVA
-- ─────────────────────────────────────────────
ALTER TABLE "proveedores" ADD COLUMN "cuit" TEXT;
ALTER TABLE "proveedores" ADD COLUMN "condicion_iva" "CondicionIva";
CREATE UNIQUE INDEX "proveedores_cuit_key" ON "proveedores"("cuit");

-- ─────────────────────────────────────────────
-- Compras: datos del comprobante y origen
-- ─────────────────────────────────────────────
ALTER TABLE "compras" ADD COLUMN "tipo_comprobante" TEXT;
ALTER TABLE "compras" ADD COLUMN "punto_venta" INTEGER;
ALTER TABLE "compras" ADD COLUMN "numero_comprobante" TEXT;
ALTER TABLE "compras" ADD COLUMN "fecha_comprobante" TIMESTAMP(3);
ALTER TABLE "compras" ADD COLUMN "proveedor_cuit" TEXT;
ALTER TABLE "compras" ADD COLUMN "subtotal" DECIMAL(12,2);
ALTER TABLE "compras" ADD COLUMN "iva" DECIMAL(12,2);
ALTER TABLE "compras" ADD COLUMN "percepciones" DECIMAL(12,2);
ALTER TABLE "compras" ADD COLUMN "cae" TEXT;
ALTER TABLE "compras" ADD COLUMN "origen" "OrigenCompra" NOT NULL DEFAULT 'MANUAL';

CREATE UNIQUE INDEX "compras_proveedor_id_tipo_comprobante_punto_venta_numero_comprobante_key"
    ON "compras"("proveedor_id", "tipo_comprobante", "punto_venta", "numero_comprobante");

-- ─────────────────────────────────────────────
-- Items de compra: datos tal como venían en la factura
-- ─────────────────────────────────────────────
ALTER TABLE "compra_items" ADD COLUMN "descripcion" TEXT;
ALTER TABLE "compra_items" ADD COLUMN "codigo_proveedor" TEXT;
ALTER TABLE "compra_items" ADD COLUMN "alicuota_iva" DECIMAL(4,2);

-- ─────────────────────────────────────────────
-- Equivalencias producto <-> proveedor
-- ─────────────────────────────────────────────
CREATE TABLE "producto_proveedor" (
    "id" SERIAL NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "codigo_proveedor" TEXT,
    "descripcion_proveedor" TEXT,
    "ultimo_precio" DECIMAL(12,2),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_proveedor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "producto_proveedor_proveedor_id_codigo_proveedor_key"
    ON "producto_proveedor"("proveedor_id", "codigo_proveedor");
CREATE INDEX "producto_proveedor_proveedor_id_producto_id_idx"
    ON "producto_proveedor"("proveedor_id", "producto_id");
CREATE INDEX "producto_proveedor_producto_id_idx"
    ON "producto_proveedor"("producto_id");

ALTER TABLE "producto_proveedor"
    ADD CONSTRAINT "producto_proveedor_proveedor_id_fkey"
    FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "producto_proveedor"
    ADD CONSTRAINT "producto_proveedor_producto_id_fkey"
    FOREIGN KEY ("producto_id") REFERENCES "productos"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────
-- Borradores de facturas importadas
-- ─────────────────────────────────────────────
CREATE TABLE "importaciones_factura" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "nombre_archivo" TEXT,
    "archivo_mime" TEXT,
    "archivo_contenido" BYTEA,
    "archivo_hash" TEXT,
    "estado" "EstadoImportacion" NOT NULL DEFAULT 'PENDIENTE',
    "motor" "MotorExtraccion" NOT NULL DEFAULT 'LOCAL',
    "proveedor_id" INTEGER,
    "proveedor_cuit" TEXT,
    "proveedor_nombre" TEXT,
    "tipo_comprobante" TEXT,
    "punto_venta" INTEGER,
    "numero_comprobante" TEXT,
    "fecha_comprobante" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2),
    "iva" DECIMAL(12,2),
    "percepciones" DECIMAL(12,2),
    "total" DECIMAL(12,2),
    "cae" TEXT,
    "items_json" JSONB NOT NULL,
    "advertencias_json" JSONB,
    "confianza" INTEGER,
    "error" TEXT,
    "compra_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importaciones_factura_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "importaciones_factura_compra_id_key"
    ON "importaciones_factura"("compra_id");
CREATE INDEX "importaciones_factura_estado_idx"
    ON "importaciones_factura"("estado");
CREATE INDEX "importaciones_factura_creado_en_idx"
    ON "importaciones_factura"("creado_en");

ALTER TABLE "importaciones_factura"
    ADD CONSTRAINT "importaciones_factura_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "importaciones_factura"
    ADD CONSTRAINT "importaciones_factura_proveedor_id_fkey"
    FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "importaciones_factura"
    ADD CONSTRAINT "importaciones_factura_compra_id_fkey"
    FOREIGN KEY ("compra_id") REFERENCES "compras"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
