# API Contract — Sistema de Gestión de Stock y Ventas

**Versión:** 1.0
**Alcance:** Negocio de una sola sucursal, un vendedor operativo + un rol dueño/admin.
**Base URL:** `/api/v1`
**Auth:** JWT en header `Authorization: Bearer <token>`

---

## Convenciones generales

- Formato: JSON
- Fechas: ISO 8601 (`2026-07-17T14:30:00Z`)
- Errores:
```json
{
  "error": {
    "code": "STOCK_INSUFICIENTE",
    "message": "No hay stock suficiente del producto X"
  }
}
```
- Paginación en listados: query params `?page=1&limit=20`, respuesta con `{ data: [...], total, page, limit }`

---

## 1. Auth

### POST `/auth/login`
```json
// Request
{ "usuario": "string", "password": "string" }

// Response 200
{ "token": "jwt...", "usuario": { "id", "nombre", "rol" } }
```

### POST `/auth/refresh`
Renueva el token usando refresh token (cookie httpOnly).

### POST `/auth/logout`
Invalida el refresh token.

---

## 2. Productos

### GET `/productos`
Query params: `?busqueda=&categoria_id=&stock_bajo=true`

```json
{
  "data": [
    {
      "id": 1,
      "sku": "PRD-001",
      "nombre": "string",
      "categoria_id": 2,
      "precio_costo": 1000.00,
      "precio_venta": 1800.00,
      "stock_actual": 15,
      "stock_minimo": 5,
      "activo": true
    }
  ],
  "total": 42
}
```

### GET `/productos/:id`
Detalle de un producto.

### POST `/productos`
```json
// Request
{
  "sku": "PRD-002",
  "nombre": "string",
  "categoria_id": 2,
  "precio_costo": 1000.00,
  "precio_venta": 1800.00,
  "stock_inicial": 10,
  "stock_minimo": 5
}
```
Nota: `stock_inicial` genera un movimiento de stock tipo `ajuste_inicial` automáticamente.

### PUT `/productos/:id`
Actualiza datos del producto (no toca stock directamente).

### DELETE `/productos/:id`
Baja lógica (`activo: false`), nunca borrado físico si ya tiene movimientos asociados.

### GET `/productos/buscar?q=`
Búsqueda rápida para el POS (por nombre o SKU), pensada para autocompletar. Respuesta liviana:
```json
[{ "id": 1, "sku": "PRD-001", "nombre": "string", "precio_venta": 1800.00, "stock_actual": 15 }]
```

---

## 3. Categorías

### GET `/categorias`
### POST `/categorias`
### PUT `/categorias/:id`
### DELETE `/categorias/:id`

CRUD simple, sin complejidad adicional.

---

## 4. Stock (movimientos)

### GET `/stock/movimientos`
Query params: `?producto_id=&tipo=&desde=&hasta=`
```json
{
  "data": [
    {
      "id": 1,
      "producto_id": 1,
      "tipo": "venta | compra | ajuste | devolucion | ajuste_inicial",
      "cantidad": -2,
      "fecha": "2026-07-17T14:30:00Z",
      "usuario_id": 1,
      "referencia_tipo": "venta",
      "referencia_id": 55,
      "motivo": "string opcional (para ajustes manuales)"
    }
  ]
}
```

### POST `/stock/ajuste`
Para correcciones manuales (rotura, pérdida, conteo físico).
```json
// Request
{ "producto_id": 1, "cantidad": -3, "motivo": "Producto dañado" }
```
`cantidad` puede ser negativa (baja) o positiva (alta). Este es el único endpoint que mueve stock "a mano"; venta y compra lo hacen indirectamente.

---

## 5. Ventas (POS)

