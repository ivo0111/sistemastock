-- Red de seguridad de la numeración fiscal: dos comprobantes del mismo tipo y
-- punto de venta no pueden repetir número (el lock de fila evita la carrera,
-- esto es lo que garantiza la base como última instancia).
-- Columnas nullable: en Postgres las claves únicas no compiten con NULL, así
-- que las ventas sin comprobante no chocan entre sí.
CREATE UNIQUE INDEX "ventas_punto_venta_tipo_comprobante_numero_comprobante_key" ON "ventas"("punto_venta", "tipo_comprobante", "numero_comprobante");

-- Ventas anteriores a la migración de caja quedaron con caja_id NULL: si el
-- turno de caja estaba abierto al actualizar, su "esperado" salía de menos
-- porque esas ventas no sumaban. Se imputa cada venta a la caja del mismo
-- usuario que estaba abierta en el momento de la venta. Idempotente: no toca
-- las ventas que ya tienen caja asignada.
UPDATE "ventas" v
SET "caja_id" = (
  SELECT c."id" FROM "caja" c
  WHERE c."usuario_id" = v."usuario_id"
    AND c."fecha_apertura" <= v."fecha"
    AND (c."fecha_cierre" IS NULL OR c."fecha_cierre" >= v."fecha")
  ORDER BY c."fecha_apertura" DESC
  LIMIT 1
)
WHERE v."caja_id" IS NULL;
