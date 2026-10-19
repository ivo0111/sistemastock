import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";
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
import promocionesRoutes from "./modules/promociones/promociones.routes";

export const app = express();

// Frontend compilado servido por el propio backend en producción (un solo
// puerto, sin proxy ni `vite preview`). En desarrollo el front corre con Vite;
// si no hay dist/ compilado, esta rama no hace nada.
// La ruta relativa funciona igual en el repo (stock-ventas-backend/../) que en
// la instalación (C:\SistemaStock\stock-ventas-backend\../).
const frontendDist = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.resolve(__dirname, "../../stock-ventas-frontend/dist");
const frontendIndex = path.join(frontendDist, "index.html");
const hayFrontendCompilado = fs.existsSync(frontendIndex);

if (hayFrontendCompilado) {
  // Antes de helmet a propósito: los assets estáticos no necesitan las
  // cabeceras de seguridad pensadas para respuestas de la API.
  app.use(express.static(frontendDist, { index: false }));
}

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
app.use("/api/v1/promociones", promocionesRoutes);

// SPA fallback: cualquier GET que no sea de la API devuelve index.html para
// que React Router maneje la ruta (p. ej. /ventas/42 recargada del navegador).
if (hayFrontendCompilado) {
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    // Sin la CSP de helmet: el comprobante se renderiza en una ventana hija
    // (document.write) que hereda las cabeceras del documento creador, y sus
    // estilos/JS inline (botón Imprimir) quedarían bloqueados.
    res.removeHeader("Content-Security-Policy");
    res.sendFile(frontendIndex);
  });
}

// ErrorHandler
app.use(errorHandler);
