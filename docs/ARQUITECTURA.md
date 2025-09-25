# Guía de arquitectura

Este documento resume cómo está organizada la aplicación, sus flujos principales y las decisiones técnicas relevantes para operar y evolucionar el proyecto.

## Visión general

- Monorepo con frontend (React + Vite) y backend (Node.js + Express 5) con PostgreSQL.
- Autenticación con JWT, autorización a nivel de rutas por rol (`admin`, `editor`, `viewer`).
- Subida de archivos con Multer al directorio `backend/uploads/` (imágenes y PDF). Para planillas, se acepta `.xlsx/.xls/.csv`.
- Modo sin base de datos para desarrollo/demos (`SKIP_DB_INIT=1`): datos en memoria que se pierden al reiniciar.

Estructura principal:
- `frontend/`: vistas React, estilos y configuración de Vite.
- `backend/`: API Express, acceso a datos y scripts de mantenimiento.
  - `backend/src/server.js`: rutas, middlewares, almacenamiento de archivos, lógica de negocio.
  - `backend/src/db.js`: conexión Pool a PostgreSQL, creación mínima de tablas e índices, seed básico.
  - `backend/uploads/`: adjuntos y documentos (ignorados por git).
  - `backend/scripts/`: utilidades (stress/cleanup).

## Configuración y variables de entorno

Archivo de ejemplo: `backend/.env.example`.

- Servidor: `PORT`, `CORS_ORIGIN`.
- DB: `DATABASE_URL` o `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`.
- Sin DB: `SKIP_DB_INIT=1` activa modo memoria.
- Auth/JWT: `JWT_SECRET`, `JWT_EXPIRES_IN`.
- Seed admin: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (se usa si no hay usuarios en la tabla).
- CAPTCHA (opcional): `CAPTCHA_ENABLED`, `CAPTCHA_PROVIDER` (`turnstile|recaptcha|simple`), `CAPTCHA_SECRET`.
  - Frontend: `frontend/.env` con `VITE_TURNSTILE_SITE_KEY` o `VITE_RECAPTCHA_SITE_KEY`.

Vite proxy (dev): `/api`, `/auth`, `/admin`, `/files` apuntan a `http://localhost:4000` (ver `frontend/vite.config.js`).

## Autenticación y autorización

- `POST /auth/login` verifica credenciales contra la tabla `users` (o bloquea en modo sin DB) y retorna un JWT.
- Middleware `authMiddleware` lee `Authorization: Bearer <token>` y deja `req.user` si el token es válido.
- `requireAuth`, `requireRole('admin')`, `requireRoles(['admin','editor'])` protegen rutas.
- CAPTCHA opcional antes del login: `turnstile`, `recaptcha` o `simple` (suma A+B firmada con JWT).

## Persistencia y datos

Tablas principales (resumen):

- facturas: cabecera de factura pendiente (cliente, fecha, guía, conductor, ruta, estado, etc.).
- factura_archivos: archivos por factura (filename, mimetype, size). Cascade al borrar factura.
- factura_historial: cambios por factura (JSONB con diffs, timestamp).
- resguardos: inventario de productos/resguardos, con fechas de ingreso/salida y campos de apoyo.
- resguardo_archivos: imágenes por resguardo.
- rendiciones: resumen de ventas/gastos por día/chofer/camión (campos administrativos opcionales).
- ruta_status y ruta_status_historial: status de rutas (texto libre) y su historial.
- camiones, camion_documentos, camion_bajas: flota y documentos asociados; registro de bajas.
- mantenciones: mantenciones de camiones (preventivo/urgente) e intervalo de días.
- proveedores, ordenes, orden_documentos: soporte a órdenes de trabajo.
- planificaciones: cabecera + `rows` (JSONB) con data importada desde Excel/CSV; versión y timestamps.
- users: usuarios (email, password_hash, role, active).
- clients: clientes (seed inicial: Brival, Nutrisco, Carnicero, Gourmet).
- drivers: conductores/peonetas (nombre, apellido, rut, rol, active).

Notas:
- `backend/src/db.js` crea estas tablas si no existen (migración mínima en runtime) y añade índices útiles para filtros.
- En producción, conviene un sistema formal de migraciones.

## Backend (API)

Archivo: `backend/src/server.js`.

Middlewares y utilidades:
- CORS (`CORS_ORIGIN`), `express.json()`, `express.urlencoded()`.
- Multer para subir archivos a `backend/uploads/`.
- JWT y helpers `authMiddleware`, `requireAuth`, `requireRole(s)`.
- Verificación de CAPTCHA (si habilitado).

