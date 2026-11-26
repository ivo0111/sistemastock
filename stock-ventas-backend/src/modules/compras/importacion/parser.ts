import type {
  AdvertenciaFactura,
  EncabezadoFactura,
  FacturaExtraida,
  ItemFactura,
  LineaTexto,
  PaginaTexto,
} from "./types";

// ─────────────────────────────────────────────
// Utilidades de texto y números
// ─────────────────────────────────────────────

const ALICUOTAS_VALIDAS = [21, 10.5, 27, 5, 2.5, 0];

const MESES: Record<string, number> = {
  ENE: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SEP: 9,
  SET: 9,
  OCT: 10,
  NOV: 11,
  DIC: 12,
};

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Convierte "1.234,56", "$ 1.234,56" o "1234.56" a número. */
export function parsearImporte(texto: string): number | null {
  const limpio = texto.replace(/[^\d.,-]/g, "").trim();
  if (!limpio || limpio === "-" || limpio === "." || limpio === ",") return null;

  let valor = limpio;
  const tieneComa = valor.includes(",");
  const tienePunto = valor.includes(".");

  if (tieneComa && tienePunto) {
    if (valor.lastIndexOf(",") > valor.lastIndexOf(".")) {
      valor = valor.replace(/\./g, "").replace(",", ".");
    } else {
      valor = valor.replace(/,/g, "");
    }
  } else if (tieneComa) {
    valor = valor.replace(/\./g, "").replace(",", ".");
  } else if (tienePunto) {
    const partes = valor.split(".");
    const ultima = partes[partes.length - 1];
    // "1.500" / "1.500.000" son miles; "1500.50" es decimal.
    if (partes.length > 2 || (ultima.length === 3 && partes[0].length <= 3)) {
      valor = valor.replace(/\./g, "");
    }
  }

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function redondear(numero: number, decimales = 2): number {
  const factor = 10 ** decimales;
  return Math.round((numero + Number.EPSILON) * factor) / factor;
}

export function normalizarCuit(cuit: string): string | null {
  const digitos = cuit.replace(/\D/g, "");
  if (digitos.length !== 11) return null;
  return `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`;
}

function importesDeLinea(linea: LineaTexto): number[] {
  const encontrados = linea.texto.match(/-?\d[\d.,]*/g) ?? [];
  const valores: number[] = [];
  for (const encontrado of encontrados) {
    const valor = parsearImporte(encontrado);
    if (valor !== null) valores.push(valor);
  }
  return valores;
}

function limpiarDescripcion(texto: string): string {
  return texto
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|.]+/, "")
    .replace(/[\s\-–—:|.]+$/, "")
    .trim();
}

function normalizarAlicuota(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  const porcentaje = valor > 0 && valor <= 1 ? valor * 100 : valor;
  for (const valida of ALICUOTAS_VALIDAS) {
    if (Math.abs(porcentaje - valida) < 0.01) return valida;
  }
  return null;
}

