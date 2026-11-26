import type { FacturaExtraida, ItemFactura } from "./types";
import { normalizarItemCrudo, parsearImporte } from "./parser";

// Extractor opcional con IA. Se activa solo si el administrador configura una
// API compatible con OpenAI en el .env. Sin configuración, el sistema funciona
// 100% local y este módulo no se usa.

interface ConfiguracionIa {
  url: string;
  apiKey: string;
  modelo: string;
  timeoutMs: number;
}

function leerConfiguracion(): ConfiguracionIa | null {
  const habilitada = (process.env.FACTURA_IA_ENABLED ?? "").toLowerCase();
  if (!["1", "true", "si", "sí"].includes(habilitada)) return null;

  const apiKey = process.env.FACTURA_IA_API_KEY?.trim();
  const modelo = process.env.FACTURA_IA_MODEL?.trim();
  if (!apiKey || !modelo) return null;

  return {
    url: process.env.FACTURA_IA_URL?.trim() || "https://api.openai.com/v1/chat/completions",
    apiKey,
    modelo,
    timeoutMs: Number(process.env.FACTURA_IA_TIMEOUT_MS ?? 45000) || 45000,
  };
}

export function iaConfigurada(): boolean {
  return leerConfiguracion() !== null;
}

function aNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") return parsearImporte(valor);
  return null;
}

function aTexto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio ? limpio : null;
}

function normalizarFecha(valor: unknown): string | null {
  const texto = aTexto(valor);
  if (!texto) return null;
  let coincidencia = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (coincidencia) return `${coincidencia[1]}-${coincidencia[2]}-${coincidencia[3]}`;
  coincidencia = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!coincidencia) return null;
  const anio = Number(coincidencia[3]);
  const anioCompleto = anio < 100 ? (anio >= 70 ? 1900 + anio : 2000 + anio) : anio;
  return `${anioCompleto}-${coincidencia[2].padStart(2, "0")}-${coincidencia[1].padStart(2, "0")}`;
}

function normalizarTipo(valor: unknown): string | null {
  const texto = aTexto(valor);
  if (!texto) return null;
  const norm = texto.toUpperCase().replace(/[^A-Z_]/g, "");
  if (/^[ABCEM]$/.test(norm)) return norm;
  const nota = norm.match(/^N([CD])_?([ABCEM])$/);
  if (nota) return `N${nota[1]}_${nota[2]}`;
  if (/NOTA.*CREDITO/.test(texto.toUpperCase())) return "NC";
  if (/NOTA.*DEBITO/.test(texto.toUpperCase())) return "ND";
  if (/FACTURA/.test(texto.toUpperCase())) return "FACTURA";
  return null;
}

