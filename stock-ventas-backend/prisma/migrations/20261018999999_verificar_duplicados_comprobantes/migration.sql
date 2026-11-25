-- Preflight de la migración 20261019000000_add_venta_comprobante_unico_y_backfill_caja.
--
-- El índice único (punto_venta, tipo_comprobante, numero_comprobante) no se
-- puede crear si la base ya tiene comprobantes duplicados. En vez de dejar que
-- Postgres falle con un error genérico de índice (o, peor, que el backfill de
-- caja se aplique a medias), se detecta el problema ANTES y se aborta la
-- migración con un mensaje que indica exactamente qué comprobantes revisar.
--
-- Esta migración tiene timestamp anterior a 20261019000000 a propósito: en una
-- base nueva corre justo antes del índice único. En una base donde esa
-- migración ya estaba aplicada, Prisma la ejecuta como pendiente y la
-- verificación sigue siendo válida (el índice ya impide duplicados).
DO $$
DECLARE
  duplicado RECORD;
  total_duplicados INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO total_duplicados
    FROM (
      SELECT 1
        FROM "ventas"
       WHERE "numero_comprobante" IS NOT NULL
       GROUP BY "punto_venta", "tipo_comprobante", "numero_comprobante"
      HAVING COUNT(*) > 1
    ) d;

  IF total_duplicados > 0 THEN
    SELECT v."punto_venta",
           v."tipo_comprobante",
           v."numero_comprobante",
           COUNT(*) AS cantidad,
           STRING_AGG(v."id"::text, ', ' ORDER BY v."id") AS venta_ids
      INTO duplicado
      FROM "ventas" v
     WHERE v."numero_comprobante" IS NOT NULL
     GROUP BY v."punto_venta", v."tipo_comprobante", v."numero_comprobante"
    HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC, v."punto_venta", v."tipo_comprobante", v."numero_comprobante"
     LIMIT 1;

    RAISE EXCEPTION
      'Migración abortada: hay % combinaciones de comprobantes duplicados. Ejemplo: punto_venta=%, tipo_comprobante=%, numero_comprobante=% (venta ids: %). Corregí o anulá los duplicados antes de volver a migrar. Podés usar `npm run verificar:comprobantes` para listarlos.',
      total_duplicados,
      duplicado."punto_venta",
      duplicado."tipo_comprobante",
      duplicado."numero_comprobante",
      duplicado.venta_ids;
  END IF;
END
$$;
