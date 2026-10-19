# API Contract — Sistema de Gestión de Stock y Ventas

**Versión:** 2.0 (refleja el código actual del backend)
**Alcance:** negocio de una sola sucursal, vendedor operativo + rol admin.
**Base URL:** `/api/v1`
**Auth:** JWT en header `Authorization: Bearer <token>`

---

## Convenciones generales

- Formato JSON, claves en **camelCase** en bodies y respuestas. Atención:
  algunos **query params** históricos son snake_case (`categoria_id`,
  `stock_bajo`, `usuario_id`, `producto_id`, `proveedor_id`, `agrupar_por`);
  se listan con su nombre real en cada endpoint.
- Fechas: ISO 8601 (`2026-07-17T14:30:00.000Z`).
- Errores (manejo centralizado):
```json
{
  "error": {
    "code": "STOCK_INSUFICIENTE",
    "message": "No hay stock suficiente para \"Tornillo\" (disponible: 2, pedido: 5)"
  }
}
```
- Errores de validación de zod → 400 con el detalle de Zod.
- Listados: `{ "data": [...], "total": 42, "page": 1, "limit": 20 }` (donde aplica).
- Roles: `ADMIN` y `VENDEDOR`. Las rutas marcadas **[ADMIN]** devuelven 403 para VENDEDOR.

---

## 1. Auth

### POST `/auth/login`
Rate-limit: 10 intentos / 15 min.
```json
// Request
{ "usuario": "admin", "password": "admin123" }

// Response 200
{ "token": "jwt...", "usuario": { "id": 1, "nombre": "Administrador", "rol": "ADMIN" } }
```

### POST `/auth/cambiar-password`
```json
{ "passwordActual": "admin123", "passwordNuevo": "nueva-clave" }
```

---

## 2. Usuarios **[ADMIN]**

- `GET /usuarios` — listado.
- `POST /usuarios` — `{ nombre, usuario, password (min 6), rol: "ADMIN" | "VENDEDOR" }`.
- `PUT /usuarios/:id` — campos parciales (`nombre`, `password`, `rol`).

---

## 3. Productos

Todas las rutas requieren login; las marcadas **[ADMIN]** no.

- `GET /productos` — query: `?busqueda=&categoria_id=&stock_bajo=true&page=&limit=`.
- `GET /productos/buscar?q=` — búsqueda liviana para el POS
  (`id`, `sku`, `nombre`, `precioVenta`, `stockActual`, `alicuotaIva`...).
- `GET /productos/etiquetas?ids=1,2,3` — datos para imprimir etiquetas de precios.
- `GET /productos/:id` — detalle.
- `POST /productos` **[ADMIN]**
  ```json
  {
    "sku": "PRD-002",
    "nombre": "Tornillo 6mm",
    "codigoBarras": "7791234567890",
    "categoriaId": 2,
    "precioCosto": 1000,
    "precioVenta": 1800,
    "stockInicial": 10,
    "stockMinimo": 5,
    "alicuotaIva": 21,
    "unidadMedida": "unidades"
  }
  ```
  `stockInicial` genera un movimiento `AJUSTE_INICIAL` automáticamente.
- `PUT /productos/:id` **[ADMIN]** — campos parciales. No toca stock.
- `DELETE /productos/:id` **[ADMIN]** — baja lógica (`activo: false`), 204.
- `POST /productos/:id/ajuste-stock` **[ADMIN]**
  ```json
  { "cantidad": -3, "motivo": "Producto dañado" }
  ```
  `cantidad` firmada (negativa = baja). Se rechaza con `STOCK_INSUFICIENTE`
  (409) si quedaría en negativo. Único camino de stock "a mano".
- `POST /productos/verificar-existencia`
  ```json
  // Request
  { "skus": ["PRD-1"], "codigosBarras": ["779..."] }
  // Response
  { "skusExistentes": ["PRD-1"], "codigosExistentes": ["779..."] }
  ```
- `POST /productos/importar` **[ADMIN]** — importación masiva.
  Máximo **500 filas por request** (el frontend de UI lo envía en lotes).
  ```json
  // Request
  { "filas": [ { "sku", "nombre", "categoriaNombre?", "precioCosto", "precioVenta",
                 "stockActual?", "stockMinimo?", "codigoBarras?", "alicuotaIva?",
                 "unidadMedida?", "accionSiExiste?": "actualizar" | "omitir" } ] }
  // Response 200
  { "creados": 3, "actualizados": 1, "omitidos": 0,
    "errores": [ { "sku": "PRD-9", "motivo": "SKU duplicado dentro del archivo" } ] }
  ```