function isoFecha(dia: number, mes: number, anio: number): string | null {
  const anioCompleto = anio < 100 ? (anio >= 70 ? 1900 + anio : 2000 + anio) : anio;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const fecha = new Date(Date.UTC(anioCompleto, mes - 1, dia, 12, 0, 0));
  if (fecha.getUTCDate() !== dia || fecha.getUTCMonth() !== mes - 1) return null;
  return fecha.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────
// Encabezado
// ─────────────────────────────────────────────

function extraerCuit(lineas: LineaTexto[], altoPagina: number, cuitPropio?: string): string | null {
  const propio = cuitPropio ? normalizarCuit(cuitPropio) : null;
  let mejor: { cuit: string; puntaje: number } | null = null;

  for (const linea of lineas) {
    const norm = normalizarTexto(linea.texto);
    for (const coincidencia of linea.texto.matchAll(/\b\d{2}[-\s.]?\d{8}[-\s.]?\d\b/g)) {
      const cuit = normalizarCuit(coincidencia[0]);
      if (!cuit) continue;

      let puntaje = 0;
      if (cuit === propio) puntaje -= 30;
      if (/CUIT|C\.U\.I\.T/.test(norm)) puntaje += 3;
      if (/RAZON SOCIAL|EMISOR|PROVEEDOR/.test(norm)) puntaje += 4;
      if (/CLIENTE|SENOR|SENORES|RECEPTOR|DESTINATARIO|DOMICILIO/.test(norm)) puntaje -= 8;
      if (altoPagina > 0 && linea.y > altoPagina * 0.62) puntaje += 2;

      if (!mejor || puntaje > mejor.puntaje) mejor = { cuit, puntaje };
    }
  }

  return mejor?.cuit ?? null;
}

function extraerNombreProveedor(lineas: LineaTexto[], cuit: string | null): string | null {
  const cuitDigitos = cuit?.replace(/\D/g, "");

  for (const linea of lineas) {
    const coincidencia = linea.texto.match(/RAZ[OÓ]N\s+SOCIAL\s*:?\s*(.+)$/i);
    if (!coincidencia) continue;
    const nombre = limpiarNombreProveedor(coincidencia[1]);
    if (nombre) return nombre;
  }

  // Si el CUIT apareció en una línea concreta, la razón social suele estar en
  // la línea inmediatamente superior (o en la misma, antes del CUIT).
  if (cuitDigitos) {
    const indice = lineas.findIndex((linea) => linea.texto.replace(/\D/g, "").includes(cuitDigitos));
    if (indice >= 0) {
      const misma = limpiarNombreProveedor(lineas[indice].texto);
      if (misma && !/^CUIT/i.test(misma)) return misma;
      for (let salto = 1; salto <= 3; salto++) {
        const anterior = lineas[indice - salto];
        if (!anterior) break;
        const nombre = limpiarNombreProveedor(anterior.texto);
        if (nombre && !/^(CUIT|IVA|FACTURA|NOTA|FECHA|DOMICILIO)/i.test(nombre)) return nombre;
      }
    }
  }

  // Último recurso: primera línea con letras y sin datos fiscales.
  for (const linea of lineas.slice(0, 8)) {
    const nombre = limpiarNombreProveedor(linea.texto);
    if (nombre && nombre.length >= 3 && !/^(CUIT|IVA|FACTURA|NOTA|FECHA|DOMICILIO|ORIGINAL|DUPLICADO)/i.test(nombre)) {
      return nombre;
    }
  }

  return null;
}

function limpiarNombreProveedor(texto: string): string | null {
  let nombre = texto
    .replace(/\bCUIT\b.*$/i, "")
    .replace(/\bC\.U\.I\.T\.?\b.*$/i, "")
    .replace(/\bIVA\b.*$/i, "")
    // "Razón Social: ACME S.A. N° 00003-00000127": el número de comprobante
    // suele dibujarse en la misma línea y no es parte del nombre.
    .replace(/\b(?:N[°º]|NRO\.?|NUMERO)\s*:?\s*\d{1,6}\s*[-–]\s*\d{1,8}\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:,-]+|[\s:,-]+$/g, "")
    // Algunos PDFs ponen la letra del comprobante al final de la línea del
    // emisor ("ACME S.A. A").
    .replace(/\s+[ABCEM]$/i, "")
    .trim();
  if (!nombre || nombre.length < 3) return null;
  if (/^\d[\d\s./-]*$/.test(nombre)) return null;
  if (nombre.length > 120) nombre = nombre.slice(0, 120).trim();
  return nombre;
}

function letraComprobante(lineas: LineaTexto[], textoNormalizado: string): string | null {
  const patrones = [
    /FACTURA\s+([ABCEM])\b/,
    /NOTA\s+DE\s+(?:CREDITO|DEBITO)\s+([ABCEM])\b/,
  ];
  for (const patron of patrones) {
    const coincidencia = textoNormalizado.match(patron);
    if (coincidencia) return coincidencia[1];
  }

  // Muchos PDFs dibujan la letra en un recuadro separado: buscar una línea que
  // sea solo "A"/"B"/"C" cerca de la palabra FACTURA.
  for (let i = 0; i < lineas.length; i++) {
    if (!/FACTURA|NOTA\s+DE/.test(normalizarTexto(lineas[i].texto))) continue;
    for (let salto = -2; salto <= 2; salto++) {
      const vecina = lineas[i + salto];
      if (!vecina) continue;
      const soloLetra = normalizarTexto(vecina.texto);
      if (/^[ABCEM]$/.test(soloLetra)) return soloLetra;
      // La letra también suele quedar al final de la línea del emisor.
      const alFinal = soloLetra.match(/\s([ABCEM])$/);
      if (alFinal) return alFinal[1];
    }
  }

  return null;
}

