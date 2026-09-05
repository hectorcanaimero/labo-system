# Staging en Coolify — rama `staged` con auto-deploy

Objetivo: cada push o merge a la rama **`staged`** publica automáticamente el
código en el entorno de staging, corriendo `next dev` (Next.js en modo
desarrollo) dentro de Docker.

El "git pull" no lo hace un script propio: lo hace Coolify. Al recibir el
webhook, Coolify clona la rama `staged` en el commit más reciente, reconstruye
la imagen y reemplaza el contenedor. Es el equivalente a un pull + restart,
pero sin estado sucio entre despliegues.

```
push/merge → GitHub  ──webhook──►  Coolify  ──clone staged + docker build──►  contenedor `next dev`
```

El Coolify de este proyecto corre en el propio VPS (`coolify` v4.3.x detrás de
`coolify-proxy`/Traefik, panel en el puerto `8000`).

## Piezas en el repo

| Archivo                             | Para qué sirve                                                        |
| ----------------------------------- | --------------------------------------------------------------------- |
| `Dockerfile.dev`                    | Imagen de staging: instala el monorepo y arranca `next dev` en :3000.  |
| `docker-compose.staged.yml`         | Definición del servicio `web` para el deploy tipo Docker Compose.      |
| `.github/workflows/deploy-staged.yml` | Llama al webhook de deploy de Coolify en cada push a `staged`.       |
| `.dockerignore`                     | Evita copiar `node_modules`, `.next`, `.git` y secretos a la imagen.   |

## 1. Crear el recurso en Coolify

1. **New Resource → Docker Compose** (no "Nixpacks": el monorepo pnpm necesita
   el Dockerfile propio).
2. Source: repositorio `hectorcanaimero/labo-system`.
   - Branch: **`staged`**
   - Base directory: `/`
   - Docker Compose location: `docker-compose.staged.yml`
3. Guardar. Coolify detecta el servicio `web` y el puerto `3000`.
4. En **Domains**, asignar el dominio de staging al servicio `web`
   (p. ej. `staging.rvlaboratorio.com`). La variable `SERVICE_FQDN_WEB_3000`
   del compose es la que hace que Coolify publique ese puerto por el proxy.

## 2. Variables de entorno

En **Environment Variables** del recurso, cargar estas claves apuntando a la
instancia de staging.

**Obligatorias — sin ellas la app responde 500 en la primera render.**
`apps/web/app/providers.tsx` lanza si falta cualquiera de las dos:

```
NEXT_PUBLIC_INSFORGE_URL=
NEXT_PUBLIC_INSFORGE_ANON_KEY=   # ← distinta de INSFORGE_ANON_KEY; mismo valor
```

Server-side:

```
INSFORGE_URL=
INSFORGE_ANON_KEY=
INSFORGE_API_KEY=        # secreto: API key admin (ik_...)
DATABASE_URL=
CRON_SECRET=
STORAGE_SIGNING_SECRET=  # mínimo 32 caracteres: openssl rand -hex 32
```

Opcionales (tienen default en código): `NEXT_PUBLIC_APP_URL`,
`BCV_MAX_CHANGE_RATIO`, `AI_OBSERVACIONES_ENABLED`,
`NEXT_PUBLIC_AI_OBSERVACIONES_ENABLED`, `GEMINI_API_KEY`.

`STORAGE_ROOT` ya viene fijado en el compose a `/app/.storage`, montado sobre
el volumen `labo-staged-storage`. No cambiarlo sin mover el volumen: los
archivos subidos se perderían en el siguiente redeploy.

Como la imagen corre `next dev`, las variables `NEXT_PUBLIC_*` se evalúan en
cada arranque del contenedor: para cambiarlas basta reiniciar, no hace falta
reconstruir.

> Ojo: **no** apuntar staging a la base de datos de producción. Los endpoints
> de cron y el export escriben con la API key admin.

## 3. Activar el auto-deploy (el webhook)

Hay dos formas; con una alcanza.

### Opción A — webhook nativo de Coolify (recomendada)

1. En el recurso → pestaña **Webhooks**, copiar la *GitHub deploy webhook URL*.
2. En GitHub: **Settings → Webhooks → Add webhook**
   - Payload URL: la URL copiada
   - Content type: `application/json`
   - Secret: el mismo valor que Coolify muestra en **Webhook Secret**
   - Events: *Just the push event*
3. En Coolify, dejar **Auto Deploy** activado.

Coolify filtra por la rama configurada en el recurso (`staged`), así que un
push a `main` no dispara este deploy.

### Opción B — desde GitHub Actions

Ya está el workflow `.github/workflows/deploy-staged.yml`. Requiere dos
secrets en **Settings → Secrets and variables → Actions**:

| Secret                | Valor                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| `COOLIFY_WEBHOOK_URL` | `https://<coolify>/api/v1/deploy?uuid=<uuid-del-recurso>&force=false`  |
| `COOLIFY_TOKEN`       | API token de Coolify (**Keys & Tokens → API tokens**, permiso deploy). |

El workflow corre en `push` a `staged` — un merge de PR hacia `staged` genera
ese mismo push, así que cubre los dos casos — y también se puede lanzar a mano
con **Run workflow** (`workflow_dispatch`).

Ventaja de la opción B: el deploy queda encadenado al historial de Actions y
se puede condicionar a que CI pase antes. Si se usa A y B a la vez, cada push
dispara dos deploys.

## 4. Verificar

```bash
# El primer build tarda varios minutos (instala todo el monorepo).
curl -I https://staging.rvlaboratorio.com/
```

Smoke test hecho sobre esta misma configuración (imagen construida desde
`Dockerfile.dev` y contenedor levantado a mano):

```
GET / → 200
healthcheck → healthy
▲ Next.js 14.2.35 · Ready in 2.7s
```

En Coolify, **Logs** del servicio `web` debe mostrar:

```
▲ Next.js 14.2.x
- Local:   http://0.0.0.0:3000
✓ Ready in …
```

## Notas y limitaciones

- **`next dev` no es para producción.** Sirve páginas sin optimizar, expone
  overlays de error y consume bastante más RAM y CPU. Es una decisión
  deliberada para staging: los errores se ven completos y el código desplegado
  es idéntico al de la rama. Producción debe usar `next build` + `next start`.
- **Sin hot reload entre despliegues.** El código vive dentro de la imagen, no
  en un volumen del host: cada push reconstruye y reinicia. El HMR sólo aplica
  dentro de una misma sesión del contenedor.
- **`pnpm install --no-frozen-lockfile`** en el Dockerfile es intencional:
  `pnpm-lock.yaml` incluye los workspaces `scripts/migrate-wp` y
  `scripts/spike-s1-bcv`, pero `scripts/` está en `.gitignore`, así que un
  clone limpio no los tiene y `--frozen-lockfile` abortaría el build.
- **Migraciones.** El contenedor no las corre. Aplicarlas como indica
  `docs/deploy/insforge-vps.md` antes o después del deploy, según el cambio.
