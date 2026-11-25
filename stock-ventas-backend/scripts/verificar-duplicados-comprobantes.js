#!/usr/bin/env node
/*
 * Detecta comprobantes duplicados antes de aplicar la migración que crea el
 * índice único (punto_venta, tipo_comprobante, numero_comprobante).
 *
 * Uso:
 *   node scripts/verificar-duplicados-comprobantes.js
 *   npm run verificar:comprobantes
 *
 * Códigos de salida:
 *   0 -> no hay duplicados (o la tabla ventas todavía no existe)
 *   2 -> hay duplicados: se listan y el proceso falla
 *   5 -> no se pudo obtener DATABASE_URL
 *   1 -> error inesperado
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "ERROR: falta DATABASE_URL (definila en stock-ventas-backend/.env o como variable de entorno)."
    );
    process.exit(5);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const tabla = await client.query("SELECT to_regclass('public.ventas') AS tabla");
    if (!tabla.rows[0]?.tabla) {
      console.log(
        "La tabla 'ventas' todavía no existe: no hay comprobantes que puedan estar duplicados."
      );
      return;
    }

    const { rows } = await client.query(`
      SELECT punto_venta,
             tipo_comprobante,
             numero_comprobante,
             COUNT(*)::int AS cantidad,
             STRING_AGG(id::text, ', ' ORDER BY id) AS venta_ids
        FROM ventas
       WHERE numero_comprobante IS NOT NULL
       GROUP BY punto_venta, tipo_comprobante, numero_comprobante
      HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC, punto_venta, tipo_comprobante, numero_comprobante
    `);

    if (rows.length === 0) {
      console.log("OK: no hay comprobantes duplicados.");
      return;
    }

    console.error(
      `ERROR: hay ${rows.length} combinación(es) de comprobantes duplicados. ` +
        "La migración 20261019000000_add_venta_comprobante_unico_y_backfill_caja va a fallar."
    );
    console.error("Corregí o anulá estos comprobantes antes de continuar:");
    for (const fila of rows) {
      console.error(
        `  - punto_venta=${fila.punto_venta}, tipo_comprobante=${fila.tipo_comprobante}, ` +
          `numero_comprobante=${fila.numero_comprobante}, cantidad=${fila.cantidad}, ` +
          `venta_ids=[${fila.venta_ids}]`
      );
    }
    process.exitCode = 2;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR inesperado verificando comprobantes duplicados:", error);
  process.exitCode = 1;
});
