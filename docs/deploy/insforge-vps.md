# Deploy InsForge en VPS

> ⚠️ **DESACTUALIZADO — producción ya NO usa InsForge self-hosted.**
> Hoy corre sobre **InsForge Cloud** (`INSFORGE_URL` en Coolify apunta a
> `https://<instancia>.us-east.insforge.app`), y `insforge.rvlaboratorio.com`
> no responde. Todo lo de esta doc que hable del stack Docker Compose, puertos
> o `docker-compose.override.yml` es histórico. Lo que **sí** sigue vigente es
> la sección [Tareas Programadas (Cron)](#tareas-programadas-cron): los cron
> pegan contra los Route Handlers de **Next.js**, que corren en Coolify
> (`labo-web` → `https://rvlaboratorio.com`), no contra InsForge.

> ADR-11: pivot Convex → InsForge self-hosted. Alcance funcional intacto,
> otra plataforma. Esta doc describe la instancia de producción y cómo operarla.

## Instancia

| Qué             | Valor                                        |
| --------------- | -------------------------------------------- |
| URL             | `https://insforge.rvlaboratorio.com` (dado de baja) |
| Dashboard       | `https://insforge.rvlaboratorio.com/dashboard` (dado de baja) |
| Versión         | `2.3.1` (`Insforge OSS Backend`)             |
| Hosting         | VPS propio, Docker Compose (dado de baja)    |
| Edge            | Cloudflare proxyeando el dominio             |

## Health check

El endpoint correcto es **`GET /api/health`** — ojo, `GET /health` a secas
responde 404 (el router lo sirve bajo `/api`). Verificado desde fuera:

```bash
curl https://insforge.rvlaboratorio.com/api/health
# {"status":"ok","version":"2.3.1","service":"Insforge OSS Backend","timestamp":"..."}
```

## Servicios y puertos

El stack tiene 4 servicios (nombres del compose oficial):

| Servicio    | Puerto interno | Expuesto públicamente      |
| ----------- | -------------- | -------------------------- |
| `insforge`  | 7130           | Solo este, vía reverse proxy / Cloudflare |
| `postgres`  | 5432           | No                         |
| `postgrest` | 5430           | No                         |
| `deno`      | 7133           | No                         |

El compose base publica todos los puertos en `0.0.0.0`. El override
[`docker-compose.override.yml`](../../docker-compose.override.yml) de este repo
los rebinda a loopback / los saca. Aplicarlo así:

```bash
docker compose -f <compose-base>.yml -f docker-compose.override.yml up -d
```

Verificación post-deploy y **tras cada reboot** del VPS:

```bash
docker compose ps          # los 4 servicios healthy
ss -tlnp                   # solo :7130 escuchando (además de ssh/proxy)
```

> El chequeo de puertos desde afuera no sirve acá: el dominio resuelve a IPs
> de Cloudflare (172.67.x / 104.21.x), o sea que se testea el edge, no el origen.

## Seguridad

- **TLS**: terminado en Cloudflare; asegurar modo Full (strict) hacia el origin.
- **Admin key** (`ik_...`): NUNCA se versiona ni va al browser. Wiring local
  del MCP de InsForge: definir el server `insforge` en la config **global** de
  opencode (`~/.config/opencode/opencode.json`) o en `.mcp.json` (ignorado por
  git). Cada dev genera su propia credencial desde el dashboard.
- **Anon key** (`anon_...`): sí va al browser; los permisos reales los dan las
  policies. Se obtiene del dashboard o `GET /api/metadata/anon-key`.
- **Credenciales del dashboard** (`ROOT_ADMIN_USERNAME` / `ROOT_ADMIN_PASSWORD`):
  guardarlas en el password manager.

### Backups

```bash
# Backup (desde ~/insforge en el VPS)
docker compose exec postgres pg_dump -U postgres insforge > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
cat backup_file.sql | docker compose exec -T postgres psql -U postgres -d insforge
```

Agendar cron diario del dump y replicar fuera del VPS. El `.env` del stack
(JWT_SECRET, ENCRYPTION_KEY, passwords) respaldarlo también: sin esos secretos
el restore no sirve.

### Actualización

```bash
cd ~/insforge
git pull origin main
sh deploy/setup.sh .   # si la release agrega archivos al checkout
docker compose pull && docker compose up -d
```

Revisar el diff de `.env.example` upstream antes de actualizar.

## Storage

| Bucket    | Visibilidad | Uso                                            |
| --------- | ----------- | ---------------------------------------------- |
| `assets`  | público     | Imágenes y archivos públicos del dominio       |
| `exports` | **privado** | CSV/XLSX con datos del laboratorio — acceso solo por URLs firmadas (~1h), como definió el spike S6 |

La estrategia de acceso (presigned vs direct upload) es **dinámica** según
`S3_USE_PRESIGNED_URLS`: el cliente debe leer la respuesta del backend y no
asumir una forma fija.

### Storage local en el servicio `labo-web` (GUR-16)

Los buckets los sirve `packages/lib/storage-local.ts` desde el filesystem del
contenedor de Next.js. **Dos env vars obligatorias en Coolify**; si faltan, el
upload de logo / firma / sello falla:

| Variable                 | Default              | Qué pasa si falta                                                                 |
| ------------------------ | -------------------- | --------------------------------------------------------------------------------- |
| `STORAGE_ROOT`           | `<cwd>/.storage`     | El default vive dentro del build → **los assets se pierden en cada redeploy**       |
| `STORAGE_SIGNING_SECRET` | — (obligatoria)      | `signDownloadUrl` lanza → `GET /api/config/assets/url` responde 500 y no hay preview |

```bash
# Generar el secreto (mínimo 32 caracteres)
openssl rand -hex 32
```

En producción montar un **volumen persistente** en Coolify (p.ej. `/data/storage`)
y apuntar `STORAGE_ROOT` ahí. En dev local alcanza con el default o
`STORAGE_ROOT=./.storage`.

Diagnóstico rápido: el uploader de `/config` ahora muestra el error que devuelve
el Route Handler (`EACCES`, `ENOENT`, `UNAUTHORIZED`, `ASSET_MIME_INVALIDO`…),
así que el motivo real se lee directo en pantalla.

## Messaging (SMTP)

Configurado con Resend:

| Campo        | Valor                          |
| ------------ | ------------------------------ |
| Host / puerto| `smtp.resend.com:465`          |
| Remitente    | `noreply@rvlaboratorio.com`    |
| Nombre       | Rv Laboratorio                 |
| Verify email | `code`, verificación no requerida al signup |
| Reset password | `code` (built-in InsForge Auth) |

No hace falta `password_reset_tokens` custom: el flujo de reset es nativo.

## Tareas Programadas (Cron)

Para automatizar tareas recurrentes en el VPS, se utiliza el `crontab` del sistema de modo que invoque los Route Handlers de Next.js. Todos estos endpoints están protegidos mediante el header `x-cron-secret` (cuyo valor debe coincidir con `CRON_SECRET`).

### 1. Cleanup semanal de exportaciones (> 7 días)
Borra automáticamente del bucket privado `exports` los archivos vencidos (con una antigüedad mayor a 7 días) y deja una traza detallada en el `audit_log` de Convex.

- **Frecuencia**: Semanal (Todos los domingos a las 03:00 UTC / 23:00 VET del sábado).
- **Línea de crontab recomendada**:
  ```bash
  0 3 * * 0 curl -X POST https://rvlaboratorio.com/api/cron/cleanup-exports -H "x-cron-secret: TU_CRON_SECRET_AQUI" -s > /dev/null
  ```

### Pruebas de ejecución manual
Para forzar o testear el funcionamiento del cleanup manualmente, ejecutá el siguiente comando desde la consola:
```bash
curl -X POST https://rvlaboratorio.com/api/cron/cleanup-exports \
  -H "x-cron-secret: TU_CRON_SECRET_AQUI" \
  -i
```

Si el secret es incorrecto o no se provee, el servidor responderá con un código de estado `401 Unauthorized`.

### 2. Scrape horario de la tasa BCV (06:00 → 20:00 VET, cada hora)

Dispara el scraper `POST /api/cron/scrape-bcv` (Coolify Scheduled Task → Route
Handler). El handler consulta DolarAPI (`ve.dolarapi.com/v1/dolares/oficial`)
con fallback a `/paralelo` (`fuente: "dolartoday"`), persiste en
`tasa_cambio_bcv` y deja traza en `audit_log`. Un fallo total devuelve `200`
con `success: false` (para no disparar reintentos); la alerta de tasa vieja
la cubre F3.3.T4.

- **Frecuencia**: Cada hora en punto, de 06:00 a 20:00 VET (15 disparos/día).
  Venezuela es UTC−4 fijo, sin horario de verano → en UTC son las 10:00 a 00:00
  (medianoche del día siguiente).
- **Expresión cron** (según TZ del contenedor):
  - Contenedor en UTC (default de la imagen Node): `0 10-23,0 * * *`
  - Contenedor con `TZ=America/Caracas`: `0 6-20 * * *`

#### Paso a paso para activarla en Coolify

1. Ir a la aplicación `labo-web` en el panel de Coolify.
2. Solapa **Scheduled Tasks** → **+ Add**.
3. Completar:
   - **Name**: `scrape-bcv-hourly`
   - **Command** (ajustar `PORT` al que exponga tu servicio en Coolify — por
     defecto `next start` usa 3000, pero Coolify puede inyectar otro vía la env
     `PORT`):
     ```bash
     curl -X POST http://localhost:${PORT:-3000}/api/cron/scrape-bcv -H "x-cron-secret: $CRON_SECRET" -s -o /dev/null -w "%{http_code}\n"
     ```
     (corre dentro del contenedor → `localhost` evita salir por Cloudflare y no
     depende del certificado TLS público)
   - **Frequency**: `0 10-23,0 * * *` (asumiendo contenedor en UTC — es lo
     default). Si seteás `TZ=America/Caracas` en las env vars del servicio, usá
     `0 6-20 * * *`.
4. Guardar. Coolify recrea el contenedor y arma la tarea programada.
5. Verificar en la solapa **Scheduled Tasks** que aparece "Last Run" al pasar
   la próxima hora en punto.

> El `curl` corre dentro del contenedor de la web, así que `CRON_SECRET` se
> resuelve desde las env vars del propio servicio — no hay que exponerlo en el
> comando. Si preferís pegar contra el dominio público, cambiá el `localhost` por
> `https://rvlaboratorio.com` (más lento y depende de Cloudflare, pero
> sirve para testear que el path externo esté sano).

#### Pruebas de ejecución manual

Para forzar o testear el scrape manualmente, ejecutá desde cualquier máquina con
acceso al dominio:

```bash
curl -X POST https://rvlaboratorio.com/api/cron/scrape-bcv \
  -H "x-cron-secret: TU_CRON_SECRET_AQUI" \
  -i
```

Respuestas esperadas:

- `200` con `{"success":true,"id":"...","fuente":"bcv","tasa":...}` → scrape OK.
- `200` con `{"success":false,"error":"bcv_scrape_failed",...}` → ambas fuentes
  fallaron; quedó un warning en `audit_log`.
- `200` con `{"success":false,"skipped":true,"reason":"variacion_..."}` → el
  scrape anduvo pero la guarda anti-outlier rechazó el valor: la variación
  contra la última tasa guardada supera `BCV_MAX_CHANGE_RATIO` (default `0.5`).
  Desde GUR-14 la guarda se ignora si la última tasa tiene más de 24h, así que
  esto se destraba solo; si aparece con una tasa fresca, revisar el valor o
  subir `BCV_MAX_CHANGE_RATIO`. Deja traza en `audit_log`
  (`cron.scrape-bcv.failed`, `primary_code: "rejected_outlier"`).
- `401 Unauthorized` → secret faltante o incorrecto. Verificar que `CRON_SECRET`
  esté seteado en las env vars del servicio en Coolify.
- `500 server_misconfigured` → falta `CRON_SECRET` en el contenedor.

Para verificar que corrió, revisar el `audit_log` (acciones
`cron.scrape-bcv` / `cron.scrape-bcv.failed`) y la tabla `tasa_cambio_bcv`
(fila con `fecha` de hoy). El día siguiente al alta del cron, confirmar que la
fila del día existe (criterio de aceptación de F3.3.T3).

### 3. Warm-up PDF + health check (cada 5 min en horario laboral)

Mantiene caliente el runtime Node del Route Handler de PDF (`@react-pdf`) y
verifica salud del servicio + conexión a Postgres (mitigación cold-start,
ARCH §9 / ADR-11). El handler vive en `apps/web/app/api/pdf/health/route.ts`
(F4.1.T4):

- `GET /api/pdf/health` — probe público: `SELECT 1` contra Postgres y loguea la
  métrica `pdf_health_ok`. Sin render (barato, sirve como health check externo).
- `POST /api/pdf/health` — cron: requiere header `x-cron-secret` (mismo patrón
  que los demás cron), chequea Postgres Y hace un render dummy mini (~1KB) para
  calentar `@react-pdf`. Loguea `pdf_health_ok`.

- **Frecuencia**: cada 5 minutos, lunes a viernes 07:00–19:00 VET =
  11:00–23:00 UTC (Venezuela es UTC−4 fijo). El VPS corre en UTC.
- **Línea de crontab recomendada**:
  ```bash
  */5 11-23 * * 1-5 curl -X POST https://insforge.rvlaboratorio.com/api/pdf/health -H "x-cron-secret: TU_CRON_SECRET_AQUI" -s > /dev/null
  ```

#### Pruebas de ejecución manual

```bash
# Health check público (sin secret)
curl -s https://insforge.rvlaboratorio.com/api/pdf/health
# {"ok":true,"db":{"status":"ok"}}

# Warm-up como lo dispara el cron (con secret)
curl -s -X POST https://insforge.rvlaboratorio.com/api/pdf/health \
  -H "x-cron-secret: TU_CRON_SECRET_AQUI"
# {"ok":true,"db":{"status":"ok"},"warmBytes":...}
```

Respuestas esperadas:

- `200` con `{"ok":true,...}` → Postgres OK (+ render OK en POST).
- `503` con `{"ok":false,"db":{...}}` → Postgres caído o `DATABASE_URL` no
  configurado (el cron sigue pegándole cada 5 min, así queda la alerta en logs).
- `401 Unauthorized` → secret faltante o incorrecto.

La métrica `pdf_health_ok` (`ok`, `db`, `durationMs`, `warmBytes`) aparece en
los logs del contenedor web; con `docker logs <web> | grep pdf_health_ok` se
puede verificar que el cron está activo y renderizando.

#### Alternativa: InsForge Schedules

Si se prefiere gestionar la tarea desde la plataforma en vez del crontab del
VPS, InsForge permite Edge Functions (Deno) con Schedule vía `pg_cron`. Se
descartó en ADR-11 por implicar un segundo runtime y desplegar código fuera del
monorepo; queda documentada como alternativa si el VPS no permitiera crontab.
En ese caso el endpoint a llamar seguiría siendo el mismo Route Handler
(`POST /api/pdf/health` con `x-cron-secret`), o directamente la lógica de
warm-up re-implementada en la Edge Function.

## Variables de entorno

Template completo en [`.env.example`](../../.env.example): `INSFORGE_URL`,
`NEXT_PUBLIC_INSFORGE_URL`, `INSFORGE_ANON_KEY`, `DATABASE_URL` (solo alcanzable
desde el VPS o por túnel SSH) y `CRON_SECRET`.

Faltan en ese template (pendiente de agregarlas ahí) y son necesarias para el
upload de logo / firma / sello — ver [Storage local](#storage-local-en-el-servicio-labo-web-gur-16):

```bash
STORAGE_ROOT=/data/storage          # volumen persistente montado en Coolify
STORAGE_SIGNING_SECRET=             # openssl rand -hex 32 (mínimo 32 chars)
```

## Checklist F0.0.T1

- [x] Health endpoint 200 desde fuera vía HTTPS (`/api/health`)
- [x] Buckets `assets` (público) y `exports` (privado) creados
- [x] SMTP (Messaging) configurado — Resend
- [x] `.env.example` actualizado
- [x] `docs/deploy/insforge-vps.md` + `docker-compose.override.yml`
- [ ] `docker compose ps` healthy tras reboot del VPS — verificar en el server
- [ ] Credenciales del dashboard en el password manager — confirmar

## Aplicar una migración en la instancia hosted (`*.insforge.app`)

El `pnpm --filter @labo/db migrate` de `packages/db/package.json` apunta a
`scripts/migrate.mjs`, y el `.gitignore` tiene un `scripts/` a secas (línea 4)
que ignora **cualquier** carpeta `scripts/` del monorepo. O sea: ese runner
nunca viaja por git y en un clone fresco no existe.

Para la instancia hosted la vía real es el endpoint de migraciones de InsForge,
que además **recarga el schema cache de PostgREST solo** — que es el paso que
se olvida cuando se aplica el SQL por `psql` directo y deja la tabla creada
pero invisible para el SDK (error `PGRST205`):

```bash
python3 - <<'PY'
import os, json, urllib.request, pathlib
u, k = os.environ['INSFORGE_URL'], os.environ['INSFORGE_API_KEY']
sql = pathlib.Path('packages/db/migrations/00XX_nombre.sql').read_text()
req = urllib.request.Request(
    u + '/api/database/migrations',
    data=json.dumps({'version': '00XX', 'name': 'nombre-con-guiones', 'sql': sql}).encode(),
    method='POST',
    headers={'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json'})
print(json.load(urllib.request.urlopen(req))['message'])
PY
```

Notas:

- El endpoint corre todo en **una transacción propia**: si un statement falla,
  no queda nada aplicado ni registrado. No incluir `BEGIN` / `COMMIT` en el SQL.
- `GET /api/database/migrations` lista lo aplicado por esta vía. Ojo: las
  migraciones 0001–0013 se aplicaron por fuera, así que no figuran ahí.
- Verificar después con
  `GET /api/database/records/{tabla}?limit=1` usando la API key admin.
