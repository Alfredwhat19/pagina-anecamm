# Backend Scaffold

Estructura base para iniciar backend en la siguiente fase.

## Carpetas
- src/api/controllers
- src/api/controllers/v1
- src/api/routes
- src/api/routes/v1
- src/models
- src/services
- src/config
- src/middleware
- tests
- scripts

## Convenciones
- API base: `/api/v1`
- Reglas de naming y respuestas: `docs/backend-conventions.md`
- Contrato inicial: `docs/api-contract.md`

## Siguiente paso recomendado
1. Elegir stack (Node/Express, FastAPI, Laravel, etc.).
2. Configurar variables de entorno en `.env`.
3. Implementar endpoint de salud (`GET /api/v1/health`).
4. Implementar endpoint de afiliación y persistencia en BD.