function extraerTipoComprobante(lineas: LineaTexto[], textoNormalizado: string): string | null {
  const letra = letraComprobante(lineas, textoNormalizado);
  if (/NOTA\s+DE\s+CREDITO/.test(textoNormalizado)) return letra ? `NC_${letra}` : "NC";
  if (/NOTA\s+DE\s+DEBITO/.test(textoNormalizado)) return letra ? `ND_${letra}` : "ND";
  if (/FACTURA/.test(textoNormalizado)) return letra ?? "FACTURA";
  return null;
}

function extraerPuntoVentaYNumero(lineas: LineaTexto[]): {
  puntoVenta: number | null;
  numeroComprobante: string | null;
} {
  const texto = lineas.map((linea) => linea.texto).join("\n");

  let coincidencia = texto.match(
    /PUNTO\s*(?:DE\s*)?VENTA\s*:?\s*(\d{1,5})[\s\S]{0,80}?(?:COMP\.?\s*NRO\.?|NRO\.?\s*COMP\.?|NUMERO|N[°º])\s*:?\s*(\d{1,8})/i
  );
  if (coincidencia) {
    return {
      puntoVenta: Number(coincidencia[1]),
      numeroComprobante: coincidencia[2].padStart(8, "0"),
    };
  }

  coincidencia = texto.match(/\b(\d{4,5})\s*[-–]\s*(\d{6,8})\b/);
  if (coincidencia) {
    return {
      puntoVenta: Number(coincidencia[1]),
      numeroComprobante: coincidencia[2].padStart(8, "0"),
    };
  }

  coincidencia = texto.match(
    /(?:COMP\.?\s*NRO\.?|NRO\.?\s*COMP\.?|NUMERO|N[°º])\s*:?\s*(\d{4,8})/i
  );
  if (coincidencia) {
    return {
      puntoVenta: null,
      numeroComprobante: coincidencia[1].padStart(8, "0"),
    };
  }

  return { puntoVenta: null, numeroComprobante: null };
}

function extraerFecha(lineas: LineaTexto[]): string | null {
  for (const linea of lineas) {
    const norm = normalizarTexto(linea.texto);
    if (!/FECHA/.test(norm) || /VENCIMIENTO|VTO/.test(norm)) continue;

    let coincidencia = linea.texto.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (coincidencia) return isoFecha(Number(coincidencia[3]), Number(coincidencia[2]), Number(coincidencia[1]));

    coincidencia = linea.texto.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (coincidencia) {
      return isoFecha(Number(coincidencia[1]), Number(coincidencia[2]), Number(coincidencia[3]));
    }

    coincidencia = linea.texto.match(/(\d{1,2})\s*(?:DE\s*)?([A-Za-z]{3,})\.?\s*(?:DE\s*)?(\d{2,4})/);
    if (coincidencia) {
      const mes = MESES[normalizarTexto(coincidencia[2]).slice(0, 3)];
      if (mes) return isoFecha(Number(coincidencia[1]), mes, Number(coincidencia[3]));
    }
  }
  return null;
}

function extraerCae(texto: string): string | null {
  const coincidencia = texto.match(
    /(?:CAE|C\.?A\.?E\.?|COD(?:IGO)?\s*(?:DE\s*)?AUT(?:ORIZACION)?)\s*(?:N[°º]?)?\s*[:.]?\s*(\d{11,14})/i
  );
  return coincidencia ? coincidencia[1] : null;
}

function esCabeceraTablaItems(norm: string): boolean {
  // "Código Descripción Cant. P. Unitario % Bonif. Subtotal" también contiene
  // la palabra SUBTOTAL: si se toma como etiqueta, el primer ítem de la tabla
  // se confunde con el subtotal de la factura.
  return (
    /(CODIGO|DESCRIP|DETALLE|CONCEPTO|PRODUCTO)/.test(norm) &&
    /(CANT|UNITARIO|P\.?\s*UNIT|BONIF|SUBTOTAL|IMPORTE)/.test(norm)
  );
}