---

## 4. Categorías

- `GET /categorias` (login)
- `POST /`, `PUT /:id`, `DELETE /:id` **[ADMIN]** — `{ "nombre": "..." }`.

---

## 5. Stock (auditoría)

- `GET /stock/movimientos` — query: `?producto_id=&tipo=venta|compra|ajuste|devolucion|ajuste_inicial&desde=&hasta=&page=&limit=`.
  ```json
  {
    "data": [ {
      "id": 1, "productoId": 1,
      "tipo": "VENTA | COMPRA | AJUSTE | DEVOLUCION | AJUSTE_INICIAL",
      "cantidad": -2, "fecha": "...", "usuarioId": 1,
      "referenciaTipo": "venta", "referenciaId": 55, "motivo": null
    } ]
  }
  ```

---

## 6. Ventas (POS)

- `POST /ventas` — transaccional (todo o nada):
  ```json
  // Request
  {
    "clienteId": 1,            // requerido si formaPago = CUENTA_CORRIENTE
    "items": [ { "productoId": 1, "cantidad": 2, "bonificacion": 10 } ],
    "formaPago": "EFECTIVO | TARJETA | TRANSFERENCIA | CUENTA_CORRIENTE",
    "descuento": 0             // descuento global en pesos
  }
  // Response 201: la venta con items
  ```
  Reglas:
  - El precio unitario sale de la BD (el cliente no lo manda).
  - La bonificación efectiva es `max(bonificacion del vendedor, promoción vigente)`.
  - Errores: `STOCK_INSUFICIENTE` (409), `CLIENTE_REQUERIDO` (400),
    `PRODUCTO_INACTIVO` (409), `DESCUENTO_INVALIDO` (400).
  - Descuenta stock + crea movimientos `VENTA`; si la forma de pago es
    `CUENTA_CORRIENTE`, crea un `CARGO` y sube el saldo del cliente.
  - Si el usuario tiene caja abierta, la venta queda imputada a esa caja.

- `GET /ventas` — query: `?desde=&hasta=&usuario_id=&estado=CONFIRMADA|ANULADA&page=&limit=`.
- `GET /ventas/:id` — detalle con items, cliente y usuario.
- `POST /ventas/:id/anular` **[ADMIN]** — `{ "motivo": "..." }`.
  Revierte stock (movimientos `DEVOLUCION`), revierte el cargo de cuenta
  corriente si aplica y marca `ANULADA`. Doble anulación → `VENTA_YA_ANULADA` (409).
- `GET /ventas/:id/comprobante?copias=1&format=html|pdf` — comprobante fiscal:
  HTML (para ventana hija/impresión) o PDF (puppeteer-core). La primera vez
  pide el CAE a ARCA (mock por default) y lo persiste junto al correlativo.

---

## 7. Proveedores

- `GET /proveedores`, `GET /proveedores/:id` (login).
- `POST /`, `PUT /:id`, `DELETE /:id` **[ADMIN]** —
  `{ "nombre", "contacto?", "telefono?", "email?" }`.

---

## 8. Compras **[ADMIN]**

- `POST /compras`
  ```json
  {
    "proveedorId": 1,
    "items": [ { "productoId": 1, "cantidad": 20, "precioUnitario": 950 } ],
    "actualizarPrecioCosto": true
  }
  ```
  Suma stock (movimiento `COMPRA`), registra el usuario que compró y, opcionalmente,
  actualiza `precioCosto`. Rechaza productos inactivos (`PRODUCTO_INACTIVO`).
- `GET /compras` — query: `?desde=&hasta=&proveedor_id=&page=&limit=`.
- `GET /compras/:id`.

---

## 9. Clientes

- `GET /clientes?busqueda=`, `GET /clientes/:id` (login).
- `POST /`, `PUT /:id` (login)
  ```json
  { "nombre", "telefono?", "email?", "cuit?",
    "condicionIva": "RESPONSABLE_INSCRIPTO | MONOTRIBUTO | CONSUMIDOR_FINAL | EXENTO",
    "domicilioComercial?" }
  ```
