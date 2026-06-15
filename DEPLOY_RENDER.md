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

## Cold start en plan gratis (carátula de Render)

Mientras el tráfico vaya **directo** al Web Service dormido en Render, su infraestructura puede mostrar una pantalla propia **antes** de que Express entregue `public/index.html`. Eso **no se elimina** solo con código en Node.

**Opción recomendada (sin subir plan y sin pings externos):** poner **Cloudflare Worker** delante del dominio (ej. `control.logitec.com.mx`): el Worker responde **al instante** en `GET /` con tu carátula HTML embebida; el navegador hace `fetch('/health')` y el Worker reenvía a Render, lo que **despierte el servicio** mientras el usuario ya ve marca Logitec.

Archivo listo para adaptar y desplegar: `edge/warm-edge-worker.js`. Secretos en Worker:

- `ORIGIN_URL`: URL base del servicio en Render (`https://…onrender.com`, sin slash final opcional).

Tras crear el Worker, apunta DNS del hostname (registro recomendado: **proxied**, naranja en Cloudflare) al Worker según documentación actual de rutas Workers.

Tu app ya incluye también `public/index.html` + `public/boot.js` para quien llegue cuando el proceso Node ya está arriba; el Worker cubre la ventana donde Render aún no enruta a tu app.

### Pasos rápidos (hoy mismo, gratis, efecto “nunca carátula Render” en tu dominio)

**Qué logras:** quien entra por `https://control.logitec.com.mx/` **siempre** ve primero **solo** la pantalla Logitec (HTML servido por Cloudflare). El “despertar” de Render ocurre cuando el navegador pide `/health` y el Worker reenvía eso a tu URL `*.onrender.com`. El usuario **no** abre Render a pelo en el primer HTML.

**Requisito:** el dominio (o al menos la zona DNS de `logitec.com.mx`) debe estar en **Cloudflare** (nameservers de Cloudflare en el registrador). Sin eso no puedes colgar el Worker en ese hostname.

1. Copia tu URL exacta del servicio en Render, ejemplo `https://TU-SERVICIO.onrender.com` (solo eso sirve como destino).
2. En Render → Web Service → **Custom Domains**: **quita** `control.logitec.com.mx` y `www.control…` si están ahí (evita conflicto DNS). El servicio debe seguir accesible por `*.onrender.com`.
3. Cuenta **Cloudflare** (gratis) → **Workers & Pages** → Create → sube el archivo `edge/warm-edge-worker.js` (o despliega con Wrangler desde la carpeta `edge/`).
4. En el Worker → **Settings → Variables**: variable/secreto **`ORIGIN_URL`** = tu `https://TU-SERVICIO.onrender.com` (sin `/` final).
5. En el mismo Worker → **Triggers / Custom domains** → agrega **control.logitec.com.mx** (y si usan equipo con `www`, también **www.control.logitec.com.mx**).
6. En Cloudflare DNS: registros tipo **proxied** (nube naranja) para esos nombres, apuntando como indique el asistente del Worker (suele ser automático al agregar el dominio al Worker).
7. Prueba en incógnito: abre `https://control.logitec.com.mx/` → debe verse **solo** Logitec; luego debe pasar a login o dashboard.
8. **Regla para el cliente:** no compartan el link `*.onrender.com`; solo el dominio `control…`. Si alguien entra directo a `onrender.com`, Render puede mostrar cosas suyas (eso ya no es “tu puerta de entrada” oficial).

**CLI (opcional):** desde el repo, carpeta `edge/`: `npx wrangler deploy` y luego `npx wrangler secret put ORIGIN_URL`. Ver `edge/wrangler.toml`.

**El lunes** al subir plan en Render el servicio dejará de dormir; puedes **mantener** el Worker igual (sigue mostrando tu carátula al instante) o simplificar DNS más adelante.
