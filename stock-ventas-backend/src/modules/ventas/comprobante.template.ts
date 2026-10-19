import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { arcaConfig } from "../../config/arca.config";
import { ResultadoCAE } from "../arca/arca.types";
import { CONDICION_IVA_LABEL, CODIGO_TIPO_COMPROBANTE } from "./arca.labels";

type VentaConDetalle = Prisma.VentaGetPayload<{
  include: { items: { include: { producto: true } }; cliente: true; usuario: true };
}>;

const TIPO_COMPROBANTE_LABEL: Record<string, string> = {
  FACTURA_A: "FACTURA A",
  FACTURA_B: "FACTURA B",
  FACTURA_C: "FACTURA C",
};

const FORMA_PAGO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  CUENTA_CORRIENTE: "Cuenta Corriente",
};

// Código ARCA de la Factura C: los comprobantes de este tipo no discriminan IVA
// (emisor Monotributo), así que el desglose no corresponde mostrarlo.
const CODIGO_FACTURA_C = "11";

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatearMoneda(valor: Prisma.Decimal | number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(valor)
  );
}

const DOS_DECIMALES = 2;

function redondear2(valor: Prisma.Decimal): Prisma.Decimal {
  return valor.toDecimalPlaces(DOS_DECIMALES, Prisma.Decimal.ROUND_HALF_UP);
}

interface DetalleIva {
  alicuota: number;
  baseImponible: Prisma.Decimal;
  montoIva: Prisma.Decimal;
}

/**
 * Arma el desglose de IVA agrupado por alícuota, en Decimal (no en floats:
 * los centavos del comprobante deben cuadrar con el total guardado).
 *
 * El descuento global de la venta se prorratea entre los ítems en proporción
 * a su subtotal: sin eso, el "Importe Neto Gravado" + IVA no cerraría contra
 * el Total cuando hay descuento.
 */
function calcularDesgloseIva(
  items: VentaConDetalle["items"],
  descuento: Prisma.Decimal
): DetalleIva[] {
  const subtotalTotal = items.reduce((suma, item) => suma.add(item.subtotal), new Prisma.Decimal(0));
  if (subtotalTotal.isZero()) return [];

  const map = new Map<number, { baseImponible: Prisma.Decimal; montoIva: Prisma.Decimal }>();

  for (const item of items) {
    const alicuota = Number(item.producto.alicuotaIva ?? 21);
    const subtotal = new Prisma.Decimal(item.subtotal);

    // Prorrateo del descuento global sobre este ítem
    const parteDescuento = subtotal.mul(descuento).div(subtotalTotal);
    const subtotalNeto = subtotal.sub(parteDescuento);

    const divisor = new Prisma.Decimal(1).add(new Prisma.Decimal(alicuota).div(100));
    const baseImponible = redondear2(subtotalNeto.div(divisor));
    // El IVA es el resto: base + IVA == subtotalNeto exactamente (sin sobrantes)
    const montoIva = subtotalNeto.sub(baseImponible);

    const acumulado = map.get(alicuota) ?? {
      baseImponible: new Prisma.Decimal(0),
      montoIva: new Prisma.Decimal(0),
    };
    map.set(alicuota, {
      baseImponible: acumulado.baseImponible.add(baseImponible),
      montoIva: acumulado.montoIva.add(montoIva),
    });
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([alicuota, vals]) => ({
      alicuota,
      baseImponible: vals.baseImponible,
      montoIva: vals.montoIva,
    }));
}

/**
 * Arma la URL del QR fiscal que exige ARCA (ver "Especificación Técnica QR").
 * `tipoCmp` debe ir con el código numérico del comprobante (01, 06, 11…),
 * no con el nombre interno ("FACTURA_C").
 */
function armarUrlQrArca(venta: VentaConDetalle): string | null {
  const codigoTipoCmp = CODIGO_TIPO_COMPROBANTE[venta.tipoComprobante ?? "FACTURA_B"];
  if (!codigoTipoCmp || !venta.cae) return null;

  const payload = {
    ver: 1,
    fecha: venta.fecha.toISOString().slice(0, 10),
    cuit: Number(arcaConfig.cuitEmisor || 0),
    ptoVta: venta.puntoVenta,
    tipoCmp: Number(codigoTipoCmp),
    nroCmp: venta.numeroComprobante,
    importe: Number(new Prisma.Decimal(venta.total).toDecimalPlaces(2)),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: venta.cliente?.cuit ? 80 : 99,
    nroDocRec: venta.cliente?.cuit ? Number(venta.cliente.cuit) : 0,
    codAutorizacion: venta.cae,
  };
  const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}

