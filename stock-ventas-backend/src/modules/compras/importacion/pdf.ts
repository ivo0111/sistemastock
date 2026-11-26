import type { FragmentoTexto, LineaTexto, PaginaTexto } from "./types";

// pdfjs-dist se usa desde su build "legacy" (CommonJS) para no obligar a
// cambiar el módulo del proyecto ni a cargar un navegador headless. Solo se
// necesita la extracción de texto: no se renderiza nada, así que la falta de
// `canvas` no afecta.
interface PdfTextItem {
  str: string;
  transform: number[];
  width?: number;
}

interface PdfPage {
  getViewport(params: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
}

interface PdfDocument {
  numPages: number;
  getPage(numero: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}

interface PdfjsModule {
  getDocument(params: {
    data: Uint8Array;
    verbosity?: number;
    useSystemFonts?: boolean;
    isEvalSupported?: boolean;
  }): { promise: Promise<PdfDocument> };
}

let pdfjs: PdfjsModule | null = null;

function cargarPdfjs(): PdfjsModule {
  if (pdfjs) return pdfjs;

  // Al importarse, pdfjs intenta polyfillar DOMMatrix/Path2D con `canvas` y
  // escribe un warning por consola. No aplica a extracción de texto y solo
  // ensucia los logs del servicio, así que se filtra únicamente ese mensaje.
  const logOriginal = console.log;
  console.log = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("Warning: Cannot polyfill")) return;
    logOriginal(...args);
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfjs = require("pdfjs-dist/legacy/build/pdf.js") as PdfjsModule;
  } finally {
    console.log = logOriginal;
  }
  return pdfjs;
}

function esTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as PdfTextItem).str === "string" &&
    Array.isArray((item as PdfTextItem).transform)
  );
}

function unirFragmentos(fragmentos: FragmentoTexto[]): string {
  let texto = "";
  let finAnterior: number | null = null;
  for (const fragmento of fragmentos) {
    const pieza = fragmento.texto.trim();
    if (!pieza) continue;
    if (texto && finAnterior !== null && fragmento.x - finAnterior > 1.2) texto += " ";
    texto += pieza;
    finAnterior = fragmento.x + fragmento.ancho;
  }
  return texto.replace(/\s+/g, " ").trim();
}

/** Agrupa los fragmentos de una página en renglones, conservando la X. */
export function agruparLineas(items: unknown[]): LineaTexto[] {
  const fragmentos: Array<FragmentoTexto & { y: number }> = [];

  for (const item of items) {
    if (!esTextItem(item)) continue;
    const texto = item.str.replace(/\s+/g, " ").trim();
    if (!texto) continue;
    fragmentos.push({
      x: item.transform[4],
      y: item.transform[5],
      ancho: item.width ?? texto.length * 4,
      texto,
    });
  }

  fragmentos.sort((a, b) => b.y - a.y || a.x - b.x);

  const grupos: Array<{ y: number; fragmentos: FragmentoTexto[] }> = [];
  for (const fragmento of fragmentos) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && Math.abs(ultimo.y - fragmento.y) <= 2.5) {
      ultimo.fragmentos.push(fragmento);
    } else {
      grupos.push({ y: fragmento.y, fragmentos: [fragmento] });
    }
  }

  return grupos.map((grupo) => {
    const ordenados = grupo.fragmentos
      .slice()
      .sort((a, b) => a.x - b.x)
      .map(({ x, ancho, texto }) => ({ x, ancho, texto }));
    return {
      y: grupo.y,
      x: ordenados[0]?.x ?? 0,
      texto: unirFragmentos(ordenados),
      fragmentos: ordenados,
    };
  });
}

export async function extraerLineasPdf(buffer: Buffer): Promise<PaginaTexto[]> {
  const lib = cargarPdfjs();
  const documento = await lib.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  try {
    const paginas: PaginaTexto[] = [];
    for (let numero = 1; numero <= documento.numPages; numero++) {
      const pagina = await documento.getPage(numero);
      const viewport = pagina.getViewport({ scale: 1 });
      const contenido = await pagina.getTextContent();
      paginas.push({
        ancho: viewport.width,
        alto: viewport.height,
        lineas: agruparLineas(contenido.items),
      });
    }
    return paginas;
  } finally {
    await documento.destroy();
  }
}
