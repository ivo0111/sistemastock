-- Forma de pago "cuenta corriente": la venta genera un CARGO en la cuenta
-- corriente del cliente en lugar de cobrarse al momento.
ALTER TYPE "FormaPago" ADD VALUE 'CUENTA_CORRIENTE';

-- La compra guarda quién la registró (nullable por compatibilidad con filas
-- antiguas: toda compra nueva lleva el usuario).
ALTER TABLE "compras" ADD COLUMN "usuario_id" INTEGER;
ALTER TABLE "compras" ADD CONSTRAINT "compras_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Asociación venta <-> caja (turno de caja): antes las ventas se imputaban a
-- la caja "por rango de fechas", lo que se rompía con varias cajas abiertas.
ALTER TABLE "ventas" ADD COLUMN "caja_id" INTEGER;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_caja_id_fkey"
  FOREIGN KEY ("caja_id") REFERENCES "caja"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Salvaguarda previa al índice único: si el código viejo dejó más de una caja
-- abierta por usuario (estado inválido), se cierran las antiguas
-- conservando la última.
UPDATE caja SET fecha_cierre = now()
WHERE fecha_cierre IS NULL
  AND id NOT IN (SELECT MAX(id) FROM caja WHERE fecha_cierre IS NULL GROUP BY usuario_id);

-- A lo sumo UNA caja abierta por usuario, garantizado por la base: es lo que
-- cierra la condición de carrera de abrirCaja (dos aperturas simultáneas).
CREATE UNIQUE INDEX "caja_abierta_unica_por_usuario"
  ON "caja"("usuario_id") WHERE "fecha_cierre" IS NULL;
