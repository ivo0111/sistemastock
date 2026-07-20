import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./modules/auth/auth.routes";
import productosRoutes from "./modules/productos/productos.routes";
import ventasRoutes from "./modules/ventas/ventas.routes";
import categoriasRoutes from "./modules/categorias/categorias.routes";
import proveedoresRoutes from "./modules/proveedores/proveedores.routes";
import comprasRoutes from "./modules/compras/compras.routes";
import clientesRoutes from "./modules/clientes/clientes.routes";
import cajaRoutes from "./modules/caja/caja.routes";
import reportesRoutes from "./modules/reportes/reportes.routes";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/v1/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/productos", productosRoutes);
app.use("/api/v1/ventas", ventasRoutes);
app.use("/api/v1/categorias", categoriasRoutes);
app.use("/api/v1/proveedores", proveedoresRoutes);
app.use("/api/v1/compras", comprasRoutes);
app.use("/api/v1/clientes", clientesRoutes);
app.use("/api/v1/caja", cajaRoutes);
app.use("/api/v1/reportes", reportesRoutes);

// El errorHandler va siempre al final, después de todas las rutas
app.use(errorHandler);