function buscarImporte(
  lineas: LineaTexto[],
  etiqueta: (normalizado: string) => boolean,
  opciones: { desdeFin?: boolean } = {}
): number | null {
  const indices = lineas.map((_, indice) => indice);
  if (opciones.desdeFin) indices.reverse();

  for (const indice of indices) {
    const linea = lineas[indice];
    const norm = normalizarTexto(linea.texto);
    if (!etiqueta(norm) || esCabeceraTablaItems(norm)) continue;

    const importes = importesDeLinea(linea);
    if (importes.length > 0) return importes[importes.length - 1];

    // Algunos layouts ponen la etiqueta y el importe en dos líneas seguidas.
    for (let salto = 1; salto <= 2; salto++) {
      const siguiente = lineas[indice + salto];
      if (!siguiente || Math.abs(siguiente.y - linea.y) > 14) break;
      if (esCabeceraTablaItems(normalizarTexto(siguiente.texto))) break;
      const valores = importesDeLinea(siguiente);
      if (valores.length > 0) return valores[valores.length - 1];
    }
  }

  return null;
}

function etiquetaSubtotal(norm: string): boolean {
  return /SUBTOTAL|SUB\s*TOTAL|NETO\s*GRAVADO|IMPORTE\s*NETO/.test(norm) && !/TOTAL\s*IVA/.test(norm);
}

function etiquetaTotal(norm: string): boolean {
  if (/SUBTOTAL/.test(norm)) return false;
  if (/TOTAL\s*(?:IVA|PERCEPCION|PERCEPCIONES|BONIF|DESCUENTO|ITEMS|ARTICULOS|UNIDADES)/.test(norm)) return false;
  return /IMPORTE\s*TOTAL|TOTAL\s*(?:A\s*PAGAR|FINAL|DEL\s*COMPROBANTE)|(?:^|\s)TOTAL(?:\s|:|$)/.test(norm);
}

function extraerIva(lineas: LineaTexto[]): number | null {
  const conImporte: Array<{ norm: string; importe: number }> = [];
  for (const linea of lineas) {
    const norm = normalizarTexto(linea.texto);
    // \b evita falsos positivos como "Av. Siempre Viva" (contiene "IVA").
    if (!/\bIVA\b|I\.V\.A/.test(norm) || /PERCEPCION/.test(norm)) continue;
    // "IVA Responsable Inscripto" es la condición fiscal, no un importe.
    if (/IVA\s+(RESPONSABLE|INSCRIPTO|EXENTO|NO\s+INSCRIPTO|MONOTRIBUTO)/.test(norm)) continue;

    // Se quita el porcentaje antes de buscar importes: "IVA 21%" no tiene
    // por qué interpretarse como un IVA de $21.
    const sinPorcentaje = linea.texto.replace(/\b\d{1,2}(?:[.,]\d+)?\s*%/g, " ");
    const importes = importesDeLinea({ ...linea, texto: sinPorcentaje });
    if (importes.length === 0) continue;
    conImporte.push({ norm, importe: importes[importes.length - 1] });
  }
  if (conImporte.length === 0) return null;

  // Si hay una línea "IVA: $ X" (sin porcentaje), ese es el total. Si solo hay
  // desgloses por alícuota, se suman.
  const total = conImporte.find((item) => !/%/.test(item.norm));
  if (total) return redondear(total.importe);
  return redondear(conImporte.reduce((suma, item) => suma + item.importe, 0));
}

function extraerPercepciones(lineas: LineaTexto[]): number | null {
  let total = 0;
  let encontrado = false;
  for (const linea of lineas) {
    const norm = normalizarTexto(linea.texto);
    if (!/PERCEPCION/.test(norm)) continue;
    const importes = importesDeLinea(linea);
    if (importes.length === 0) continue;
    total += importes[importes.length - 1];
    encontrado = true;
  }
  return encontrado ? redondear(total) : null;
}

function extraerEncabezado(
  lineas: LineaTexto[],
  altoPagina: number,
  opciones: { cuitEmisor?: string }
): EncabezadoFactura {
  const texto = lineas.map((linea) => linea.texto).join("\n");
  const norm = normalizarTexto(texto);
  const cuit = extraerCuit(lineas, altoPagina, opciones.cuitEmisor);
  const { puntoVenta, numeroComprobante } = extraerPuntoVentaYNumero(lineas);

  let subtotal = buscarImporte(lineas, etiquetaSubtotal);
  let iva = extraerIva(lineas);
  let percepciones = extraerPercepciones(lineas);
  let total = buscarImporte(lineas, etiquetaTotal, { desdeFin: true });

  if (total === null && subtotal !== null) {
    total = redondear(subtotal + (iva ?? 0) + (percepciones ?? 0));
  }
  if (subtotal === null && total !== null) {
    subtotal = redondear(total - (iva ?? 0) - (percepciones ?? 0));
  }
  if (iva === null && total !== null && subtotal !== null) {
    iva = redondear(Math.max(0, total - subtotal - (percepciones ?? 0)));
  }

  return {
    proveedorCuit: cuit,
    proveedorNombre: extraerNombreProveedor(lineas, cuit),
    tipoComprobante: extraerTipoComprobante(lineas, norm),
    puntoVenta,
    numeroComprobante,
    fechaComprobante: extraerFecha(lineas),
    subtotal: subtotal === null ? null : redondear(subtotal),
    iva: iva === null ? null : redondear(iva),
    percepciones: percepciones === null ? null : redondear(percepciones),
    total: total === null ? null : redondear(total),
    cae: extraerCae(texto),
  };
}

