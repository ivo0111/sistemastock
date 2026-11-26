import type {
  EquivalenciaProveedor,
  ItemFactura,
  ItemImportado,
  ProductoLigero,
  SugerenciaProducto,
} from "./types";

/** Normaliza para comparar nombres: sin acentos, signos ni mayúsculas. */
export function normalizarParaMatch(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigramas(texto: string): Set<string> {
  const limpio = texto.replace(/\s+/g, " ");
  const set = new Set<string>();
  for (let i = 0; i < limpio.length - 1; i++) set.add(limpio.slice(i, i + 2));
  return set;
}

/** Coeficiente de Dice sobre bigramas: robusto para nombres de productos. */
export function similitud(a: string, b: string): number {
  const na = normalizarParaMatch(a);
  const nb = normalizarParaMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) {
    return 0.9;
  }

  const ba = bigramas(na);
  const bb = bigramas(nb);
  if (ba.size === 0 || bb.size === 0) return 0;

  let comunes = 0;
  for (const bigrama of ba) {
    if (bb.has(bigrama)) comunes++;
  }
  return (2 * comunes) / (ba.size + bb.size);
}

function codigoNormalizado(codigo: string): string {
  return codigo.trim().toLowerCase().replace(/^0+/, "").replace(/\s+/g, "");
}

function mismoCodigo(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = codigoNormalizado(a);
  const nb = codigoNormalizado(b);
  return na.length > 0 && na === nb;
}

interface ProductoPreparado {
  producto: ProductoLigero;
  nombreNormalizado: string;
}

export interface SugerenciaProveedor {
  proveedorId: number;
  puntaje: number;
}

export function buscarProveedorPorNombre(
  nombre: string | null,
  proveedores: Array<{ id: number; nombre: string }>
): SugerenciaProveedor | null {
  if (!nombre) return null;
  let mejor: SugerenciaProveedor | null = null;
  for (const proveedor of proveedores) {
    const puntaje = similitud(nombre, proveedor.nombre);
    if (!mejor || puntaje > mejor.puntaje) mejor = { proveedorId: proveedor.id, puntaje };
  }
  // Umbral alto: es preferible que el usuario elija antes que vincular una
  // factura al proveedor equivocado.
  return mejor && mejor.puntaje >= 0.86 ? mejor : null;
}

export function sugerirProductos(
  items: ItemFactura[],
  productos: ProductoLigero[],
  equivalencias: EquivalenciaProveedor[] = []
): ItemImportado[] {
  const preparados: ProductoPreparado[] = productos.map((producto) => ({
    producto,
    nombreNormalizado: normalizarParaMatch(producto.nombre),
  }));

  const porId = new Map<number, ProductoLigero>();
  for (const producto of productos) porId.set(producto.id, producto);

  const porCodigoProveedor = new Map<string, number>();
  for (const equivalencia of equivalencias) {
    if (!equivalencia.codigoProveedor) continue;
    porCodigoProveedor.set(codigoNormalizado(equivalencia.codigoProveedor), equivalencia.productoId);
  }

  return items.map((item) => {
    const sugerencias: SugerenciaProducto[] = [];
    const agregar = (productoId: number, puntaje: number, motivo: string) => {
      const producto = porId.get(productoId);
      if (!producto) return;
      const existente = sugerencias.find((sugerencia) => sugerencia.productoId === productoId);
      if (existente) {
        if (puntaje > existente.puntaje) {
          existente.puntaje = puntaje;
          existente.motivo = motivo;
        }
        return;
      }
      sugerencias.push({
        productoId,
        nombre: producto.nombre,
        sku: producto.sku,
        puntaje,
        motivo,
      });
    };

    if (item.codigoProveedor) {
      const porEquivalencia = porCodigoProveedor.get(codigoNormalizado(item.codigoProveedor));
      if (porEquivalencia !== undefined) agregar(porEquivalencia, 100, "código de proveedor");

      for (const preparado of preparados) {
        if (
          mismoCodigo(item.codigoProveedor, preparado.producto.sku) ||
          mismoCodigo(item.codigoProveedor, preparado.producto.codigoBarras)
        ) {
          agregar(preparado.producto.id, 96, "SKU / código de barras");
        }
      }
    }

    const descripcionNormalizada = normalizarParaMatch(item.descripcion);
    for (const preparado of preparados) {
      if (preparado.nombreNormalizado === descripcionNormalizada) {
        agregar(preparado.producto.id, 92, "nombre exacto");
        continue;
      }
      const puntaje = similitud(descripcionNormalizada, preparado.nombreNormalizado);
      if (puntaje >= 0.45) {
        agregar(preparado.producto.id, Math.round(puntaje * 90), "nombre similar");
      }
    }

    sugerencias.sort((a, b) => b.puntaje - a.puntaje);
    const top = sugerencias.slice(0, 3);
    const mejor = top[0];
    return {
      ...item,
      sugerencias: top,
      productoIdSugerido: mejor && mejor.puntaje >= 72 ? mejor.productoId : null,
    };
  });
}