function extraerJson(contenido: string): unknown {
  const sinCercas = contenido.replace(/```(?:json)?/gi, "").trim();
  const inicio = sinCercas.indexOf("{");
  const fin = sinCercas.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) throw new Error("La IA no devolvió un objeto JSON");
  return JSON.parse(sinCercas.slice(inicio, fin + 1));
}

function armarPrompt(textoFactura: string): string {
  return `Sos un asistente que extrae datos de facturas de compra de proveedores argentinos.

Devolvé únicamente un objeto JSON con esta forma exacta:
{
  "proveedorCuit": "30-71234567-8" | null,
  "proveedorNombre": "RAZON SOCIAL" | null,
  "tipoComprobante": "A" | "B" | "C" | "M" | "NC_A" | "ND_A" | null,
  "puntoVenta": 3 | null,
  "numeroComprobante": "00000127" | null,
  "fechaComprobante": "2026-11-20" | null,
  "subtotal": 60012.00 | null,
  "iva": 12602.52 | null,
  "percepciones": 0 | null,
  "total": 72614.52 | null,
  "cae": "71234567890123" | null,
  "items": [
    {
      "codigoProveedor": "779001" | null,
      "descripcion": "Yerba Mate Tradicional 1 kg",
      "cantidad": 12,
      "precioUnitario": 1500.00,
      "subtotal": 18000.00,
      "alicuotaIva": 21 | null
    }
  ]
}

Reglas:
- Importes en pesos, con punto decimal y sin separador de miles (1500.5, no "1.500,50").
- "cantidad" es la cantidad comprada; puede ser decimal.
- "precioUnitario" es el precio neto de una unidad (si hay bonificación, usá el neto).
- "alicuotaIva" es 21, 10.5, 27, 5, 2.5 o 0; null si no se distingue.
- Si un dato no aparece en la factura, usá null. No inventes ítems ni valores.
- El CUIT del proveedor es el del emisor de la factura, no el del cliente.
- No devuelvas explicaciones ni texto fuera del JSON.

TEXTO DE LA FACTURA:
${textoFactura}`;
}

function itemsDesdeIa(crudos: unknown[]): ItemFactura[] {
  const items: ItemFactura[] = [];
  for (const crudo of crudos) {
    if (typeof crudo !== "object" || crudo === null) continue;
    const fila = crudo as Record<string, unknown>;
    const descripcion = aTexto(fila.descripcion);
    if (!descripcion) continue;
    const item = normalizarItemCrudo({
      codigo: aTexto(fila.codigoProveedor),
      descripcion,
      cantidad: aNumero(fila.cantidad),
      precioUnitario: aNumero(fila.precioUnitario),
      subtotal: aNumero(fila.subtotal),
      alicuota: aNumero(fila.alicuotaIva),
    });
    if (!item) continue;
    items.push({ linea: items.length + 1, ...item });
  }
  return items;
}

export async function extraerConIa(textoFactura: string): Promise<FacturaExtraida | null> {
  const configuracion = leerConfiguracion();
  if (!configuracion) return null;

  const texto = textoFactura.slice(0, 24000);
  const respuesta = await fetch(configuracion.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${configuracion.apiKey}`,
    },
    body: JSON.stringify({
      model: configuracion.modelo,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Extraés datos de facturas y respondés solo con JSON válido.",
        },
        { role: "user", content: armarPrompt(texto) },
      ],
    }),
    signal: AbortSignal.timeout(configuracion.timeoutMs),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`El proveedor de IA respondió ${respuesta.status}${detalle ? `: ${detalle.slice(0, 200)}` : ""}`);
  }

  const cuerpo = (await respuesta.json()) as {
    choices?: Array<{ message?: { content?: string | null }; text?: string | null }>;
  };
  const contenido = cuerpo.choices?.[0]?.message?.content ?? cuerpo.choices?.[0]?.text ?? null;
  if (!contenido) throw new Error("El proveedor de IA devolvió una respuesta vacía");

  const datos = extraerJson(contenido) as Record<string, unknown>;
  const items = itemsDesdeIa(Array.isArray(datos.items) ? datos.items : []);

  return {
    encabezado: {
      proveedorCuit: aTexto(datos.proveedorCuit),
      proveedorNombre: aTexto(datos.proveedorNombre),
      tipoComprobante: normalizarTipo(datos.tipoComprobante),
      puntoVenta: aNumero(datos.puntoVenta) === null ? null : Math.trunc(aNumero(datos.puntoVenta)!),
      numeroComprobante: aTexto(datos.numeroComprobante),
      fechaComprobante: normalizarFecha(datos.fechaComprobante),
      subtotal: aNumero(datos.subtotal),
      iva: aNumero(datos.iva),
      percepciones: aNumero(datos.percepciones),
      total: aNumero(datos.total),
      cae: aTexto(datos.cae),
    },
    items,
    advertencias: [],
    confianza: items.length > 0 ? 70 : 35,
    texto,
  };
}

/**
 * Combina la extracción local con la de IA: los datos locales tienen prioridad
 * y la IA solo completa huecos o aporta ítems cuando el parser local no pudo.
 */
export function combinarExtracciones(local: FacturaExtraida, ia: FacturaExtraida): FacturaExtraida {
  const encabezado = { ...ia.encabezado };
  for (const clave of Object.keys(local.encabezado) as Array<keyof typeof encabezado>) {
    if (local.encabezado[clave] !== null && local.encabezado[clave] !== undefined) {
      // TypeScript no puede inferir la asignación heterogénea; el valor viene
      // del mismo tipo de encabezado, así que el cast es seguro.
      (encabezado as Record<string, unknown>)[clave] = local.encabezado[clave];
    }
  }

  const items = local.items.length > 0 ? local.items : ia.items;
  const confianza = Math.max(local.confianza, items.length > 0 ? ia.confianza : 0);

  return {
    encabezado,
    items,
    advertencias: [...local.advertencias],
    confianza,
    texto: local.texto,
  };
}
