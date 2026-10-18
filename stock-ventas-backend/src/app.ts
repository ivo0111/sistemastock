import express from "express";
import cors from "cors";
import helmet from "helmet";
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
import stockRoutes from "./modules/stock/stock.routes";
import usuariosRoutes from "./modules/usuarios/usuarios.routes";

export const app = express();

// Orígenes permitidos para CORS. En local el front corre en Vite (5173);
// si se sirve desde otro dominio/puerto, agregarlo con CORS_ORIGIN en .env
// (separado por comas).
const origenesPermitidos = (
  process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Sin Origin (requests de la misma máquina, curl, etc.) se permite
      if (!origin || origenesPermitidos.includes(origin)) return callback(null, true);
      callback(null, false);
    },
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/v1/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/usuarios", usuariosRoutes);
app.use("/api/v1/productos", productosRoutes);
app.use("/api/v1/ventas", ventasRoutes);
app.use("/api/v1/categorias", categoriasRoutes);
app.use("/api/v1/proveedores", proveedoresRoutes);
app.use("/api/v1/compras", comprasRoutes);
app.use("/api/v1/clientes", clientesRoutes);
app.use("/api/v1/caja", cajaRoutes);
app.use("/api/v1/reportes", reportesRoutes);
app.use("/api/v1/stock", stockRoutes);

// ErrorHandler
app.use(errorHandler);