// ─────────────────────────────────────────────
// Ítems por columnas
// ─────────────────────────────────────────────

type RolColumna =
  | "codigo"
  | "descripcion"
  | "cantidad"
  | "precioUnitario"
  | "bonificacion"
  | "alicuota"
  | "subtotal";

interface Columna {
  rol: RolColumna;
  x: number;
}

interface FilaCruda {
  codigo?: string;
  descripcion?: string;
  cantidad?: number;
  precioUnitario?: number;
  bonificacion?: number;
  alicuota?: number;
  subtotal?: number;
}

function rolDeTexto(texto: string): RolColumna | null {
  const norm = normalizarTexto(texto);
  if (!norm) return null;
  if (/^(COD|CODIGO|ART|ARTICULO|SKU|REF)\b/.test(norm)) return "codigo";
  if (/(DESCRIP|DETALLE|CONCEPTO|PRODUCTO)/.test(norm)) return "descripcion";
  if (/(CANT|UNID)/.test(norm)) return "cantidad";
  if (/(P\.?\s*UNIT|PRECIO\s*UNIT|UNITARIO|V\.?\s*UNIT)/.test(norm)) return "precioUnitario";
  if (/(BONIF|DESC|DTO)/.test(norm)) return "bonificacion";
  if (/(ALIC|IVA)/.test(norm)) return "alicuota";
  if (/(SUBTOTAL|IMPORTE|TOTAL|MONTO)/.test(norm)) return "subtotal";
  return null;
}

function detectarColumnas(linea: LineaTexto): Columna[] | null {
  const roles = new Set<RolColumna>();
  const columnas: Columna[] = [];

  for (const fragmento of linea.fragmentos) {
    const rol = rolDeTexto(fragmento.texto);
    if (!rol) continue;
    roles.add(rol);
    if (!columnas.some((columna) => columna.rol === rol)) {
      columnas.push({ rol, x: fragmento.x });
    }
  }

  const tieneDescripcion = roles.has("descripcion");
  const tieneNumeros = roles.has("cantidad") || roles.has("precioUnitario") || roles.has("subtotal");
  if (!tieneDescripcion || !tieneNumeros || roles.size < 3) return null;

  return columnas.sort((a, b) => a.x - b.x);
}

function encontrarCabeceraItems(lineas: LineaTexto[], altoPagina: number): { indice: number; columnas: Columna[] } | null {
  let mejor: { indice: number; columnas: Columna[]; puntaje: number } | null = null;

  for (let indice = 0; indice < lineas.length; indice++) {
    const linea = lineas[indice];
    if (altoPagina > 0 && linea.y < altoPagina * 0.15) continue;
    const columnas = detectarColumnas(linea);
    if (!columnas) continue;
    const puntaje = columnas.length + (columnas.some((c) => c.rol === "cantidad") ? 2 : 0);
    if (!mejor || puntaje > mejor.puntaje) mejor = { indice, columnas, puntaje };
  }

  return mejor ? { indice: mejor.indice, columnas: mejor.columnas } : null;
}

function rolPorX(x: number, columnas: Columna[]): RolColumna | null {
  let asignada: RolColumna | null = null;
  for (const columna of columnas) {
    if (x >= columna.x - 8) asignada = columna.rol;
    else break;
  }
  return asignada;
}

function esFinTabla(linea: LineaTexto): boolean {
  const norm = normalizarTexto(linea.texto);
  if (!norm) return true;
  if (/^(SUBTOTAL|IVA|I\.V\.A|PERCEPCION|IMPORTE\s*TOTAL|TOTAL|CAE|SON\s+PESOS|OBSERVACION|VENCIMIENTO|CUIT|DOMICILIO|CONDICION|ORIGINAL|DUPLICADO|RECIBI|FIRMA)/.test(norm)) {
    return true;
  }
  return /(IMPORTE\s*TOTAL|TOTAL\s*A\s*PAGAR|TOTAL\s*FINAL|SON\s+PESOS)/.test(norm);
}

