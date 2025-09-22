# facturas-proyecto

Aplicación full‑stack para gestionar facturas con subida de archivos, filtros de búsqueda, edición con historial de cambios y previsualizaciones (imágenes/PDF).

## Tecnologías
- Frontend: React + Vite
- Backend: Node.js + Express 5
- DB: PostgreSQL (opcional durante desarrollo)
- Subida de archivos: Multer (a `backend/uploads/`)

## Estructura
- `frontend/`: código React (páginas, estilos, Vite)
- `backend/`: API Express (rutas, DB, subida de archivos)
- `backend/uploads/`: archivos adjuntos (ignorado por git)

## Requisitos
- Node.js 18+ (recomendado 20+)
- npm 9+
- (Opcional) PostgreSQL 16+ (o Postgres.app)

## Arranque rápido (sin base de datos)
Modo demo en memoria (no guarda datos al reiniciar):
1) Variables de entorno
   - Copia: `cp backend/.env.example backend/.env`
   - En `backend/.env`, pon `SKIP_DB_INIT=1`
2) Backend
   - `cd backend && npm install`
   - `npm run start` (o `npm run dev`)
   - API: `http://localhost:4000`
3) Frontend
   - `cd frontend && npm install`
   - `npm run dev`
   - App: `http://localhost:5173`

## Conectar a PostgreSQL (persistencia real)
1) Crea DB/usuario (ejemplo rápido en psql):
   - `CREATE DATABASE facturas;`
   - `CREATE USER facturas_user WITH PASSWORD 'TuClaveSegura123';`
   - `GRANT ALL PRIVILEGES ON DATABASE facturas TO facturas_user;`
2) Configura `backend/.env`:
   - `SKIP_DB_INIT=0`
   - `DATABASE_URL=postgres://facturas_user:TuClaveSegura123@localhost:5432/facturas`
3) Arranca backend (`npm run start`). Las tablas se crean automáticamente.

## Funcionalidades
- Login (mock): pantalla inicial para entrar (aún sin auth real).
- Menú principal (izquierda):
  - Crear factura
  - Ver facturas
  - Rendición (crear y ver)
  - Cerrar sesión
- Crear factura:
  - Campos: Día (selector), Fecha, Conductor‑XP, Camión, Vueltas, N° factura (guía), Ruta, KG, Carga (Seco/Refrigerado/Congelado/No aplica), Estado, Observaciones y Cliente (Brival/Nutrisco/Carnicero/Gourmet).
  - Adjuntar hasta 5 archivos (.png/.jpg/.jpeg/.pdf).
- Ver facturas:
  - Filtros (en orden): Cliente, Fecha (una), Guía (N° factura), Búsqueda general.
  - Lista prioriza: Fecha, N° factura, Conductor, Ruta, Estado (con colores), Archivos, Acciones.
  - Previsualización inline de imágenes/PDF y descarga directa.
  - Edición de factura en modal y “Historial” de cambios con diffs.

- Rendiciones:
  - Crear rendición (fecha, chofer, camión, número de pedido, número y valor de factura, condición de pago, total, observaciones).
  - Listado con filtros por fecha/chofer y búsqueda general.
  - Edición habilitada para roles admin/editor; viewer solo lectura.

- Status de rutas (24h):
  - Listado de estados de rutas (últimas 24 horas) con edición manual.
 - Limpieza automática en backend de registros con más de 24 horas.

## Endpoints útiles
- `GET /api/health` → estado de la API.
- `POST /api/facturas` → crear (multipart/form-data con `archivos`).
- `GET /api/facturas?cliente=&fecha=&guia=&q=&limit=&offset=` → listar con filtros.
- `PUT /api/facturas/:id` → editar y registrar historial.
- `GET /api/facturas/:id/historial` → ver diffs de cambios.
- `GET /files/:filename` → descargar archivo.
- `GET /files/inline/:filename` → previsualizar archivo.
- Rendiciones
  - `POST /api/rendiciones` → crear (admin/editor)
  - `GET /api/rendiciones?fecha=&chofer=&q=&limit=&offset=` → listar (auth)
  - `PUT /api/rendiciones/:id` → editar (admin/editor)
  - `GET /api/rendiciones/export?fecha=&chofer=&q=` → exportar CSV (auth)
 - Rutas (status 24h)
 - `GET /api/rutas/status` → listar últimos 24h (auth)
  - `POST /api/rutas/status` → crear status (admin/editor)
  - `PUT /api/rutas/status/:id` → editar ruta/status (admin/editor)
  - `DELETE /api/rutas/status/:id` → eliminar status (admin/editor)
- Solo modo sin DB: `DELETE /api/__dev/reset` → borra datos en memoria y archivos subidos.

## Configuración relevante
- CORS: `CORS_ORIGIN=http://localhost:5173` (en `backend/.env`).
- Vite proxy: `/api` → `http://localhost:4000` (en `frontend/vite.config.js`).
- Subidas: `backend/uploads/` (ignorado por git).
- CAPTCHA (opcional):
  - Backend: en `backend/.env` configura `CAPTCHA_ENABLED=1`, `CAPTCHA_PROVIDER=turnstile`, `CAPTCHA_SECRET=<secret>`.
  - Frontend: crea `frontend/.env` con `VITE_TURNSTILE_SITE_KEY=<site_key>`.
  - El Login enviará el `captchaToken` y el backend lo verificará con Cloudflare Turnstile.

## Comandos habituales
- Backend
  - `cd backend && npm run start` → modo normal
  - `cd backend && npm run dev` → con watch
- Frontend
  - `cd frontend && npm run dev` → desarrollo
  - `cd frontend && npm run build && npm run preview` → revisar build

## Problemas comunes
- “Estado API: sin conexión” en el front:
  - El backend no inició o puerto distinto. Revisa `npm run start` en `backend/` y `http://localhost:4000/api/health`.
  - Cambiaste el puerto del front: actualiza `CORS_ORIGIN` en `.env`.
- Error DB al iniciar:
  - Usa modo demo (`SKIP_DB_INIT=1`) o corrige `DATABASE_URL`/credenciales.
- Archivos subidos en git:
  - Ya ignorados con `**/uploads/`. Si quedaron trackeados: `git rm --cached -r backend/uploads` y commit.

## Próximos pasos sugeridos
- Autenticación real (JWT) y roles (admin vs clientes), con rutas protegidas.
- Validaciones de negocio y permisos por cliente.
- Paginación/descarga de reportes.
