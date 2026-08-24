# ADR-11: Pivot de backend — Convex → InsForge (self-hosted)

- **Fecha**: 2026-08-23
- **Estado**: Aceptado (decisión del usuario)
- **Reemplaza parcialmente**: ADR-01 (Convex como backend unificado), ADR-03
  (Convex Auth), ADR-07 (cron como Convex action), ADR-09 (export vía Convex
  action + File Storage), ADR-10 (migración WP → Convex).
- **No afecta**: ADR-02 (PDFs en Next Route Handler — refuerza), ADR-04
  (snapshots), ADR-05 (paciente XOR nombre libre), ADR-06 (cédula
  normalizada), ADR-08 (monorepo pnpm+turbo — cambia `packages/convex` por
  `packages/db`).

## Contexto

El proyecto estaba especificado end-to-end sobre Convex (DB documental,
queries/mutations, Convex Auth, File Storage, crons). A la fecha hay 22 tasks
done (la mayoría frontend/infra/spikes) y 41 tasks pendientes que referencian
`packages/convex/*`.

El usuario decidió hacer pivot del backend a **InsForge**
(https://github.com/InsForge/InsForge): backend open-source, auto-hosteable en
el VPS del usuario vía Docker Compose, que empaqueta Postgres + Auth + Storage
S3-compatible + Realtime + Edge Functions + Messaging (SMTP) operables por CLI
y MCP. Motivos del pivot: soberanía de datos (Postgres propio en VPS), sin
vendor lock-in de runtime propietario, y coste operativo plano.

Este ADR documenta el mapeo plataforma a plataforma y las consecuencias de la
migración. El alcance funcional (PRD) NO cambia: mismas features, otra
plataforma.

## Decisión

InsForge es el nuevo backend. La capa de datos de dominio vive en
`packages/db` (DDL PostgreSQL + repositorios SQL). El modelo de datos de
`packages/convex/schema.ts` (14 tablas) es la especificación y se traduce a
DDL relacional. El frontend (`apps/web`) conserva stack y estructura.

### Mapeo Convex → InsForge

| Concepto Convex | Equivalente InsForge | Notas |
| --- | --- | --- |
| `packages/convex/schema.ts` (`defineSchema`) | `packages/db/schema.sql` (DDL PostgreSQL) + migraciones SQL timestamped aplicadas forward-only con InsForge CLI | Índices `by_*` → índices B-tree normales; uniqueness implícito en mutations → constraints `UNIQUE` declarativos |
| Queries/mutations (`config.get()`, etc.) | Funciones server-side Next.js (Server Components / Route Handlers) + repositorios SQL en `packages/db/repos/*.ts` | Ver "Acceso a datos" abajo |
| `requireRole(ctx, role)` / `getCurrentUser(ctx)` | Mismos helpers, reimplementados en `packages/lib/server/auth.ts` contra InsForge Auth + tabla `usuarios` | Misma firma conceptual, distinta implementación |
| `@convex-dev/auth` (provider Password, sesión 8h) | **InsForge Auth** (email+password nativo, sesiones JWT, refresh cookie httpOnly) | Password reset y verificación de email son **built-in**; se elimina la tabla custom `password_reset_tokens` |
| Invitaciones de usuarios (custom) | Se mantienen custom: tabla `user_invitations` + envío vía InsForge Messaging (SMTP gestionado o propio) | InsForge no tiene flujo de invitaciones |
| Tabla `usuarios` (role admin/operador) | Igual, vinculada por columna `auth_user_id` (UUID de `auth.users` de InsForge, FK lógica sin constraint cross-schema) | RBAC sigue siendo de dominio, no del proveedor |
| File Storage (`storage.generateUploadUrl`, `_storage`) | **InsForge Storage** (bucket S3-compatible): upload/download *strategy* con URL presignada + confirm; gateway S3 SigV4 disponible | Campos `*_storage_id` → `*_object_key text`; bucket `assets` (público-lectura con URL firmada 1h) y `exports` |
| Convex actions `"use node"` (imports XLSX, CSV, scraper) | Route Handlers Next.js Node runtime (ya eran la elección para PDFs, ADR-02) | Ventaja: transacciones ACID reales para import masivo |
| Convex crons (`crons.ts`) | Crontab del VPS → `POST /api/cron/*` protegido con header `CRON_SECRET` | Alternativa documentada: InsForge Edge Functions + Schedules (pg_cron). Elegimos crontab por un solo runtime y observabilidad directa |
| Realtime Convex (dashboard live) | Polling liviano (SWR / `router.refresh`, ~30s) en dashboard | Ver Consecuencias (−) |
| IDs string de Convex (`v.id("tabla")`) | `uuid` con `gen_random_uuid()` | `migration_map` traduce `wp_id` → UUID destino |
| Timestamps `v.number()` (ms epoch) | `timestamptz` | Conversión explícita en mappers |
| Enums literales (`v.union(v.literal(...))`) | `CHECK (estado IN (...))` | Preferimos CHECKs sobre tipos ENUM: ALTERs triviales |
| `_migration_map` (reservaba nombre sin underscore) | `migration_map` con `UNIQUE (wp_table, wp_id)` | Idempotencia de migración se mantiene |

### Acceso a datos (decisión explícita)

**Cliente Postgres directo (`postgres` / postgres.js) para datos de dominio;
`@insforge/sdk` para Auth y Storage.**

Por qué:

1. Las operaciones de negocio necesitan **transacciones multi-tabla reales**
   (crear resultado + N líneas con snapshots; convertir presupuesto →
   resultado; import XLSX batch; `setExamenes` delete+insert). Con Convex esto
   era implícito; con REST tipado por tabla sería N round-trips sin atomicidad.
2. El script de migración WP hace **INSERTs batch masivos** (652 resultados +
   ~10k líneas) — COPY/multi-row INSERT directo a Postgres es lo más simple.
3. El modelo de confianza no cambia: Convex validaba auth/rol dentro de cada
   mutation; ahora `requireRole` valida dentro de cada Route Handler/repo.
   No introducimos RLS en v1 (tablas de dominio no expuestas por la REST
   pública de InsForge; todo acceso pasa por nuestro server).
4. Un solo driver SQL también lo usa el script standalone `scripts/migrate-wp`.

Se evita así: ORM (peso innecesario para 14 tablas), RLS prematura, y acoplar
los repos al SDK REST de InsForge.

### Schema PostgreSQL (traducción del modelo de datos)

14 tablas, 1:1 con `schema.ts`:

- `laboratorio_config` (singleton, PK fija), `pacientes`, `examenes_titulos`,
  `examenes`, `paquetes`, `paquetes_examenes` (PK compuesta), `resultados`,
  `resultados_examenes`, `presupuestos`, `presupuestos_examenes`,
  `usuarios`, `tasa_cambio_bcv`, `audit_log`, `migration_map`.
- Constraints declarativos que Convex resolvía en código:
  - `UNIQUE (cedula)` en `pacientes` (ADR-06 — antes check en mutation).
  - `UNIQUE (titulo_id, nombre)` en `examenes`; `UNIQUE (nombre)` en
    `examenes_titulos` y `paquetes`.
  - `CHECK ((paciente_id IS NULL) <> (paciente_nombre_libre IS NULL))` en
    `presupuestos` (XOR de ADR-05).
  - CHECKs de dominio: `sexo IN ('M','F','O')`, estados de
    resultados/presupuestos, `descuento_pct BETWEEN 0 AND 100`,
    `ganancia_pct >= 0`, `tasa_bs > 0`.
- FKs reales con `ON DELETE RESTRICT` donde los snapshots dependen del
  catálogo (ADR-04); `audit_log.usuario_id` con `SET NULL`.
- `pacientes.activo boolean DEFAULT true` (soft-delete ya previsto en spec).
- Dinero: `numeric` (nunca float) para precios/tasas/totales.
- `password_reset_tokens` **se elimina** del diseño (built-in InsForge);
  `user_invitations` se mantiene.
- Tablas de sesión/usuario las gestiona InsForge Auth (`auth.users`, etc.);
  no las declaramos nosotros.

### Implicación para la migración WordPress (ADR-10)

La migración se **simplifica**: en vez de N mutations Convex con clientes
especiales (`ConvexHttpClient` + deploy key + internal mutations que saltean
validaciones), `scripts/migrate-wp` lee MySQL (`mysql2`) y escribe **INSERTs
batch directos a Postgres** (multi-row / COPY) resolviendo IDs vía
`migration_map`. Dry-run, verify, idempotencia y rollback playbook se
mantienen tal cual; desaparece la capa de "internal mutations de migración".

## Alternativas descartadas

- **Quedarse en Convex**: descartado por decisión del producto (soberanía de
  datos y coste predecible en VPS propio).
- **Supabase**: equivalente funcional cercano, pero InsForge fue elegido por
  ser auto-hosteable end-to-end (docker-compose) con CLI/MCP agent-native y
  sin plan de pricing por seat.
- **Acceso a datos vía `@insforge/sdk` REST para dominio**: descartado —
  pierde transacciones multi-tabla y obligaría a mantener RLS por tabla desde
  el día 1; útil para Auth/Storage, no para el dominio.
- **Prisma/Drizzle en `packages/db`**: descartado — SQL directo es más
  simple y transparente para 14 tablas; menos capas que auditar.
- **Scraper BCV como Edge Function con Schedule de InsForge**: viable, pero
  implicaba un segundo runtime (Deno) y desplegar código fuera del monorepo.
  Crontab → Route Handler mantiene un solo lenguaje/runtime y logs unificados.
  Queda documentada como alternativa si el VPS no permite crontab.

## Consecuencias

### Se conserva

- Todo el frontend hecho y especificado: Next 14 App Router, shadcn/ui,
  react-hook-form + zod, monorepo pnpm+turborepo, CI, ESLint boundaries,
  layout, highlight utility, normalizador de cédulas.
- Diseño RBAC (roles admin/operador, middleware coarse-grained +
  `requireRole` fine-grained) — cambia la implementación, no el diseño.
- Modelo de datos (14 tablas), snapshots (ADR-04), XOR paciente (ADR-05),
  cédula normalizada (ADR-06), reglas de dinero/redondeo Bs (S7),
  tasas BCV, estados de presupuestos/resultados, export CSV, auditoría.
- Los tasks done quedan en `tasks.json` como historial intacto.

### Se descarta

- Runtime `packages/convex` completo: schema TS, queries/mutations, actions,
  crons Convex, `convex/_generated`, `ConvexHttpClient`, Convex Auth y sus
  tablas (`authSessions`, etc.), Convex File Storage y Convex dashboard.
- Realtime automático de Convex en listas/dashboard.

### Ganancias (+)

- Postgres real: constraints declarativos (UNIQUE cédula, XOR presupuesto)
  dejan de ser checks manuales en cada mutation; SQL agregable para el
  dashboard (`GROUP BY date_trunc(...)`) en lugar de agregar en JS.
- Transacciones ACID explícitas en operaciones compuestas.
- Auth más completa out-of-the-box: password reset (code/link), verificación
  de email, rate limiting de auth, gestión admin de usuarios, SMTP
  transaccional integrado — tres gaps documentados en S5 quedan cubiertos.
- Migración WP más simple (INSERT batch) y backups estándar (`pg_dump`).
- Escape hatch de exportación (F10 del ARCH) deja de ser crítico: los datos
  son Postgres propio.

### Costos (−) y mitigaciones

- **Sin realtime nativo en el frontend**: el dashboard pasa a polling (~30s)
  y revalidación post-mutación. Para el volumen del laboratorio (uso
  monousuario/2-3 concurrentes) es indistinguible. InsForge Realtime existe
  (Socket.IO + change feeds) como upgrade posterior si hiciera falta.
- **Operación del backend ahora es nuestra** (docker-compose, TLS, backups,
  upgrades de InsForge): mitigado con guía oficial de deployment/security del
  proveedor, `pg_dump` programado y healthcheck en CI del VPS.
- **Dos fuentes de verdad de identidad** (auth users de InsForge + tabla
  `usuarios` de dominio): igual que con Convex Auth; vínculo por
  `usuarios.auth_user_id` con sincronización en el flujo de alta/invitación.
- **Crons dependen del VPS**: si el contenedor de la web app está caído, no
  corren. Mitigación: `restart: unless-stopped` + alerta de uptime (F4).
- **Tasks done de backend Convex quedan obsoletos como historial** (F0.1.T3,
  F0.2.T1–T5, F1.1.T1): su funcionalidad se re-portea con tasks nuevos
  (F0.1.T8, F0.2.T8, F1.1.T5) para que no queden agujeros funcionales.
