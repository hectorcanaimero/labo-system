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

Instancia: **https://cooly.usebot.chat** (corre en el mismo VPS, detrás de
Traefik/`coolify-proxy`). El servidor registrado es `localhost`.

El repo `hectorcanaimero/labo-system` es **público**, así que no hace falta
instalar la GitHub App: alcanza con la fuente *Public Repository*.

1. Entrar al proyecto **My first project** → entorno **production**
   (o crear un proyecto nuevo, p. ej. `labo-system`).
2. **+ New Resource → Public Repository**.
3. Repository URL: `https://github.com/hectorcanaimero/labo-system`
   - Branch: **`staged`**
   - Build Pack: **Docker Compose** (no Nixpacks: el monorepo pnpm necesita
     el Dockerfile propio)
   - Base directory: `/`
   - Docker Compose location: `/docker-compose.staged.yml`
4. Guardar. Coolify parsea el compose y detecta el servicio `web` (puerto 3000)
   junto con las variables `${...}` que hay que completar.
5. En **Domains**, asignar el dominio de staging al servicio `web`. La variable
   `SERVICE_FQDN_WEB_3000` del compose es la que hace que Coolify publique ese
   puerto por el proxy.

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

### Opción A — webhook manual de Coolify

Sirve con la fuente *Public Repository*, pero el webhook hay que pegarlo a
mano: la creación automática en GitHub sólo la hace Coolify cuando el origen
es una GitHub App instalada, y acá no lo es.

1. En el recurso → pestaña **Webhooks**, copiar la *GitHub manual webhook URL*
   y el **Webhook Secret** que muestra al lado.
2. En GitHub: **Settings → Webhooks → Add webhook**
   - Payload URL: la URL copiada
   - Content type: `application/json`
   - Secret: el valor del paso 1
   - Events: *Just the push event*
3. En Coolify, dejar **Auto Deploy** activado.

Coolify filtra por la rama configurada en el recurso (`staged`), así que un
push a otra rama no dispara este deploy.

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

**Recomendada mientras no haya GitHub App instalada**: no depende de pegar
secretos en dos lados, el deploy queda encadenado al historial de Actions y se
puede condicionar a que CI pase antes. Si se usan A y B a la vez, cada push
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

## 5. Scheduled Task del scrape de tasa BCV (F7.5.T1)

Verificado en el repo, pendiente de confirmar en el panel de Coolify de
producción (esta sesión no tiene acceso al panel).

- **Qué debe existir**: una *Scheduled Task* en la aplicación `labo-web` de
  Coolify llamada `scrape-bcv-hourly` que llama a
  `POST /api/cron/scrape-bcv` con el header `x-cron-secret: $CRON_SECRET`,
  cada hora en punto de 06:00 a 20:00 VET (15 disparos/día). El paso a paso
  completo — comando exacto, expresión cron según el `TZ` del contenedor, y
  cómo leer las respuestas (`success`, `skipped` por outlier, `401`, `500`) —
  está en `docs/deploy/insforge-vps.md`, sección "Scrape horario de la tasa
  BCV". No se duplica acá para no desincronizar los dos documentos.
