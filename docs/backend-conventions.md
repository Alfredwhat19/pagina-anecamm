# Backend Conventions (v1)

## 1) Versionado de API
- Base: `/api/v1`
- Futura version: `/api/v2` sin romper v1.

## 2) Convencion de rutas
- Recursos en minusculas y plural cuando aplique.
- Ejemplos:
  - `GET /api/v1/health`
  - `POST /api/v1/afiliaciones`
  - `GET /api/v1/directorio`
  - `DELETE /api/v1/directorio/demo` (solo desarrollo)

## 3) Convencion de nombres
- Archivos:
  - `afiliaciones.controller.js`
  - `afiliaciones.routes.js`
  - `afiliaciones.service.js`
  - `club.model.js`
- Variables y funciones: `camelCase`
- Constantes: `UPPER_SNAKE_CASE`

## 4) Estructura sugerida
- `src/api/routes/v1`
- `src/api/controllers/v1`
- `src/services`
- `src/models`
- `src/middleware`
- `src/config`

## 5) Formato de respuesta
- Exito:
```json
{ "ok": true, "data": {} }
```
- Error:
```json
{ "ok": false, "error": { "code": "...", "message": "...", "details": [] } }
```

## 6) Codigos HTTP
- `200` lectura OK
- `201` creado
- `204` sin contenido
- `400` validacion
- `401` no autenticado
- `403` no autorizado
- `404` no encontrado
- `409` conflicto
- `500` error interno

## 7) Validacion y seguridad
- Nunca guardar tarjeta/CVV en base de datos.
- Aceptar solo token de pasarela de pago.
- Validar payload en borde (request schema).

## 8) Variables de entorno
- `PORT`
- `NODE_ENV`
- `DB_URL`
- `PAYMENT_PROVIDER`
- `PAYMENT_API_KEY`