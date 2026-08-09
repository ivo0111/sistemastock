import { Prisma } from "@prisma/client";
import { arcaConfig } from "../../config/arca.config";
import { ResultadoCAE } from "../arca/arca.types";

type VentaConDetalle = Prisma.VentaGetPayload<{
  include: { items: { include: { producto: true } }; cliente: true; usuario: true };
}>;

const TIPO_COMPROBANTE_LABEL: Record<string, string> = {
  FACTURA_A: "FACTURA A",
  FACTURA_B: "FACTURA B",
  FACTURA_C: "FACTURA C",
};

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

interface DetalleIva {
  alicuota: number;
  baseImponible: number;
  montoIva: number;
}

function calcularDesgloseIva(
  items: VentaConDetalle["items"]
): DetalleIva[] {
  const map = new Map<number, { baseImponible: number; montoIva: number }>();

  for (const item of items) {
    const alicuota = Number(item.producto.alicuotaIva ?? 21);
    const subtotal = Number(item.subtotal);
    const divisor = 1 + alicuota / 100;
    const baseImponible = subtotal / divisor;
    const montoIva = baseImponible * (alicuota / 100);

    const existing = map.get(alicuota) ?? { baseImponible: 0, montoIva: 0 };
    existing.baseImponible += baseImponible;
    existing.montoIva += montoIva;
    map.set(alicuota, existing);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([alicuota, vals]) => ({
      alicuota,
      baseImponible: vals.baseImponible,
      montoIva: vals.montoIva,
    }));
}

/** Arma la URL del QR fiscal que exige ARCA (ver "Especificación Técnica QR"). */
function armarUrlQrArca(venta: VentaConDetalle) {
  const payload = {
    ver: 1,
    fecha: venta.fecha.toISOString().slice(0, 10),
    cuit: Number(arcaConfig.cuitEmisor || 0),
    ptoVta: venta.puntoVenta,
    tipoCmp: venta.tipoComprobante,
    nroCmp: venta.numeroComprobante,
    importe: Number(venta.total),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: venta.cliente?.cuit ? 80 : 99,
    nroDocRec: venta.cliente?.cuit ? Number(venta.cliente.cuit) : 0,
    codAutorizacion: venta.cae,
  };
  const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}

export function generarHtmlComprobante(venta: VentaConDetalle, resultadoCAE?: ResultadoCAE, copias = 1) {
  const esMock = arcaConfig.modo === "mock";
  const tipoLabel = TIPO_COMPROBANTE_LABEL[venta.tipoComprobante ?? "FACTURA_B"];
  const urlQr = venta.cae ? armarUrlQrArca(venta) : null;

  const desgloseIva = calcularDesgloseIva(venta.items);

  const filasItems = venta.items
    .map(
      (item) => {
        const alicuota = Number(item.producto.alicuotaIva ?? 21);
        const bonif = 0;
        const divisor = 1 + alicuota / 100;
        const precioSinIva = Number(item.precioUnitario) / divisor;
        const sub = precioSinIva * Number(item.cantidad) * (1 - bonif / 100);
        const subConIva = sub * divisor;
        return `
      <tr>
        <td>${escapeHtml(item.producto.nombre)}</td>
        <td>${escapeHtml(item.producto.unidadMedida)}</td>
        <td class="num">${formatearMoneda(precioSinIva)}</td>
        <td class="num">${bonif.toFixed(2)}</td>
        <td class="num">${item.cantidad}</td>
        <td class="num">${formatearMoneda(sub)}</td>
        <td class="num">${alicuota}%</td>
        <td class="num">${formatearMoneda(subConIva)}</td>
      </tr>`;
      }
    )
    .join("");

  const repeticiones = Array.from({ length: copias }, () => `
  <div class="page">
  <div class="header">
    <div class="datos-empresa">
      <h1>${escapeHtml(arcaConfig.razonSocial)}</h1>
      <div>CUIT: ${escapeHtml(arcaConfig.cuitEmisor || "sin configurar")}</div>
    </div>
    <div class="tipo-cmp">${tipoLabel}<br/>Pto. Vta ${venta.puntoVenta}<br/>Nº ${String(
    venta.numeroComprobante
  ).padStart(8, "0")}</div>
  </div>

  <div class="datos-cliente">
    <strong>Fecha:</strong> ${venta.fecha.toLocaleString("es-AR")}<br/>
    <strong>Cliente:</strong> ${escapeHtml(venta.cliente?.nombre ?? "Consumidor Final")}${
      venta.cliente?.cuit ? ` — CUIT/CUIL: ${escapeHtml(venta.cliente.cuit)}` : ""
    }<br/>
    <strong>Forma de pago:</strong> ${venta.formaPago} &nbsp;|&nbsp; <strong>Atendió:</strong> ${escapeHtml(venta.usuario.nombre)}
  </div>

  <table>
    <thead>
      <tr><th>Producto</th><th>U. medida</th><th class="num">P. Unit.</th><th class="num">% Bonif.</th><th class="num">Cant.</th><th class="num">Subtotal</th><th class="num">Alíc. IVA</th><th class="num">Subtotal c/IVA</th></tr>
    </thead>
    <tbody>
      ${filasItems}
    </tbody>
  </table>

  <div class="totales">
    ${
      Number(venta.descuento) > 0
        ? `<div>Descuento: -${formatearMoneda(venta.descuento)}</div>`
        : ""
    }
    <div class="total">Total: ${formatearMoneda(venta.total)}</div>
  </div>

  <div class="page-footer">
    <div class="pie-iva">
      ${desgloseIva.length > 0
        ? `<div class="iva-desglose">
        <div class="iva-linea"><span>Importe Neto Gravado:</span><span>${formatearMoneda(desgloseIva.reduce((s, d) => s + d.baseImponible, 0))}</span></div>
        ${desgloseIva
          .map((d) => `<div class="iva-linea"><span>IVA ${d.alicuota}%:</span><span>${formatearMoneda(d.montoIva)}</span></div>`)
          .join("")}
      </div>`
        : ""
      }
    </div>
    <div class="pie">
      <div>
        <strong>CAE:</strong> ${venta.cae ?? "-"}<br/>
        <strong>Vto. CAE:</strong> ${venta.caeVencimiento ? venta.caeVencimiento.toLocaleDateString("es-AR") : "-"}
      </div>
      ${urlQr ? `<div style="text-align:right"><strong>QR ARCA</strong><br/><img class="qr-img" src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(urlQr)}" alt="QR ARCA" /></div>` : ""}
    </div>
  </div>
  </div>`).join("")

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
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  .page:last-child {
    page-break-after: auto;
  }
  .page-footer {
    margin-top: auto;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #222;
    padding-bottom: 10px;
    margin-bottom: 14px;
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
  }
  .datos-cliente {
    font-size: 10pt;
    line-height: 1.6;
    margin-bottom: 14px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    font-size: 10pt;
  }
  th {
    background: #f0f0f0;
    padding: 6px 8px;
    border: 1px solid #ccc;
    text-align: left;
    font-size: 9.5pt;
  }
  td {
    padding: 5px 8px;
    border-bottom: 1px solid #ddd;
    text-align: left;
  }
  .num { text-align: right; }
  .iva-desglose {
    font-size: 9pt;
    margin-bottom: 10px;
  }
  .iva-linea {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    line-height: 1.6;
  }
  .iva-linea span:first-child {
    text-align: right;
    min-width: 180px;
  }
  .iva-linea span:last-child {
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
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-top: 1px solid #ccc;
    padding-top: 8px;
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