function valorNumerico(texto: string | undefined): number | null {
  if (!texto) return null;
  const importe = parsearImporte(texto);
  if (importe !== null) return importe;
  const coincidencia = texto.match(/-?\d[\d.,]*/);
  return coincidencia ? parsearImporte(coincidencia[0]) : null;
}

function filaDesdeLinea(linea: LineaTexto, columnas: Columna[]): FilaCruda | null {
  const valores: Partial<Record<RolColumna, string>> = {};

  for (const fragmento of linea.fragmentos) {
    const rol = rolPorX(fragmento.x, columnas);
    if (!rol) continue;
    if (rol === "descripcion") {
      valores.descripcion = valores.descripcion ? `${valores.descripcion} ${fragmento.texto}` : fragmento.texto;
    } else if (rol === "codigo") {
      valores.codigo = valores.codigo ? `${valores.codigo} ${fragmento.texto}` : fragmento.texto;
    } else if (valores[rol] === undefined) {
      valores[rol] = fragmento.texto;
    }
  }

  let descripcion = limpiarDescripcion(valores.descripcion ?? "");
  if (!descripcion) {
    // Sin columna de descripción reconocida: usar los fragmentos con letras
    // que no cayeron en columnas numéricas.
    const sueltos = linea.fragmentos
      .filter((fragmento) => rolPorX(fragmento.x, columnas) === null && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(fragmento.texto))
      .map((fragmento) => fragmento.texto);
    descripcion = limpiarDescripcion(sueltos.join(" "));
  }

  const fila: FilaCruda = {
    codigo: valores.codigo?.trim() || undefined,
    descripcion: descripcion || undefined,
    cantidad: valorNumerico(valores.cantidad) ?? undefined,
    precioUnitario: valorNumerico(valores.precioUnitario) ?? undefined,
    bonificacion: valorNumerico(valores.bonificacion) ?? undefined,
    alicuota: valorNumerico(valores.alicuota) ?? undefined,
    subtotal: valorNumerico(valores.subtotal) ?? undefined,
  };

  const tieneNumeros =
    fila.cantidad !== undefined ||
    fila.precioUnitario !== undefined ||
    fila.subtotal !== undefined;
  if (!fila.descripcion && !tieneNumeros) return null;
  return fila;
}

function construirItem(fila: FilaCruda): Omit<ItemFactura, "linea"> | null {  const descripcion = limpiarDescripcion(fila.descripcion ?? "");
  if (descripcion.length < 2) return null;

  let cantidad = fila.cantidad ?? null;
  let unitario = fila.precioUnitario ?? null;
  let subtotal = fila.subtotal ?? null;

  if (subtotal === null && cantidad !== null && unitario !== null) subtotal = cantidad * unitario;
  if (cantidad === null && subtotal !== null && unitario !== null && unitario > 0) cantidad = subtotal / unitario;
  if (unitario === null && subtotal !== null && cantidad !== null && cantidad > 0) unitario = subtotal / cantidad;

  if (cantidad === null || unitario === null) return null;
  if (!(cantidad > 0) || !(unitario >= 0)) return null;

  subtotal = subtotal ?? cantidad * unitario;
  const calculado = cantidad * unitario;
  // Si la factura trae bonificación, el subtotal es el neto: se usa ese valor
  // para que el costo y el total de la compra coincidan con la factura.
  if (Math.abs(calculado - subtotal) > Math.max(0.05, subtotal * 0.005)) {
    unitario = subtotal / cantidad;
  }

  return {
    codigoProveedor: fila.codigo?.trim() || null,
    descripcion,
    cantidad: redondear(cantidad, 3),
    precioUnitario: redondear(unitario, 2),
    subtotal: redondear(subtotal, 2),
    alicuotaIva: normalizarAlicuota(fila.alicuota),
  };
}

