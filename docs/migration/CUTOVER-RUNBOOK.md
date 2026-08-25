# Cutover Runbook — WP → LabSystem (InsForge/Postgres)

> **Versión**: 1.0
> **Fecha**: 2026-08-24
> **Task**: F4.2.T2
> **Ref**: PRD §7 (ventana coordinada), §8 rollout, ADR-11 (destino = Postgres de InsForge).
> **Complementa**: [`ROLLBACK.md`](../../scripts/migrate-wp/ROLLBACK.md), [`POST-CUTOVER-PLAYBOOK.md`](./POST-CUTOVER-PLAYBOOK.md), [`insforge-vps.md`](../deploy/insforge-vps.md).

> **Regla de oro**: este runbook aborta ante la primera falla técnica. Fixes en vivo están prohibidos. Rollback = restaurar `pg_dump` pre-migración + reactivar WP como fuente de verdad. Ver [`ROLLBACK.md §2.3`](../../scripts/migrate-wp/ROLLBACK.md#23-si---verify-no-da-100-durante-la-ventana).

---

## 0. Índice

1. [Pre-condiciones (T-7d a T-1h)](#1-pre-condiciones-t-7d-a-t-1h)
2. [Roles y responsables](#2-roles-y-responsables)
3. [Comunicación previa](#3-comunicación-previa)
4. [Ventana de cutover — timeline](#4-ventana-de-cutover--timeline)
5. [Paso 1 — Backups (T0 → T0+15min)](#5-paso-1--backups-t0--t015min)
6. [Paso 2 — WP en modo mantenimiento (T0+15min → T0+20min)](#6-paso-2--wp-en-modo-mantenimiento-t015min--t020min)
7. [Paso 3 — Migración real (T0+20min → T0+80min)](#7-paso-3--migración-real-t020min--t080min)
8. [Paso 4 — Verify (T0+80min → T0+90min)](#8-paso-4--verify-t080min--t090min)
9. [Paso 5 — Smoke tests (T0+90min → T0+120min)](#9-paso-5--smoke-tests-t090min--t0120min)
10. [Paso 6 — Go-live + WP a read-only (T0+120min → T0+150min)](#10-paso-6--go-live--wp-a-read-only-t0120min--t0150min)
11. [Criterios de abort](#11-criterios-de-abort)
12. [Rollback rápido](#12-rollback-rápido)
13. [Sign-off post-cutover](#13-sign-off-post-cutover)

---

## 1. Pre-condiciones (T-7d a T-1h)

Todo debe estar ✅ antes de abrir la ventana. Si algo falta, **posponer**.

### T-7d — Aprobaciones y coordinación

- [ ] Dry-run F4.2.T1 firmado por Admin (Rosa), sin conflictos pendientes.
- [ ] `resolutions/pacientes.json` congelado y en git.
- [ ] Ventana confirmada por escrito con el equipo del laboratorio (fecha + hora + duración esperada 2.5h).
- [ ] Fecha elegida: **viernes noche (22:00 VET)** o **sábado madrugada (03:00 VET)** — fuera de operativa.

### T-48h — Infra

- [ ] Deploy `apps/web` en VPS probado (build + `systemctl status labo-web` o `docker compose ps` verde).
- [ ] `DATABASE_URL` del InsForge Postgres accesible desde el host donde correrá `migrate-wp` (SSH tunnel o VPS directo).
- [ ] `WP_MYSQL_URL` accesible (usuario con SELECT + REVOKE de escritura si opción C de read-only).
- [ ] Espacio libre en VPS ≥ 5 GB (dumps + logs).
- [ ] Cloudflare edge en modo **Full (strict)** hacia el origin.

### T-24h — Backups de referencia

- [ ] Dump MySQL de referencia (T-24h) creado y guardado off-site — para tener una segunda copia además del T0.
- [ ] Snapshot `pg_dump` del destino T-24h creado (verifica que el pipeline de backup funciona).
- [ ] Restore de prueba del dump T-24h en entorno preview → OK.

### T-1h — Checklist final

- [ ] `pnpm install` corrido en el host de migración (dependencias frescas).
- [ ] `.env` local con `WP_MYSQL_URL`, `DATABASE_URL`, `CONVEX_URL`/`CONVEX_DEPLOY_KEY_MIGRATION` (si aplica al legado) verificado — nunca commitear.
- [ ] Sesión de SSH abierta y estable con el VPS (usar `tmux` o `screen` para sobrevivir a desconexiones).
- [ ] Ventana de terminal separada con logs en vivo (`tail -f`).
- [ ] Playbook impreso o en pantalla secundaria.
- [ ] Canal de guerra abierto (WhatsApp grupo "Cutover LabSystem" + call).

---

## 2. Roles y responsables

| Rol | Persona | Responsabilidad |
|-----|---------|-----------------|
| **Ejecutor técnico** | Dev backend on-call | Corre los comandos, decide abort |
| **Admin del sistema** | Rosa | Aprobación go/no-go en cada gate, firma sign-off |
| **Ops WP** | Sysadmin del hosting WP | Aplica read-only al plugin, reactiva si abort |
| **Comunicador** | PM / cuenta | Envía updates al equipo, gestiona expectativas |
| **Observador** | 2do dev | Verifica logs, corre smoke tests, spotter de errores |

Regla: cambios de estado (ir al próximo paso, abortar) los declara el **Ejecutor técnico** con confirmación explícita de la **Admin**.

---

## 3. Comunicación previa

### 3.1 Email — T-48h

Asunto: **[LabSystem] Ventana de migración — <fecha> <hora> VET**

```
Equipo,

El próximo <día> <fecha> entre las <hora inicio> y <hora fin> VET vamos a
migrar el sistema del laboratorio a la nueva plataforma (LabSystem).

Durante esa ventana (≈ 2.5 horas):
- NO ingresar datos nuevos en el sistema actual (WP).
- Podrán ver un banner "sistema en actualización".
- Consultas de resultados históricos: pausadas hasta el go-live.

Al finalizar:
- LabSystem estará operativo en https://lab.rvlaboratorio.com
- El sistema anterior (WP) queda accesible SOLO PARA CONSULTA durante 30 días.
- Credenciales nuevas: se envían aparte por WhatsApp Business.

Si ese día tienen que registrar algo urgente, contactar a <contacto> ANTES
del inicio de la ventana.

Gracias por la paciencia.

<Firma>
```

### 3.2 WhatsApp Business — T-24h y T-1h

**T-24h** (recordatorio):
```
Buenas, recordamos que mañana <fecha> a las <hora> comienza la ventana
de migración al nuevo sistema. Duración estimada: 2.5 hs.

Durante ese tiempo no se pueden cargar datos nuevos. Al terminar les
avisamos por acá.

Cualquier duda, respondan este chat.
```

**T-1h** (inicio inminente):
```
En 1 hora comienza la migración. A partir de las <hora> el sistema queda
en modo mantenimiento. Les avisamos cuando esté listo (esperado <hora + 2.5h>).
```

**T-0 (inicio)**:
```
Sistema en mantenimiento. No ingresar datos hasta nuevo aviso.
```

**T-end (go-live)**:
```
LabSystem listo. Ingresen a https://lab.rvlaboratorio.com con las
credenciales que recibieron por email. El sistema anterior sigue accesible
en modo SOLO CONSULTA por 30 días.

Cualquier problema respondan acá.
```

**T-abort (si aplica)**:
```
Encontramos un problema técnico y estamos revirtiendo. El sistema anterior
vuelve a operar en unos minutos. Reagendamos la migración y les avisamos
por email. Perdón por el inconveniente.
```

---

## 4. Ventana de cutover — timeline

| T | Duración esperada | Paso | Gate |
|---|-------------------|------|------|
| T0 | 15 min | Backups (MySQL + Postgres) | Backup files existen + sha256 verificado |
| T0+15 | 5 min | WP → mantenimiento | Banner visible desde fuera |
| T0+20 | 60 min | `migrate-wp --confirm` | Exit code 0, sin errores en log |
| T0+80 | 10 min | `--verify` | `overall_ok: true`, 100% match |
| T0+90 | 30 min | Smoke tests (F4.2.T3) | 10/10 items OK |
| T0+120 | 30 min | Switch DNS + WP read-only | LabSystem responde, WP sin escritura |
| T0+150 | — | Sign-off + comunicación final | Admin firma |

Total esperado: **2.5 horas**. Buffer implícito: +30 min. Si a T0+3h no hay go-live, evaluar abort.

---

## 5. Paso 1 — Backups (T0 → T0+15min)

**Objetivo**: dos snapshots inmutables para poder volver a este exacto punto en el tiempo si algo falla.

### 5.1 Dump MySQL de WP (fuente)

Desde host con acceso a WP MySQL:

```bash
export T0=$(date -u +%Y%m%dT%H%M%SZ)
export DUMP_DIR="/backups/cutover-${T0}"
mkdir -p "${DUMP_DIR}"

mysqldump \
  --single-transaction \
  --routines --triggers --events \
  --default-character-set=utf8mb4 \
  -u "$WP_MYSQL_USER" -p"$WP_MYSQL_PASS" \
  -h "$WP_MYSQL_HOST" "$WP_MYSQL_DB" \
  | gzip > "${DUMP_DIR}/wp-labo-${T0}.sql.gz"

sha256sum "${DUMP_DIR}/wp-labo-${T0}.sql.gz" > "${DUMP_DIR}/wp-labo-${T0}.sha256"
ls -lh "${DUMP_DIR}/"
```

**Tiempo esperado**: 3–8 min (según tamaño). Un dump < 500 MB es esperable para el estado actual del WP.

**Criterio OK**: archivo `.sql.gz` > 100 KB, `.sha256` presente, `echo $?` = 0.

**Criterio ABORT**: `mysqldump` retorna != 0, o archivo vacío, o no hay espacio en disco. → **NO tocar WP ni Postgres**, resolver infra y reagendar.

### 5.2 Snapshot `pg_dump` del destino Postgres

Desde el VPS (o vía túnel SSH):

```bash
# Desde ~/insforge en el VPS
docker compose exec -T postgres pg_dump \
  -U postgres \
  --format=custom \
  --no-owner --no-acl \
  insforge > "/backups/cutover-${T0}/pg-labo-pre-${T0}.dump"

ls -lh "/backups/cutover-${T0}/pg-labo-pre-${T0}.dump"
sha256sum "/backups/cutover-${T0}/pg-labo-pre-${T0}.dump" \
  >> "/backups/cutover-${T0}/pg-labo-pre-${T0}.sha256"
```

**Tiempo esperado**: 1–3 min (Postgres destino está prácticamente vacío antes del cutover).

**Criterio OK**: dump file existe, size > 10 KB (schema al menos), sha256 registrado.

**Criterio ABORT**: `pg_dump` falla, InsForge no accesible, o Postgres no responde. → resolver infra.

### 5.3 Replicar off-site

```bash
# Ejemplo con rclone hacia S3/R2
rclone copy "${DUMP_DIR}" "backups-remote:labo-cutover/${T0}/" --progress
```

**Criterio OK**: transferencia completa, archivo listable desde remoto.

**Criterio ABORT** (soft): si off-site falla pero copia local está OK, **continuar** pero anotar como riesgo. Si local también falla, ABORT duro.

---

## 6. Paso 2 — WP en modo mantenimiento (T0+15min → T0+20min)

**Objetivo**: freeze de escrituras en WP. Ningún dato nuevo puede entrar mientras se migra, para evitar drift.

### 6.1 Aplicar mantenimiento (opción recomendada: A + C combinadas)

**A — Banner de mantenimiento (frontend)**:

```bash
ssh usuario@servidor-wp
cd /var/www/labo-wp
echo '<?php $upgrading = time(); ?>' > .maintenance
```

Reemplazar la página `.maintenance` por HTML customizado con el mensaje:

> "Sistema en actualización. No ingresar datos nuevos. Volvemos a las <hora estimada>."

**C — Revocar permisos MySQL (defensa en profundidad)**:

```sql
-- Conectado como root al MySQL de WP
REVOKE INSERT, UPDATE, DELETE ON wp_labo.* FROM 'wp_user'@'%';
FLUSH PRIVILEGES;

-- Verificar
SHOW GRANTS FOR 'wp_user'@'%';
-- Debe listar solo SELECT
```

### 6.2 Verificar mantenimiento

```bash
# Desde fuera del servidor
curl -s -o /dev/null -w "%{http_code}\n" https://wp.rvlaboratorio.com
# Esperado: 503 (maintenance) o 200 con banner visible

curl -s https://wp.rvlaboratorio.com | grep -i "actualización"
# Debe encontrar el texto del banner
```

**Tiempo esperado**: 2–5 min.

**Criterio OK**: banner visible desde fuera + intento de INSERT desde `wp-cli` falla con permission denied.

**Criterio ABORT**: no se puede aplicar mantenimiento (permisos, plugin roto, etc.). → **NO iniciar migración**, resolver o reagendar.

---

## 7. Paso 3 — Migración real (T0+20min → T0+80min)

**Objetivo**: correr `migrate-wp` real (sin `--dry-run`) contra el Postgres destino.

### 7.1 Pre-check final

```bash
cd /Volumes/PortableSSD/Freelas/labo-system  # o path del checkout en el host de migración
git rev-parse HEAD                            # anotar el commit del binario
echo "$DATABASE_URL" | sed 's/:[^:]*@/:***@/' # verificar sin exponer password
echo "$WP_MYSQL_URL" | sed 's/:[^:]*@/:***@/'

# Verificar conectividad
psql "$DATABASE_URL" -c "SELECT current_database(), version();"
```

**Criterio OK**: ambas conexiones responden, versión Postgres esperada.

**Criterio ABORT**: no hay conectividad. → revertir Paso 2 + reagendar.

### 7.2 Ejecutar migración real

```bash
# Salida a log persistente para auditoría
export MIGRATION_LOG="/backups/cutover-${T0}/migration-${T0}.log"

pnpm --filter migrate-wp run migrate -- --confirm 2>&1 | tee "${MIGRATION_LOG}"
echo "exit=$?" >> "${MIGRATION_LOG}"
```

> **Nota sobre el flag**: la spec de F4.2.T2 exige `--confirm` como guardia explícita contra ejecución accidental en prod. Si el CLI actual no lo soporta (ver `scripts/migrate-wp/index.ts`), abortar y agregarlo antes del cutover — nunca correr sin gate explícito en producción.

**Tiempo esperado**: 40–60 min (basado en timeline del dry-run T1). Si supera 90 min sin log de progreso, evaluar abort.

**Progreso esperado en el log** (orden por dependencias):
1. `titulos` (grupos de exámenes) — segundos
2. `examenes` (~250+ filas) — 1–2 min
3. `pacientes` (~204+ filas) — 2–5 min
4. `paquetes` — 1 min
5. `resultados` (mayor volumen) — 20–40 min
6. `presupuestos` — 5–15 min

**Criterio OK**: exit code 0, log termina con "migrate-wp finalizado", sin líneas `level: error`.

**Criterio ABORT**:
- Exit code != 0
- Cualquier línea `level: fatal` o `level: error` no recuperable
- Timeout > 90 min sin progreso
- Conexión a Postgres caída durante la corrida

→ Ir a [§12 Rollback rápido](#12-rollback-rápido).

---

## 8. Paso 4 — Verify (T0+80min → T0+90min)

**Objetivo**: confirmar que los counts + spot-checks coinciden entre origen (WP MySQL) y destino (Postgres).

```bash
pnpm --filter migrate-wp run migrate -- --verify 2>&1 \
  | tee "/backups/cutover-${T0}/verify-${T0}.json"
echo "exit=$?" >> "/backups/cutover-${T0}/verify-${T0}.json"
```

**Tiempo esperado**: 5–10 min.

**Criterio OK**: exit code 0, JSON con `overall_ok: true`, cada entidad con `coverage_ok: true` y `spot_check_ok: true`, sin `discrepancies`.

**Criterio ABORT**: exit code != 0 o `overall_ok: false` o cualquier entidad con `coverage_ok: false`.

→ Ir a [§12 Rollback rápido](#12-rollback-rápido). NO intentar fix en vivo.

---

## 9. Paso 5 — Smoke tests (T0+90min → T0+120min)

**Objetivo**: validar los 10 flujos críticos con datos reales migrados.

Seguir el checklist de F4.2.T3 en [`SMOKE-TESTS.md`](./SMOKE-TESTS.md) (creado por task hermana).

Resumen mínimo bloqueante (cualquiera falla → ABORT):

- [ ] Login Admin y Operador OK contra Postgres destino.
- [ ] Dashboard carga con KPIs > 0.
- [ ] Buscar 3 pacientes conocidos (por cédula y por nombre) → los tres aparecen con historial.
- [ ] Descargar PDF de resultado migrado → snapshot coincide con referencia visual.
- [ ] Crear resultado nuevo (dato de prueba) → guarda en Postgres, no toca WP.

**Tiempo esperado**: 20–30 min ejecutados por Admin + Observador en paralelo.

**Criterio OK**: 10/10 items del checklist manual OK + Playwright suite verde contra prod.

**Criterio ABORT**: cualquier flujo bloqueante falla. → [§12 Rollback rápido](#12-rollback-rápido).

---

## 10. Paso 6 — Go-live + WP a read-only (T0+120min → T0+150min)

**Objetivo**: hacer el switch para que el tráfico real vaya a LabSystem, dejando WP como consulta durante 30d.

### 10.1 Publicar `apps/web` (si no está publicado)

```bash
# En el VPS
cd ~/labo-system
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter web build
sudo systemctl restart labo-web   # o: docker compose up -d web

# Verificar
systemctl status labo-web
curl -s https://lab.rvlaboratorio.com/api/health
# Esperado: 200 OK con status ok + Postgres up
```

### 10.2 DNS switch (si aplica)

Si el dominio `lab.rvlaboratorio.com` todavía no apuntaba al VPS:

- Actualizar registro en Cloudflare (A o CNAME al VPS).
- TTL previo reducido a 60s desde T-24h para reversibilidad rápida.
- Verificar propagación: `dig lab.rvlaboratorio.com +short` desde varios puntos.

### 10.3 WP: quitar mantenimiento pero DEJAR read-only

```bash
ssh usuario@servidor-wp
cd /var/www/labo-wp

# Quitar banner de mantenimiento
rm .maintenance

# Los permisos MySQL siguen sin INSERT/UPDATE/DELETE (aplicados en §6.1 opción C).
# Verificar que WP sirve consultas OK:
curl -s -o /dev/null -w "%{http_code}\n" https://wp.rvlaboratorio.com
# Esperado: 200

# Agregar banner de "solo consulta" (según POST-CUTOVER-PLAYBOOK §1)
wp config set LAB_READONLY true --path=/var/www/labo-wp
```

### 10.4 Notificar go-live

- Enviar WhatsApp de "LabSystem listo" (template §3.2 T-end).
- Enviar email con credenciales nuevas al equipo del laboratorio.

**Tiempo esperado**: 20–30 min.

**Criterio OK**: LabSystem responde 200 en `/api/health` + WP responde 200 con banner "solo consulta" + comunicación enviada.

**Criterio ABORT** (post go-live parcial): si LabSystem no arranca, revertir DNS + reactivar WP (opción C, restaurar GRANTs) + [§12 Rollback rápido](#12-rollback-rápido). Ver también [`POST-CUTOVER-PLAYBOOK §2`](./POST-CUTOVER-PLAYBOOK.md#2-procedimiento-de-emergencia-bug-bloqueante-en-labsystem).

---

## 11. Criterios de abort

Cualquiera de los siguientes **aborta inmediatamente** el cutover sin discusión:

| # | Condición | Paso |
|---|-----------|------|
| A1 | Backup MySQL falla o queda vacío | 5.1 |
| A2 | Snapshot Postgres pre-migración falla | 5.2 |
| A3 | No se puede aplicar mantenimiento a WP (banner o REVOKE) | 6 |
| A4 | `migrate-wp --confirm` exit code != 0 | 7 |
| A5 | Log de migración contiene `level: fatal` o error no recuperable | 7 |
| A6 | Migración excede 90 min sin progreso | 7 |
| A7 | `--verify` `overall_ok: false` (aunque sea 1 entidad) | 8 |
| A8 | Smoke tests: cualquier flujo bloqueante falla | 9 |
| A9 | LabSystem no arranca en el VPS | 10 |

**Regla**: ante duda entre "seguir y arreglar" vs "abortar", **abortar siempre**. Fixes en vivo están prohibidos por spec.

---

## 12. Rollback rápido

Escenario: abort declarado. Objetivo: dejar WP operativo en < 15 min.

```bash
# 1. Restaurar permisos MySQL de WP (revertir §6.1 opción C)
mysql -u root -p -e "
GRANT INSERT, UPDATE, DELETE ON wp_labo.* TO 'wp_user'@'%';
FLUSH PRIVILEGES;
"

# 2. Quitar mantenimiento
ssh usuario@servidor-wp "rm /var/www/labo-wp/.maintenance"

# 3. Restaurar snapshot Postgres pre-migración (el destino queda como estaba)
cat "/backups/cutover-${T0}/pg-labo-pre-${T0}.dump" \
  | docker compose exec -T postgres pg_restore -U postgres --clean --if-exists -d insforge

# 4. NO tocar DNS (WP sigue siendo el hostname operativo real).
#    Si ya se hizo el switch a lab.rvlaboratorio.com, revertir en Cloudflare
#    al target previo (backup del registro debe estar en el password manager).

# 5. Verificar WP responde con escrituras
curl -s https://wp.rvlaboratorio.com   # esperado: 200 sin banner
# Prueba escritura: crear un registro dummy con wp-cli
wp post create --post_title="test-rollback" --post_status=draft --path=/var/www/labo-wp
wp post delete <ID> --force --path=/var/www/labo-wp

# 6. Comunicar abort al equipo (template §3.2 T-abort).

# 7. Post-mortem inmediato: guardar TODO en /backups/cutover-${T0}/
#    - migration-${T0}.log
#    - verify-${T0}.json
#    - screenshots de errores
```

**Tiempo esperado**: 10–15 min hasta WP operativo.

Detalles y variantes (por ejemplo si el abort ocurre post go-live parcial): ver [`ROLLBACK.md §2.3`](../../scripts/migrate-wp/ROLLBACK.md#23-si---verify-no-da-100-durante-la-ventana) y [`POST-CUTOVER-PLAYBOOK §3`](./POST-CUTOVER-PLAYBOOK.md#3-procedimiento-de-rollback-completo).

---

## 13. Sign-off post-cutover

Antes de cerrar la ventana y considerar F4.2.T2 completa:

- [ ] **Admin (Rosa)** firma go-live por escrito (comentario en tracker + WhatsApp al canal de proyecto).
- [ ] Artefactos archivados en `/backups/cutover-${T0}/`:
  - [ ] `wp-labo-${T0}.sql.gz` + `.sha256`
  - [ ] `pg-labo-pre-${T0}.dump` + `.sha256`
  - [ ] `migration-${T0}.log`
  - [ ] `verify-${T0}.json`
  - [ ] Checklist de smoke tests firmado (F4.2.T3)
- [ ] Off-site sync verificado (rclone / S3 / R2).
- [ ] LabSystem monitorizado por las primeras 4 horas post go-live (canal de guerra abierto).
- [ ] Ticket P0/P1 tracking abierto para incidencias.
- [ ] Recordatorio calendario **T+30d**: desactivar WP definitivamente (según [`POST-CUTOVER-PLAYBOOK §1`](./POST-CUTOVER-PLAYBOOK.md#1-wp-en-modo-read-only-backup-30d)).
- [ ] Retro de la ventana agendada dentro de las 48h.

---

## Anexo A — Estimación de tiempos (referencia dry-run F4.2.T1)

Actualizar esta tabla con los tiempos reales del dry-run más reciente:

| Fase | Estimado | Real (dry-run) | Notas |
|------|----------|----------------|-------|
| Backup MySQL | 5 min | _ | _ |
| Backup Postgres | 3 min | _ | _ |
| Migración total | 45 min | _ | _ |
| Verify | 8 min | _ | _ |
| Smoke tests | 25 min | _ | _ |
| Publicación + DNS | 15 min | _ | _ |
| **Total** | **~101 min** | _ | Buffer +30 min |

---

## Anexo B — Variables de entorno mínimas para el cutover

```bash
# Origen (WP)
export WP_MYSQL_HOST="…"
export WP_MYSQL_USER="…"
export WP_MYSQL_PASS="…"   # nunca en git, usar keyring o prompt
export WP_MYSQL_DB="wp_labo"
export WP_MYSQL_URL="mysql://${WP_MYSQL_USER}:${WP_MYSQL_PASS}@${WP_MYSQL_HOST}:3306/${WP_MYSQL_DB}"

# Destino (InsForge Postgres)
export DATABASE_URL="postgres://…"   # solo alcanzable desde el VPS o túnel SSH

# Timestamps
export T0=$(date -u +%Y%m%dT%H%M%SZ)
export DUMP_DIR="/backups/cutover-${T0}"

# Cron secret (para verificar salud post-cutover)
export CRON_SECRET="…"
```

---

## Anexo C — Contactos

| Rol | Nombre | Contacto | Backup |
|-----|--------|----------|--------|
| Admin sistema | Rosa | _ | _ |
| Ejecutor técnico | _ | _ | _ |
| Ops WP | _ | _ | _ |
| PM / comunicador | _ | _ | _ |
| Sysadmin VPS | _ | _ | _ |

Rellenar antes del T-7d.
