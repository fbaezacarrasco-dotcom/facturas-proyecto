# facturas-proyecto

Proyecto con frontend (Vite + React) y backend (Express) listo para desarrollo local.

## Requisitos
- Node.js 18+ (recomendado 20+ para `node --watch`)
- npm 9+

## Backend
1. Copia variables de entorno:
   `cp backend/.env.example backend/.env`
2. Instala dependencias (si aún no):
   `cd backend && npm install`
3. Ejecuta en desarrollo:
   `npm run dev`
   - Servidor en `http://localhost:4000`

## Frontend
1. Instala dependencias (si aún no):
   `cd frontend && npm install`
2. Ejecuta en desarrollo:
   `npm run dev`
   - App en `http://localhost:5173`
   - Proxy a API en `/api` -> `http://localhost:4000`

## Notas
- CORS permitido para `http://localhost:5173` (configurable vía `CORS_ORIGIN`).
- Endpoint de salud: `GET /api/health` devuelve `{ ok: true, message: "API OK" }`.
- Tailwind activado con `@import "tailwindcss";` en `frontend/src/index.css`. Personaliza estilos con clases utilitarias.
