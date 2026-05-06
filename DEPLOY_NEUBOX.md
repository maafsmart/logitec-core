# Deploy en Neubox (`contro.logitec.com.mx`)

Esta guia deja el sistema corriendo en nube con Node.js + SQLite para pruebas iniciales. Para produccion formal se recomienda migrar a PostgreSQL.

## 1) Prerequisitos en Neubox

- Plan con soporte **Node.js** (si es hosting compartido sin Node, no funcionara este backend).
- Acceso a:
  - Administrador DNS del dominio
  - Panel de subdominios
  - SSH/SFTP
  - Configuracion de procesos Node (Passenger, PM2, o equivalente)

## 2) Crear subdominio

Crear subdominio:

- `contro.logitec.com.mx`

Apuntarlo al directorio de app, por ejemplo:

- `/home/USUARIO/apps/logitec-wms`

## 3) Subir proyecto

Subir todo el proyecto (excepto `node_modules`) a:

- `/home/USUARIO/apps/logitec-wms`

## 4) Configurar variables de entorno

Crear archivo `.env` en servidor:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/logitec_wms?schema=public"
JWT_SECRET="cambia-esto-por-un-secreto-largo-y-seguro"
```

> Importante: si usas SQLite, asegúrate de permisos de escritura en carpeta `prisma/`.

## 5) Instalar y compilar

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run build
```

## 6) Ejecutar app

Si Neubox soporta comando de inicio Node:

```bash
npm run start
```

Si requiere PM2:

```bash
npm install -g pm2
pm2 start dist/server.js --name logitec-wms
pm2 save
```

## 7) Reverse proxy / puerto

Configurar proxy del subdominio hacia:

- `http://127.0.0.1:3000`

Con esto, el acceso publico queda en:

- `https://contro.logitec.com.mx/login.html`

## 8) Validacion post-deploy

1. Abrir `https://contro.logitec.com.mx/login.html`
2. Login con:
   - `admin@logitec.local`
   - `Admin1234`
3. Verificar dashboard y modulo usuarios.
4. Probar cambio de contraseña en "Mi cuenta".

## 9) Si Neubox no soporta Node.js

Opciones:

1. Migrar backend a VPS Neubox (recomendado).
2. Dejar frontend en Neubox y backend en Render/Railway/Fly.io.
3. Apuntar `contro.logitec.com.mx` al proveedor que sí soporte Node.