- `DELETE /clientes/:id` **[ADMIN]** — 204.
- `GET /clientes/:id/historial` — ventas del cliente.
- `GET /clientes/:id/cuenta-corriente/movimientos` — movimientos de la cc.
- `POST /clientes/:id/cuenta-corriente/ajuste` **[ADMIN]**
  ```json
  { "monto": -500, "motivo": "Pago en efectivo", "tipo": "CARGO | PAGO | AJUSTE" }
  ```
  Validación de signo: `CARGO` solo positivo, `PAGO` solo negativo
  (`MONTO_SIGNO_INVALIDO`, 400). `AJUSTE` admite ambos signos.

---

## 10. Caja

- `POST /caja/apertura` — `{ "montoInicial": 5000 }`. Una caja abierta por
  usuario (`CAJA_ABIERTA`, 409 si ya tiene una).
- `POST /caja/cierre` — `{ "montoFinalContado": 45000, "cajaId?": 3 }`.
  Cerrá la propia; `cajaId` solo lo puede usar ADMIN para cerrar la de otro.
  Devuelve la caja con la diferencia entre lo esperado (ventas del turno) y lo
  contado. Cierre concurrente → 409.
- `GET /caja/actual` — caja abierta del usuario autenticado (o null).
- `GET /caja/historial` **[ADMIN]** — query: `?desde=&hasta=`.

---

## 11. Promociones

- `GET /promociones/activas` (login) — vigentes para el POS.
- `GET /` **[ADMIN]**, y CRUD **[ADMIN]**:
  ```json
  {
    "nombre": "2da al 50%",
    "tipo": "DESCUENTO_PORCENTUAL | SEGUNDA_UNIDAD | DOS_POR_UNO",
    "productoId": 5,            // null = aplica a todos los productos
    "valor": 50,                // porcentaje (0-100)
    "cantidadMinima": 2,        // opcional
    "activo": true,
    "fechaInicio": "2026-10-01", "fechaFin": "2026-10-31"
  }
  ```

---

## 12. Reportes **[ADMIN]**

- `GET /reportes/ventas?desde=&hasta=&agrupar_por=dia|semana|mes`.
- `GET /reportes/productos-mas-vendidos?desde=&hasta=&limit=10`.
- `GET /reportes/margen?desde=&hasta=` — ganancia bruta por período.
- `GET /reportes/stock-bajo` — `stockActual <= stockMinimo`.

Los reportes devuelven `{ desde, hasta, data }` (por defecto: últimos 30 días).

---

## Reglas transaccionales clave (backend)

1. **POST /ventas**: una única transacción — validar cliente/productos,
   bloquear filas (`FOR UPDATE`), descontar stock, crear venta + items +
   movimientos + cargo cc. Si algo falla, rollback completo. Dos ventas
   simultáneas no pueden bajar el stock por debajo de cero.
2. **POST /productos/:id/ajuste-stock**: transacción con `FOR UPDATE`;
   no deja stock negativo y siempre deja movimiento.
3. **POST /compras**: transacción — compra + items + suma de stock.
4. **POST /ventas/:id/anular**: compare-and-swap de estado (una sola
   anulación efectiva) + reversión de stock y de cargo cc.
5. **GET /ventas/:id/comprobante**: `FOR UPDATE` sobre la venta para pedir el
   CAE una única vez; correlativo asignado con advisory lock.
6. Todo cambio de stock queda en `movimientos_stock`, sin excepción.

---

## Roles y permisos

| Acción | VENDEDOR | ADMIN |
|---|---|---|
| Login, ver productos, vender | ✅ | ✅ |
| Ver promociones activas | ✅ | ✅ |
| Crear/editar/borrar productos | ❌ | ✅ |
| Ajustar stock / importar | ❌ | ✅ |
| Anular ventas | ❌ | ✅ |
| Compras, categorías, proveedores, usuarios | ❌ | ✅ |
| Clientes (alta/edición) | ✅ | ✅ |
| Borrar clientes / ajustar cc | ❌ | ✅ |
| Apertura/cierre de caja | ✅ (la suya) | ✅ (la de cualquiera) |
| Reportes, historial de cajas, CRUD promociones | ❌ | ✅ |