function extraerItemsPorColumnas(lineas: LineaTexto[], altoPagina: number): ItemFactura[] {
  const cabecera = encontrarCabeceraItems(lineas, altoPagina);
  if (!cabecera) return [];

  const items: ItemFactura[] = [];
  let ultimaY: number | null = null;

  for (let indice = cabecera.indice + 1; indice < lineas.length; indice++) {
    const linea = lineas[indice];
    if (esFinTabla(linea)) break;

    const fila = filaDesdeLinea(linea, cabecera.columnas);
    if (!fila) continue;

    const item = construirItem(fila);
    if (item) {
      items.push({ linea: items.length + 1, ...item });
      ultimaY = linea.y;
      continue;
    }

    // Renglón sin números: probablemente sea la segunda línea de una
    // descripción larga. Se anexa solo si está pegado al ítem anterior.
    if (
      items.length > 0 &&
      ultimaY !== null &&
      Math.abs(linea.y - ultimaY) < 14 &&
      fila.descripcion &&
      fila.descripcion.length <= 90
    ) {
      items[items.length - 1].descripcion = limpiarDescripcion(
        `${items[items.length - 1].descripcion} ${fila.descripcion}`
      );
      ultimaY = linea.y;
    }
  }

  return items;
}

// ─────────────────────────────────────────────
// Fallback: líneas tipo "descripción 12 1.500,00 18.000,00"
// ─────────────────────────────────────────────

const RE_ITEM_TRES = /^(?<desc>.+?)\s+(?<cant>\d{1,6}(?:[.,]\d{1,3})?)\s+(?<unit>\d[\d.,]*)\s+(?<sub>\d[\d.,]*)\s*$/;
const RE_ITEM_DOS = /^(?<desc>.+?)\s+(?<unit>\d[\d.,]*)\s+(?<sub>\d[\d.,]*)\s*$/;
const RE_CODIGO_INICIAL = /^([A-Za-z0-9][A-Za-z0-9._/-]*\d[A-Za-z0-9._/-]*)\s+(.+)$/;

function separarCodigo(descripcion: string): { codigo: string | null; descripcion: string } {
  const coincidencia = descripcion.match(RE_CODIGO_INICIAL);
  if (!coincidencia) return { codigo: null, descripcion };
  const posibleCodigo = coincidencia[1];
  const resto = coincidencia[2].trim();
  if (posibleCodigo.length < 2 || posibleCodigo.length > 24 || resto.length < 3) {
    return { codigo: null, descripcion };
  }
  return { codigo: posibleCodigo, descripcion: resto };
}

function extraerItemsFallback(lineas: LineaTexto[]): ItemFactura[] {
  const items: ItemFactura[] = [];
  const vistos = new Set<string>();

  for (const linea of lineas) {
    const norm = normalizarTexto(linea.texto);
    if (!norm || esFinTabla(linea)) continue;
    if (/CUIT|FECHA|FACTURA|NOTA\s+DE|DOMICILIO|CONDICION|CLIENTE|SENOR|CAE|VENCIMIENTO/.test(norm)) continue;
    if (/\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(linea.texto)) continue;

    let item: Omit<ItemFactura, "linea"> | null = null;

    const tres = linea.texto.match(RE_ITEM_TRES);
    if (tres?.groups) {
      const cantidad = parsearImporte(tres.groups.cant);
      const unitario = parsearImporte(tres.groups.unit);
      const subtotal = parsearImporte(tres.groups.sub);
      if (cantidad !== null && unitario !== null && subtotal !== null && cantidad > 0) {
        const calculado = cantidad * unitario;
        if (Math.abs(calculado - subtotal) <= Math.max(0.1, subtotal * 0.02) || unitario === 0) {
          const { codigo, descripcion } = separarCodigo(limpiarDescripcion(tres.groups.desc));
          item = {
            codigoProveedor: codigo,
            descripcion,
            cantidad: redondear(cantidad, 3),
            precioUnitario: redondear(unitario, 2),
            subtotal: redondear(subtotal, 2),
            alicuotaIva: null,
          };
        }
      }
    }

    if (!item) {
      const dos = linea.texto.match(RE_ITEM_DOS);
      if (dos?.groups) {
        const unitario = parsearImporte(dos.groups.unit);
        const subtotal = parsearImporte(dos.groups.sub);
        if (unitario !== null && subtotal !== null && unitario > 0) {
          const cantidad = Math.max(1, Math.round(subtotal / unitario));
          if (Math.abs(cantidad * unitario - subtotal) <= Math.max(0.1, subtotal * 0.02)) {
            const { codigo, descripcion } = separarCodigo(limpiarDescripcion(dos.groups.desc));
            item = {
              codigoProveedor: codigo,
              descripcion,
              cantidad,
              precioUnitario: redondear(unitario, 2),
              subtotal: redondear(subtotal, 2),
              alicuotaIva: null,
            };
          }
        }
      }
    }

    if (!item) continue;

    const clave = `${normalizarTexto(item.descripcion)}|${item.cantidad}|${item.precioUnitario}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    items.push({ linea: items.length + 1, ...item });
  }

  return items;
}

// ─────────────────────────────────────────────
// API principal
// ─────────────────────────────────────────────

/** Normaliza una línea cruda; también la usa el extractor opcional con IA. */
export function normalizarItemCrudo(fila: {
  codigo?: string | null;
  descripcion?: string | null;
  cantidad?: number | null;
  precioUnitario?: number | null;
  subtotal?: number | null;
  alicuota?: number | null;
}): Omit<ItemFactura, "linea"> | null {
  return construirItem({
    codigo: fila.codigo ?? undefined,
    descripcion: fila.descripcion ?? undefined,
    cantidad: fila.cantidad ?? undefined,
    precioUnitario: fila.precioUnitario ?? undefined,
    subtotal: fila.subtotal ?? undefined,
    alicuota: fila.alicuota ?? undefined,
  });
}

function deduplicarItems(items: ItemFactura[]): ItemFactura[] {
  const vistos = new Set<string>();
  const resultado: ItemFactura[] = [];
  for (const item of items) {
    const clave = `${normalizarTexto(item.descripcion)}|${item.cantidad}|${item.precioUnitario}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    resultado.push({ ...item, linea: resultado.length + 1 });
  }
  return resultado;
}

