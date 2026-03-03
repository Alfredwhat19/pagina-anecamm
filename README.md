# Web-ANECAMM

Proyecto web de ANECAMM con frontend estático y estructura base preparada para backend.

## Estructura
- `frontend/html`: vistas HTML
- `frontend/css`: estilos
- `frontend/js`: lógica de interfaz
- `frontend/assets/images`: imágenes del sitio
- `docs/api-contract.md`: contrato inicial de API
- `backend`: estructura inicial para API y persistencia
- `tools/cloudflared`: utilidades para demo pública

## Ejecutar frontend local
Desde la raíz del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 8080
```

Sitio:
- `http://localhost:8080`
- redirección automática a `frontend/html/index.html`

## Demo pública temporal (Cloudflare Quick Tunnel)
Con el servidor local activo:

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:8080 --http-host-header localhost
```

Comparte la URL `https://*.trycloudflare.com` generada en consola.

## Build estático
Generar paquete para despliegue:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1
```

Salida:
- `dist/index.html`
- `dist/frontend/...`

## Próxima fase backend
La carpeta `backend/` ya está lista para iniciar:
- `src/api/controllers`
- `src/api/routes`
- `src/models`
- `src/services`
- `src/config`
- `src/middleware`
- `tests`
- `scripts`

Siguiente arranque recomendado:
1. Elegir stack backend (por ejemplo Node/Express).
2. Configurar `.env` basado en `backend/.env.example`.
3. Crear endpoint `GET /health`.
4. Implementar endpoint de afiliación con persistencia en BD.
