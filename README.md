# Logitec WMS - MVP Base

Backend inicial para el sistema de control operativo de almacen de Logitec (3PL), con enfoque en entrega rapida y arquitectura escalable.

## Arquitectura general propuesta

- **Estilo**: API REST modular (monolito modular en Fase 1).
- **Capas**:
  - `modules`: reglas de negocio por dominio (`auth`, `users`, `comments`).
  - `middlewares`: autenticacion, autorizacion y manejo de errores.
  - `db`: acceso a datos con Prisma.
  - `config`: validacion centralizada de configuracion.
- **Escalabilidad futura**:
  - Separacion natural por modulos facilita extraer microservicios si se requiere.
  - Modelo de comentarios preparado para asociar entidades futuras (`entityType`, `entityId`).
  - JWT + RBAC reutilizable en modulos de inventario, recepcion, picking y trazabilidad.

## Modelo de datos inicial

### Tabla `users`
- `id` (PK)
- `email` (UNIQUE)
- `passwordHash`
- `fullName`
- `role` (`ADMIN` | `OPERATOR` | `CLIENT`)
- `isActive`
- `createdAt`
- `updatedAt`

### Tabla `comments`
- `id` (PK)
- `body`
- `entityType` (nullable, para extension)
- `entityId` (nullable, para extension)
- `userId` (FK -> `users.id`)
- `createdAt`
- `updatedAt`

## Estructura del proyecto

```txt
logitec-wms/
  prisma/
    schema.prisma
    seed.ts
  src/
    config/env.ts
    db/prisma.ts
    middlewares/
      auth.middleware.ts
      error.middleware.ts
    modules/
      auth/auth.routes.ts
      users/users.routes.ts
      comments/comments.routes.ts
    shared/http-error.ts
    app.ts
    server.ts
```

## Endpoints MVP implementados

- `POST /api/auth/login` - login por email y contrasena.
- `GET /api/auth/me` - datos del usuario autenticado.
- `POST /api/users` - crear usuario (**solo ADMIN**).
- `GET /api/users` - listar usuarios (**solo ADMIN**).
- `POST /api/comments` - crear comentario (todos los roles).
- `GET /api/comments` - listar comentarios con filtro opcional `entityType/entityId`.
- `GET /health` - health check.

## Reglas de acceso actuales

- `ADMIN`: control total sobre usuarios + comentarios.
- `OPERATOR`: comentarios + endpoints autenticados permitidos.
- `CLIENT`: solo lectura base autenticada + comentarios.

## Levantar el backend

1. Copiar variables:
   - `cp .env.example .env` (o crear `.env` manualmente en Windows)
  - Local (`NODE_ENV=development`): `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/logitec_wms?schema=public"`
2. Instalar dependencias:
   - `npm install`
3. Generar cliente y migrar:
   - `npm run prisma:generate`
   - `npm run prisma:migrate -- --name init`
4. Cargar admin inicial:
   - `npm run db:seed`
5. Ejecutar API:
   - `npm run dev`

Credenciales admin seed:
- email: `admin@logitec.local`
- password: `Admin1234`

## Propuesta de frontend basico (mobile-first)

- **Stack sugerido**: Next.js + Tailwind + React Query.
- **Pantallas Fase 1**:
  - Login
  - Dashboard operativo (resumen rapido)
  - Usuarios (solo admin)
  - Comentarios (timeline global + por entidad)
- **Patron UI**:
  - Header compacto + navegacion por tabs inferiores en mobile.
  - Componentes reutilizables: `DataCard`, `TimelineComment`, `RoleGuard`.

## Siguiente iteracion recomendada

1. Modulo de productos + lotes.
2. Movimientos de inventario con actor obligatorio.
3. Recepcion con validacion de orden de compra y recepcion parcial.
4. Trazabilidad por eventos auditables.
