# Deploy InsForge en VPS

> ADR-11: pivot Convex → InsForge self-hosted. Alcance funcional intacto,
> otra plataforma. Esta doc describe la instancia de producción y cómo operarla.

## Instancia

| Qué             | Valor                                        |
| --------------- | -------------------------------------------- |
| URL             | `https://insforge.rvlaboratorio.com`         |
| Dashboard       | `https://insforge.rvlaboratorio.com/dashboard` |
| Versión         | `2.3.1` (`Insforge OSS Backend`)             |
| Hosting         | VPS propio, Docker Compose                   |
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

## Variables de entorno

Template completo en [`.env.example`](../../.env.example): `INSFORGE_URL`,
`NEXT_PUBLIC_INSFORGE_URL`, `INSFORGE_ANON_KEY`, `DATABASE_URL` (solo alcanzable
desde el VPS o por túnel SSH) y `CRON_SECRET`.

## Checklist F0.0.T1

- [x] Health endpoint 200 desde fuera vía HTTPS (`/api/health`)
- [x] Buckets `assets` (público) y `exports` (privado) creados
- [x] SMTP (Messaging) configurado — Resend
- [x] `.env.example` actualizado
- [x] `docs/deploy/insforge-vps.md` + `docker-compose.override.yml`
- [ ] `docker compose ps` healthy tras reboot del VPS — verificar en el server
- [ ] Credenciales del dashboard en el password manager — confirmar