- **Por qué importa**: durante las pruebas del cliente la tasa quedó
  desactualizada; la auditoría en producción mostró dos
  `tasa.setFromScraper` casi seguidos (dos clics manuales en "Actualizar
  desde BCV"), no una cadencia horaria — indicio de que la Scheduled Task no
  estaba corriendo, o nunca se creó.
- **Pendiente del usuario**: entrar a Coolify → `labo-web` → **Scheduled
  Tasks** y confirmar que `scrape-bcv-hourly` existe, está activa y tiene
  "Last Run" reciente. Si no existe, crearla siguiendo el paso a paso de
  `insforge-vps.md`. El criterio de aceptación de F7.5.T1 ("la tasa se
  actualiza sola cada hora durante un día completo") sólo se puede verificar
  ahí, no desde el código.

## 6. Persistencia de archivos (logo/firma/sello) — qué necesita cada entorno

F7.6.T2: el usuario reportó que el logo/firma/sello subidos en
Configuración "se pierden". El almacenamiento local
(`packages/lib/storage-local.ts`) guarda esos archivos en
`STORAGE_ROOT/assets/...` y sirve el flujo completo `GET
/api/config/assets/url` → `POST /api/config/assets/upload` → `POST
/api/config/assets/set` → lectura por `/api/storage/[bucket]/[...path]`.
El diagnóstico contra este mismo VPS (donde corre el Coolify real del
proyecto) encontró:

- **El upsert de `laboratorio_config` no pisa las claves de asset al
  guardar el formulario principal.** Candidato descartado: `update()`
  (PUT /api/config) nunca incluye `logo_object_key`/`firma_object_key`/
  `sello_object_key` en su payload, y el upsert de PostgREST sólo toca en
  el `ON CONFLICT DO UPDATE SET` las columnas presentes en el payload —
  las omitidas quedan intactas. Cubierto con test
  (`packages/db/repos/config.test.ts`).
- **Bug real encontrado y corregido**: `POST /api/config/assets/set`
  borraba el archivo viejo **antes** de confirmar que la config ya
  apuntaba al nuevo. Si el `upsert` fallaba después del borrado (DB caída,
  timeout), el admin se quedaba sin logo/firma/sello: el viejo ya no
  existía en disco y el nuevo nunca quedó referenciado. Se invirtió el
  orden (`apps/web/app/api/config/assets/set/route.ts`).
- **`STORAGE_ROOT` sin configurar fallaba en silencio.** Si la variable no
  está seteada, el código cae a `<cwd>/.storage` sin avisar — un entorno
  nuevo que se levanta sin copiar la config de staging sube y sirve
  archivos con normalidad hasta el primer redeploy/reinicio, que los borra
  sin dejar rastro. Ahora `storage-local.ts` emite un `console.warn` la
  primera vez que resuelve una key sin `STORAGE_ROOT` seteado, para que
  quede en los logs de arranque.
- **Staging SÍ tiene volumen persistente** (verificado con `docker inspect`
  contra el contenedor real: el volumen `..._labo-staged-storage` está
  montado en `/app/.storage`) y sus env vars (`STORAGE_ROOT`,
  `STORAGE_SIGNING_SECRET`) están seteadas correctamente. El directorio
  está vacío al momento de este diagnóstico y no hay errores de storage en
  los logs de las últimas 72h — no hay evidencia de que el bug de pérdida
  esté activo hoy en staging; lo más probable es que el reporte del
  usuario sea anterior al fix de GUR-16 (`packages/lib/storage-local.ts`,
  ver el comentario "ponytail"/"Ceiling" ahí) y a un archivo que ya no se
  puede recuperar, no una pérdida en curso.
- **Producción no tenía NADA preparado.** No existía `docker-compose.yml`
  ni volumen para el entorno de `main` — sólo `docker-compose.staged.yml`.
  Se agregó `docker-compose.production.yml` (mismo servicio, volumen
  propio `labo-production-storage` para que nunca comparta archivos con
  staging aunque corran en el mismo host).

### Qué necesita cada entorno

| Entorno | Compose | Volumen | `STORAGE_ROOT` | `STORAGE_SIGNING_SECRET` |
| --- | --- | --- | --- | --- |
| Staging | `docker-compose.staged.yml` | `labo-staged-storage` | `/app/.storage` (ya seteado en el compose) | Cargar en Coolify, ≥32 caracteres (`openssl rand -hex 32`) |
| Producción | `docker-compose.production.yml` (nuevo) | `labo-production-storage` | `/app/.storage` (ya seteado en el compose) | Cargar en Coolify — **un secreto propio, no reusar el de staging** |
| Local (sin Docker) | — | carpeta `.storage/` en el repo (gitignored) | opcional; default `<cwd>/.storage` | obligatorio en `.env.local`, ≥32 caracteres |

Pendiente del usuario (esta sesión no tiene acceso al panel de Coolify):
en el recurso de **producción**, cambiar el "Docker Compose location" a
`/docker-compose.production.yml` si todavía apunta al de staging o no
está configurado, y cargar un `STORAGE_SIGNING_SECRET` propio. Verificado
en este VPS que hoy sólo hay un contenedor de labo-system corriendo
(staging); producción parece no estar desplegada todavía — confirmar
antes de asumir que ya sirve tráfico real.

### Verificación reproducible

1. `pnpm turbo run test` — corre `packages/lib/storage-local.test.ts`
   (guarda/lee/borra un objeto, firma y verifica una URL) y
   `packages/lib/storage-local.warn.test.ts` (el aviso de `STORAGE_ROOT`
   faltante sale una sola vez por proceso) y `packages/db/repos/config.test.ts`
   (el upsert de config nunca pisa las claves de asset).
2. Manual, en cualquier entorno con Docker: `docker compose -f
   docker-compose.staged.yml up --build`, subir un logo desde Configuración,
   `docker compose down` (sin `-v`) y volver a levantar: el logo sigue. Con
   `docker compose down -v` (borra el volumen) el logo desaparece — es el
   comportamiento esperado, confirma que la persistencia depende del volumen
   y no de la imagen.

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