export async function generarHtmlComprobante(
  venta: VentaConDetalle,
  _resultadoCAE?: ResultadoCAE,
  copias = 1
): Promise<string> {
  const esMock = arcaConfig.modo === "mock";
  const tipoComprobante = venta.tipoComprobante ?? "FACTURA_B";
  const tipoLabel = TIPO_COMPROBANTE_LABEL[tipoComprobante];
  const codigoTipoCmp = CODIGO_TIPO_COMPROBANTE[tipoComprobante] ?? "";
  // Solo A y B discriminan IVA. La Factura C (Monotributo) imprime precios finales.
  const discriminaIva = codigoTipoCmp !== CODIGO_FACTURA_C;

  const urlQr = armarUrlQrArca(venta);
  // QR generado localmente: sin dependencia de servicios de terceros y sin
  // necesidad de internet para imprimir el comprobante.
  const qrDataUrl = urlQr
    ? await QRCode.toDataURL(urlQr, { margin: 1, width: 320, errorCorrectionLevel: "M" })
    : null;

  const descuento = new Prisma.Decimal(venta.descuento ?? 0);
  const subtotalBruto = venta.items.reduce(
    (suma, item) => suma.add(item.subtotal),
    new Prisma.Decimal(0)
  );
  const desgloseIva = discriminaIva ? calcularDesgloseIva(venta.items, descuento) : [];

  const filasItems = venta.items
    .map((item) => {
      const bonif = new Prisma.Decimal(item.bonificacionPorcentaje ?? 0);
      const subtotal = new Prisma.Decimal(item.subtotal);
      const celdasBase = `
        <td>${escapeHtml(item.producto.sku || "-")}</td>
        <td>${escapeHtml(item.producto.nombre)}</td>
        <td>${escapeHtml(item.producto.unidadMedida)}</td>`;

      if (!discriminaIva) {
        return `
      <tr>
        ${celdasBase}
        <td class="num">${formatearMoneda(item.precioUnitario)}</td>
        <td class="num">${bonif.toFixed(2)}</td>
        <td class="num">${item.cantidad}</td>
        <td class="num">${formatearMoneda(subtotal)}</td>
      </tr>`;
      }

      const alicuota = Number(item.producto.alicuotaIva ?? 21);
      const divisor = new Prisma.Decimal(1).add(new Prisma.Decimal(alicuota).div(100));
      const precioNeto = redondear2(new Prisma.Decimal(item.precioUnitario).div(divisor));
      const subtotalNeto = redondear2(subtotal.div(divisor));

      return `
      <tr>
        ${celdasBase}
        <td class="num">${formatearMoneda(precioNeto)}</td>
        <td class="num">${bonif.toFixed(2)}</td>
        <td class="num">${item.cantidad}</td>
        <td class="num">${formatearMoneda(subtotalNeto)}</td>
        <td class="num">${alicuota}%</td>
        <td class="num">${formatearMoneda(subtotal)}</td>
      </tr>`;
    })
    .join("");

  const encabezadoTabla = discriminaIva
    ? `<tr><th>Código</th><th>Producto</th><th>U. medida</th><th class="num">P. Unit.</th><th class="num">% Bonif.</th><th class="num">Cant.</th><th class="num">Subtotal</th><th class="num">Alíc. IVA</th><th class="num">Subtotal c/IVA</th></tr>`
    : `<tr><th>Código</th><th>Producto</th><th>U. medida</th><th class="num">P. Unit.</th><th class="num">% Bonif.</th><th class="num">Cant.</th><th class="num">Subtotal</th></tr>`;

  const condicionIvaEmisorLabel =
    CONDICION_IVA_LABEL[arcaConfig.condicionIvaEmisor] ?? arcaConfig.condicionIvaEmisor;
  const condicionIvaClienteLabel =
    CONDICION_IVA_LABEL[venta.cliente?.condicionIva ?? "CONSUMIDOR_FINAL"] ?? "Consumidor Final";
  const formaPagoLabel = FORMA_PAGO_LABEL[venta.formaPago] ?? venta.formaPago;
  const condicionVenta = venta.formaPago === "CUENTA_CORRIENTE" ? "Crédito" : "Contado";

  const ETIQUETA_COPIA = ["ORIGINAL", "DUPLICADO", "TRIPLICADO"];

  const repeticiones = Array.from({ length: copias }, (_, indice) => `
  <div class="page">
  <div class="etiqueta-copia">${ETIQUETA_COPIA[indice] ?? ""}</div>
  <div class="header">
    <div class="datos-empresa">
      <h1>${escapeHtml(arcaConfig.razonSocial)}</h1>
      <div>CUIT: ${escapeHtml(arcaConfig.cuitEmisor || "sin configurar")}</div>
      <div>Domicilio Comercial: ${escapeHtml(arcaConfig.domicilioComercial || "-")}</div>
      <div>Ingresos Brutos: ${escapeHtml(arcaConfig.ingresosBrutos || "-")}</div>
      <div>Condición frente al IVA: ${escapeHtml(condicionIvaEmisorLabel)}</div>
      <div>Fecha de Inicio de Actividades: ${escapeHtml(arcaConfig.fechaInicioActividades || "-")}</div>
    </div>
    <div class="tipo-cmp">${tipoLabel}<br/><span class="cod-tipo-cmp">COD. ${codigoTipoCmp}</span><br/>Pto. Vta ${venta.puntoVenta}<br/>Nº ${String(
    venta.numeroComprobante
  ).padStart(8, "0")}</div>
  </div>

  <div class="datos-cliente">
    <strong>Fecha:</strong> ${venta.fecha.toLocaleString("es-AR")}<br/>
    <strong>Cliente:</strong> ${escapeHtml(venta.cliente?.nombre ?? "Consumidor Final")}${
      venta.cliente?.cuit ? ` — CUIT/CUIL: ${escapeHtml(venta.cliente.cuit)}` : ""
    }<br/>
    <strong>Condición frente al IVA:</strong> ${escapeHtml(condicionIvaClienteLabel)}<br/>
    ${
      venta.cliente?.domicilioComercial
        ? `<strong>Domicilio Comercial:</strong> ${escapeHtml(venta.cliente.domicilioComercial)}<br/>`
        : ""
    }
    <strong>Condición de venta:</strong> ${condicionVenta}<br/>
    <strong>Forma de pago:</strong> ${escapeHtml(formaPagoLabel)} &nbsp;|&nbsp; <strong>Atendió:</strong> ${escapeHtml(venta.usuario.nombre)}
  </div>

  <table class="${discriminaIva ? "" : "sin-iva"}">
    <thead>
      ${encabezadoTabla}
    </thead>
    <tbody>
      ${filasItems}
    </tbody>
  </table>

  <div class="totales">
    ${
      descuento.greaterThan(0)
        ? `<div>Subtotal: ${formatearMoneda(subtotalBruto)}</div>
    <div>Descuento: -${formatearMoneda(descuento)}</div>`
        : ""
    }
    <div class="total">Total: ${formatearMoneda(venta.total)}</div>
  </div>

  <div class="page-footer">
    <div class="pie-iva">
      ${desgloseIva.length > 0
        ? `<div class="iva-desglose">
        <div class="iva-linea"><span>Importe Neto Gravado:</span><span>${formatearMoneda(
          desgloseIva.reduce((s, d) => s.add(d.baseImponible), new Prisma.Decimal(0))
        )}</span></div>
        ${desgloseIva
          .map(
            (d) =>
              `<div class="iva-linea"><span>IVA ${d.alicuota}%:</span><span>${formatearMoneda(d.montoIva)}</span></div>`
          )
          .join("")}
        <div class="iva-linea"><span>Importe Otros Tributos:</span><span>${formatearMoneda(0)}</span></div>
      </div>`
        : ""
      }
    </div>
    <div class="pie">
      <div>
        <strong>CAE:</strong> ${venta.cae ?? "-"}<br/>
        <strong>Vto. CAE:</strong> ${venta.caeVencimiento ? venta.caeVencimiento.toLocaleDateString("es-AR") : "-"}
      </div>
      ${qrDataUrl ? `<div style="text-align:right"><strong>QR ARCA</strong><br/><img class="qr-img" src="${qrDataUrl}" alt="QR ARCA" /></div>` : ""}
    </div>
  </div>
  </div>`).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Comprobante venta #${venta.id}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 15mm;
  }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: 11pt;
    color: #222;
    margin: 0;
    padding: 0;
    width: 100%;
  }
  .aviso-mock {
    background: #fff3cd;
    border: 1px solid #ffdd57;
    padding: 8px 12px;
    margin-bottom: 14px;
    font-size: 10pt;
  }
  .page {
    page-break-after: always;
  }
  .page:last-child {
    page-break-after: auto;
  }
  .page-footer {
    margin-top: 30px;
  }
  .etiqueta-copia {
    font-size: 9pt;
    font-weight: bold;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .header {
    display: table;
    width: 100%;
    border-bottom: 2px solid #222;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .header .datos-empresa,
  .header .tipo-cmp {
    display: table-cell;
    vertical-align: top;
  }
  .header h1 { font-size: 16pt; margin: 0 0 3px; }
  .header .datos-empresa { font-size: 9pt; line-height: 1.4; }
  .tipo-cmp {
    border: 1.5px solid #222;
    padding: 6px 12px;
    font-weight: bold;
    font-size: 13pt;
    text-align: center;
    line-height: 1.4;
    white-space: nowrap;
    width: 45mm;
  }
  .tipo-cmp .cod-tipo-cmp {
    font-size: 8.5pt;
    font-weight: bold;
  }
  .datos-cliente {
    font-size: 10pt;
    line-height: 1.6;
    margin-bottom: 14px;
  }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin-top: 10px;
    font-size: 8.5pt;
  }
  th {
    background: #f0f0f0;
    padding: 5px 4px;
    border: 1px solid #ccc;
    text-align: left;
    font-size: 8pt;
    overflow-wrap: break-word;
  }
  td {
    padding: 4px 4px;
    border-bottom: 1px solid #ddd;
    text-align: left;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  th:nth-child(1), td:nth-child(1) { width: 9%; }
  th:nth-child(2), td:nth-child(2) { width: 21%; }
  th:nth-child(3), td:nth-child(3) { width: 9%; }
  th:nth-child(4), td:nth-child(4) { width: 11%; }
  th:nth-child(5), td:nth-child(5) { width: 8%; }
  th:nth-child(6), td:nth-child(6) { width: 7%; }
  th:nth-child(7), td:nth-child(7) { width: 12%; }
  th:nth-child(8), td:nth-child(8) { width: 9%; }
  th:nth-child(9), td:nth-child(9) { width: 14%; }
  /* Tabla sin discriminar IVA (Factura C): 7 columnas repartidas al 100% */
  table.sin-iva th:nth-child(1), table.sin-iva td:nth-child(1) { width: 10%; }
  table.sin-iva th:nth-child(2), table.sin-iva td:nth-child(2) { width: 28%; }
  table.sin-iva th:nth-child(3), table.sin-iva td:nth-child(3) { width: 12%; }
  table.sin-iva th:nth-child(4), table.sin-iva td:nth-child(4) { width: 14%; }
  table.sin-iva th:nth-child(5), table.sin-iva td:nth-child(5) { width: 10%; }
  table.sin-iva th:nth-child(6), table.sin-iva td:nth-child(6) { width: 8%; }
  table.sin-iva th:nth-child(7), table.sin-iva td:nth-child(7) { width: 18%; }
  .num { text-align: right; }
  .iva-desglose {
    font-size: 9pt;
    margin-bottom: 10px;
  }
  .iva-linea {
    text-align: right;
    line-height: 1.6;
  }
  .iva-linea span:first-child {
    display: inline-block;
    text-align: right;
    min-width: 180px;
  }
  .iva-linea span:last-child {
    display: inline-block;
    min-width: 100px;
    text-align: right;
  }
  .totales { margin-top: 12px; text-align: right; font-size: 10.5pt; }
  .totales .descuento { color: #555; }
  .totales .total {
    font-size: 14pt;
    font-weight: bold;
    border-top: 1.5px solid #222;
    padding-top: 6px;
    margin-top: 4px;
  }
  .pie {
    font-size: 8.5pt;
    color: #555;
    display: table;
    width: 100%;
    border-top: 1px solid #ccc;
    padding-top: 8px;
  }
  .pie > div {
    display: table-cell;
    vertical-align: top;
  }
  .pie .qr-img { width: 80px; height: 80px; }
  .no-print { display: block; }
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body onload="window.print()">
  ${
    esMock
      ? `<div class="aviso-mock no-print">Comprobante generado en modo de prueba (ARCA_MODO=mock). El CAE es simulado y <strong>no tiene validez fiscal</strong>.</div>`
      : ""
  }

  ${repeticiones}

  <div class="no-print" style="margin-top: 16px; text-align: center;">
    <button onclick="window.print()" style="padding: 8px 24px; font-size: 11pt; cursor: pointer;">Imprimir</button>
  </div>
</body>
</html>`;
}
