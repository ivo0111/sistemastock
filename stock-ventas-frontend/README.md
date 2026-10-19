# Frontend — Sistema de Gestión de Stock y Ventas

React + Vite (JavaScript).

El contexto del proyecto vive en el [README de la raíz](../README.md); acá
solo lo específico del frontend.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173
```

El dev server de Vite tiene proxy de `/api` hacia el backend en
`http://localhost:3000` (ver `vite.config.js`): levantá el backend
(`npm run dev` en `stock-ventas-backend/`) y usá el frontend por 5173.

## Build de producción

```bash
npm run build        # genera dist/
```

En producción **no hay servidor de frontend aparte**: el backend Express
sirve `stock-ventas-frontend/dist` en `http://localhost:3000` (estáticos +
SPA fallback). `Iniciar Sistema.bat` compila este build en cada arranque.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | desarrollo con HMR en :5173 |
| `npm run build` | build de producción en `dist/` |
| `npm run lint` | oxlint |

## Estructura

```
src/
  api/client.js        # fetch con JWT, manejo de errores y refresh de sesión
  context/AuthContext.jsx
  components/          # Layout, UI compartida
  pages/
    auth/              # login
    ventas/            # POS, listado y detalle de ventas, comprobante
    productos/         # CRUD, stock, importación masiva (wizard por pasos)
    compras/, clientes/, caja/, categorias/, proveedores/
    reportes/, usuarios/, promociones/
  utils/               # promociones (cálculo de bonificación), fechas, etc.
```

## Notas

- La bonificación de promociones se calcula en `src/utils/promociones.js` y
  el backend vuelve a validar/aplicar la mejor vigente al confirmar la venta:
  el front es solo UX, la fuente de verdad es el backend.
- El comprobante se abre en una ventana hija (`document.write`): el backend
  remueve el header CSP en el fallback SPA para que eso funcione.
