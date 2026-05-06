# Deploy estable en Render (PostgreSQL)

## Variables de entorno (Web Service)

- `NODE_ENV=production`
- `DATABASE_URL=postgresql://<render-db-url>`
- `JWT_SECRET=<secreto-largo>`
- `PORT` no hardcodeado (Render lo inyecta)

## Build Command

```bash
npm install && npx prisma generate && npm run build
```

## Start Command

```bash
npx prisma migrate deploy && node dist/server.js
```

## Flujo recomendado

1. Crear base PostgreSQL en Render (`logitec-db`).
2. Copiar `External Database URL` a `DATABASE_URL` del servicio `logitec-core`.
3. Deploy del servicio.
4. Verificar:
   - `/health`
   - `/login.html`
   - login con usuario bootstrap (si seeded manualmente en entorno no productivo)

## Nota sobre seed

`prisma/seed.ts` está protegido para no ejecutar en `production`.
Si necesitas crear admin en producción, usa un script/admin job controlado.