export function parsearFactura(
  paginas: PaginaTexto[],
  opciones: { cuitEmisor?: string } = {}
): FacturaExtraida {
  const lineas = paginas.flatMap((pagina) => pagina.lineas);
  const altoPagina = paginas[0]?.alto ?? 0;
  const texto = lineas.map((linea) => linea.texto).join("\n");
  const encabezado = extraerEncabezado(lineas, altoPagina, opciones);
  const advertencias: AdvertenciaFactura[] = [];

  // Se intenta la vía por columnas en cada página (algunos proveedores repiten
  // la tabla en varias hojas). Si ninguna funciona, se usa el fallback.
  let items: ItemFactura[] = [];
  for (const pagina of paginas) {
    items.push(...extraerItemsPorColumnas(pagina.lineas, pagina.alto));
  }
  if (items.length === 0) items = extraerItemsFallback(lineas);
  items = deduplicarItems(items);

  if (items.length === 0) {
    advertencias.push({
      codigo: "SIN_ITEMS",
      mensaje: "No se detectaron ítems en el PDF. Revisá el archivo o cargá la compra a mano.",
    });
  }

  const cantidadNoEntera = items.filter((item) => !Number.isInteger(item.cantidad));
  if (cantidadNoEntera.length > 0) {
    advertencias.push({
      codigo: "CANTIDAD_NO_ENTERA",
      mensaje: `Hay ${cantidadNoEntera.length} línea(s) con cantidad decimal; el stock solo admite unidades enteras y habrá que ajustarlas.`,
    });
  }

  if (items.length > 0 && encabezado.subtotal !== null) {
    const suma = redondear(items.reduce((total, item) => total + item.subtotal, 0));
    const diferencia = redondear(Math.abs(suma - encabezado.subtotal));
    if (diferencia > Math.max(1, encabezado.subtotal * 0.01)) {
      advertencias.push({
        codigo: "SUBTOTAL_NO_COINCIDE",
        mensaje: `La suma de los ítems ($${suma.toFixed(2)}) no coincide con el subtotal de la factura ($${encabezado.subtotal.toFixed(2)}). Diferencia: $${diferencia.toFixed(2)}.`,
      });
    }
  }

  let confianza = 100;
  if (!encabezado.proveedorCuit) confianza -= 12;
  if (!encabezado.proveedorNombre) confianza -= 8;
  if (!encabezado.tipoComprobante) confianza -= 5;
  if (!encabezado.numeroComprobante) confianza -= 10;
  if (!encabezado.fechaComprobante) confianza -= 5;
  if (encabezado.total === null) confianza -= 12;
  if (items.length === 0) confianza -= 45;
  if (advertencias.some((advertencia) => advertencia.codigo === "SUBTOTAL_NO_COINCIDE")) confianza -= 15;
  confianza = Math.max(5, Math.min(100, confianza));

  return { encabezado, items, advertencias, confianza, texto };
}