### POST `/ventas`
Operación transaccional: crea la venta, sus ítems, y descuenta stock — todo o nada.
```json
// Request
{
  "cliente_id": null,
  "items": [
    { "producto_id": 1, "cantidad": 2, "precio_unitario": 1800.00 }
  ],
  "forma_pago": "efectivo | tarjeta | transferencia",
  "descuento": 0
}

// Response 201
{
  "id": 55,
  "fecha": "...",
  "total": 3600.00,
  "estado": "confirmada",
  "items": [...],
  "comprobante_url": "/ventas/55/comprobante"
}
```
Errores posibles: `STOCK_INSUFICIENTE` (409), con detalle de qué producto/ítem falló.

### GET `/ventas`
Query params: `?desde=&hasta=&usuario_id=&estado=`

### GET `/ventas/:id`
Detalle completo con ítems.

### POST `/ventas/:id/anular`
```json
{ "motivo": "string" }
```
Revierte stock (genera movimientos tipo `devolucion`) y marca la venta como `anulada`. No se borra el registro — trazabilidad.

### GET `/ventas/:id/comprobante`
Devuelve PDF/ticket imprimible.

---

## 6. Proveedores

### GET `/proveedores`
### POST `/proveedores`
### PUT `/proveedores/:id`
### DELETE `/proveedores/:id`

CRUD simple: `{ id, nombre, contacto, telefono, email }`

---

## 7. Compras (reposición de stock)

### POST `/compras`
```json
// Request
{
  "proveedor_id": 1,
  "items": [
    { "producto_id": 1, "cantidad": 20, "precio_unitario": 950.00 }
  ]
}

// Response 201
{ "id": 10, "total": 19000.00, "estado": "recibida" }
```
Al confirmarse, suma stock automáticamente (movimiento tipo `compra`) y opcionalmente actualiza `precio_costo` del producto.

### GET `/compras`
### GET `/compras/:id`

---

## 8. Clientes (opcional, si hay cuenta corriente o fiado)

### GET `/clientes`
### POST `/clientes`
```json
{ "nombre": "string", "telefono": "string", "cuenta_corriente_saldo": 0 }
```
### GET `/clientes/:id/historial`
Ventas asociadas a ese cliente.

---

## 9. Caja

### POST `/caja/apertura`
```json
{ "monto_inicial": 5000.00 }
```

### POST `/caja/cierre`
```json
{ "monto_final_contado": 45000.00 }
```
Response incluye diferencia entre lo esperado (según ventas registradas) y lo contado.

### GET `/caja/actual`
Estado de la caja abierta, con total acumulado del día.

---

## 10. Reportes

### GET `/reportes/ventas`
Query: `?desde=&hasta=&agrupar_por=dia|semana|mes`
```json
{ "data": [{ "periodo": "2026-07-17", "total": 45000.00, "cantidad_ventas": 12 }] }
```

### GET `/reportes/productos-mas-vendidos`
Query: `?desde=&hasta=&limit=10`

### GET `/reportes/margen`
Ganancia bruta (venta - costo) por período.

### GET `/reportes/stock-bajo`
Productos con `stock_actual <= stock_minimo`.

---

## Reglas transaccionales clave (backend)

1. **POST /ventas**: dentro de una única transacción DB — crear venta, crear ítems, descontar stock por cada ítem, validar que no quede stock negativo. Si falla cualquier paso, rollback completo.
2. **POST /compras**: transacción — crear compra, ítems, sumar stock.
3. **POST /ventas/:id/anular**: transacción — cambiar estado, revertir stock, registrar movimiento de reversión.
4. Todo endpoint que modifique stock queda registrado en `movimientos_stock`, sin excepción — es la fuente de verdad para auditoría.

---

## Roles y permisos

| Acción | Vendedor | Dueño/Admin |
|---|---|---|
| Ver productos / vender | ✅ | ✅ |
| Crear/editar productos | ❌ | ✅ |
| Ajustes de stock | ❌ | ✅ |
| Ver reportes | ❌ | ✅ |
| Anular ventas | ❌ (o con confirmación del dueño) | ✅ |
| Apertura/cierre de caja | ✅ | ✅ |

Con un solo vendedor esto puede empezar simple (2 roles fijos), pero conviene que el rol quede como campo en `usuarios` para no tener que migrar nada si el día de mañana suman otra persona.