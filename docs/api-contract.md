# API Contract (v1 Draft)

Contrato inicial para la siguiente fase backend.

## Base URL
- `/api/v1`

## Health
- `GET /api/v1/health`
- Response 200:
```json
{
  "ok": true,
  "service": "anecamm-api",
  "version": "v1"
}
```

## Crear afiliacion
- `POST /api/v1/afiliaciones`
- Body:
```json
{
  "club": "Elite Kai Muay",
  "direccion": "Asia 66",
  "ciudadEstado": "CDMX",
  "telefono": "5512345678",
  "instructor": "Kru Ejemplo",
  "redSocial": "https://facebook.com/club",
  "logo": "https://...",
  "foto": "https://...",
  "pago": {
    "titular": "Nombre Apellido",
    "token": "tok_xxx",
    "monto": 1500,
    "moneda": "MXN"
  }
}
```
- Response 201:
```json
{
  "ok": true,
  "data": {
    "id": "afl_123",
    "estatus": "afiliado_pagado",
    "fechaAfiliacion": "2026-02-26T00:00:00.000Z"
  }
}
```

## Listar directorio
- `GET /api/v1/directorio?search=<texto>`
- Response 200:
```json
{
  "ok": true,
  "data": [
    {
      "id": "afl_123",
      "club": "Elite Kai Muay",
      "direccion": "Asia 66",
      "ciudadEstado": "CDMX",
      "telefono": "5512345678",
      "instructor": "Kru Ejemplo",
      "redSocial": "https://facebook.com/club",
      "estatus": "afiliado_pagado"
    }
  ]
}
```

## Limpiar demo (solo desarrollo)
- `DELETE /api/v1/directorio/demo`
- Response 204 sin body.

## Formato de error
- Response ejemplo:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Datos invalidos",
    "details": []
  }
}
```