Módulos de rutas:
- Auth: `/auth/login`, `/auth/captcha` (simple)
- Administración: `/admin/users`, `/admin/clients`, `/admin/drivers`
- Clientes (para selects): `/api/clients`
- Facturas: crear/listar/editar/historial/eliminar/exportar/bulk-delete
- Resguardos (inventario): crear/listar/editar/eliminar/exportar
- Rendiciones: crear/listar/editar/eliminar/exportar
- Rutas (status): listar/historial/crear/editar/eliminar/generar set por defecto
- Planificaciones: importar Excel→JSON, guardar/listar/editar/eliminar, exportar CSV, stats/analyze
- Camiones: listar/crear (con documentos)/editar/eliminar (con motivo)
- Mantenciones: crear/listar/vencidos (due)
- Proveedores y Órdenes: listar/crear
- Archivos: `/files/:filename` (descarga) y `/files/inline/:filename` (preview)

Modo sin DB (`SKIP_DB_INIT=1`):
- Se usan arreglos en memoria (ej. `memFacturas`, `memResguardos`, …); los datos se pierden al reiniciar.
- Los endpoints mantienen la misma forma de respuesta (JSON { ok, data/message }).

Convenciones de respuesta:
- JSON con `{ ok: boolean, data?: any, message?: string }` y códigos HTTP estándar.

## Frontend (React)

Estructura general:
- `src/App.jsx`: contenedor raíz, navegación por estado (`view`), manejo de sesión (JWT en localStorage) y entrega de `getAuthHeaders()` a páginas.
- `src/pages/*`: vistas con componentes autocontenidos para crear/listar/editar datos y subir archivos.
- `vite.config.js`: proxy de rutas hacia el backend en desarrollo.

Flujos visibles:
- Login con captura de JWT y rol, opcional CAPTCHA.
- Facturas: formulario (FormData con evidencias), listado con filtros y edición con historial, export CSV.
- Resguardos: alta con imágenes, listado con filtros, edición, export CSV y preview.
- Rendiciones: creación/listado/edición/export.
- Rutas: listado 24h, historial, copiar/compartir, CRUD.
- Planificaciones: importar Excel/CSV (servidor parsea y normaliza), análisis en vivo y guardado en DB.

## Seguridad y consideraciones

- Autorización por roles en rutas críticas (admin/editor para escritura, viewer lectura).
- CORS restringido por `CORS_ORIGIN`.
- Subidas limitadas por tamaño/tipo de archivo. Recomendación: antivirus y almacenamiento externo en producción.
- SQL parametrizado en todas las queries (`$1, $2, …`).
- Bulk-delete de facturas exige filtros para evitar borrados accidentales.

## Observabilidad y salud

- `GET /api/health` y `GET /api/health/db` para checks básicos.
- Logs de servidor con contexto por endpoint al capturar errores.

## Scripts de apoyo

- Stress: `node backend/scripts/stress_facturas.mjs [count]` → crea muchas facturas (requiere admin). Variables: `BASE_URL`, `STRESS_CONCURRENCY`.
- Cleanup planificaciones: `node backend/scripts/cleanup_planificaciones.mjs [--drop]` → borra filas o tabla.
- Cleanup stress: `node backend/scripts/cleanup_stress.mjs` → elimina facturas generadas por stress (guía prefijo `ST-`).

## Desarrollo y despliegue

Desarrollo local:
- Frontend: `cd frontend && npm install && npm run dev` (Vite abre `http://localhost:5173`).
- Backend: `cd backend && npm install && npm run start` (API en `http://localhost:4000`).
- Sin DB: `SKIP_DB_INIT=1` (datos volátiles en memoria).

Producción (resumen):
- Define `DATABASE_URL` y credenciales seguras; `SKIP_DB_INIT=0`.
- Ajusta `CORS_ORIGIN` con el dominio del frontend.
- Considera almacenamiento de archivos fuera del contenedor (volúmenes o servicios tipo S3/GCS).
- Añade un sistema de migraciones y backups periódicos de la base de datos.

## Decisiones y futuras mejoras

- Migraciones formales (Prisma/Knex/Flyway) en lugar de creación runtime.
- Almacenamiento de archivos en S3/GCS + verificación antivirus.
- Paginación/ordenamiento consistente en todos los listados (ya hay soporte básico en facturas).
- Tests de integración para rutas críticas (auth, facturas CRUD, exportaciones).

