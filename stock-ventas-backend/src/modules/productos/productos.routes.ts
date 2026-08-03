import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as service from "./productos.service";

const router = Router();

// Todas las rutas de productos requieren estar logueado
router.use(requireAuth);

router.get(
  "/buscar",
  asyncHandler(async (req, res) => {
    const q = z.string().min(1).parse(req.query.q);
    const data = await service.buscarProductosRapido(q);
    res.json(data);
  })
);

router.get(
  "/etiquetas",
  asyncHandler(async (req, res) => {
    const { ids } = z
      .object({
        ids: z
          .string()
          .min(1)
          .transform((val) =>
            val
              .split(",")
              .map((v) => Number(v.trim()))
              .filter((n) => Number.isInteger(n) && n > 0)
          )
          .refine((arr) => arr.length > 0, "Debe indicar al menos un id válido"),
      })
      .parse(req.query);

    const data = await service.obtenerProductosParaEtiquetas(ids);
    res.json(data);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        busqueda: z.string().optional(),
        categoria_id: z.coerce.number().optional(),
        stock_bajo: z.coerce.boolean().optional(),
        page: z.coerce.number().min(1).optional(),
        limit: z.coerce.number().min(1).max(100).optional(),
      })
      .parse(req.query);

    const result = await service.listarProductos({
      busqueda: query.busqueda,
      categoriaId: query.categoria_id,
      stockBajo: query.stock_bajo,
      page: query.page,
      limit: query.limit,
    });
    res.json(result);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const producto = await service.obtenerProducto(Number(req.params.id));
    res.json(producto);
  })
);

const crearSchema = z.object({
  sku: z.string().min(1),
  codigoBarras: z.string().optional(),
  nombre: z.string().min(1),
  categoriaId: z.number().optional(),
  precioCosto: z.number().nonnegative(),
  precioVenta: z.number().nonnegative(),
  stockInicial: z.number().int().nonnegative().default(0),
  stockMinimo: z.number().int().nonnegative().default(0),
});

// Solo ADMIN puede crear/editar/borrar productos y ajustar stock manualmente
router.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const input = crearSchema.parse(req.body);
    const producto = await service.crearProducto({ ...input, usuarioId: req.auth!.id });
    res.status(201).json(producto);
  })
);

const actualizarSchema = z.object({
  nombre: z.string().min(1).optional(),
  codigoBarras: z.string().optional(),
  categoriaId: z.number().optional(),
  precioCosto: z.number().nonnegative().optional(),
  precioVenta: z.number().nonnegative().optional(),
  stockMinimo: z.number().int().nonnegative().optional(),
});

router.put(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const input = actualizarSchema.parse(req.body);
    const producto = await service.actualizarProducto(Number(req.params.id), input);
    res.json(producto);
  })
);

router.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    await service.eliminarProducto(Number(req.params.id));
    res.status(204).send();
  })
);

const ajusteSchema = z.object({
  cantidad: z.number().int().refine((v) => v !== 0, "La cantidad no puede ser 0"),
  motivo: z.string().min(1),
});

router.post(
  "/:id/ajuste-stock",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { cantidad, motivo } = ajusteSchema.parse(req.body);
    const producto = await service.ajustarStock(
      Number(req.params.id),
      cantidad,
      motivo,
      req.auth!.id
    );
    res.json(producto);
  })
);

export default router;
