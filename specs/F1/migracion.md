---
type: spec
phase: F1
package: migracion
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - F0.auth
  - F1.config
  - F1.catalogo
  - S2.wp-migration
blocks:
  - F4.cutover
generated_by: orch-spec
generated_at: 2026-08-23
title: "F1.migracion — Script one-shot WP → Convex"
---

# F1 · Migración WP → Convex

Script Node standalone que migra pacientes, títulos, exámenes, paquetes, resultados y presupuestos desde MySQL de WordPress a Convex. Idempotente, con dry-run y reporte. Bloquea F4.cutover.

## Referencias

- **PRD**: §4 F8, §7 (dependencias — dump MySQL).
- **ARCH**: ADR-10 (script standalone), §6 (`_migration_map`), §10.
- **Spike**: S2 (mapping validado + POC dry-run).

---

## F1.migracion.T01 — Setup script `scripts/migrate-wp/`

### Objetivo

Estructura base del script Node standalone: package.json, tsconfig, entry point, config (env vars), logger, CLI args.

### Contexto

ARCH ADR-10. Script fuera del monorepo build de turbo (o package aislado). Corre con `pnpm --filter migrate-wp run migrate -- --dry-run`.

### Alcance

Sí hace:
- `scripts/migrate-wp/package.json` con deps `mysql2`, `convex/browser` (o `ConvexHttpClient`), `zod`, `pino`, `commander`.
- `tsconfig.json` propio.
- Entry `index.ts` con CLI (`--dry-run`, `--only <entity>`, `--limit <n>`, `--verbose`).
- Config via env: `WP_MYSQL_URL`, `CONVEX_URL`, `CONVEX_DEPLOY_KEY_MIGRATION`.
- Logger estructurado (pino).
- README del script con instrucciones de ejecución.

No hace:
- Ningún mapper aún (T02+).

### Criterios de aceptación

- [ ] `pnpm --filter migrate-wp run migrate -- --help` muestra CLI.
- [ ] Sin env vars: falla con error claro.
- [ ] Logger imprime JSON estructurado o pretty en dev.

### Archivos afectados

- `scripts/migrate-wp/package.json`
- `scripts/migrate-wp/tsconfig.json`
- `scripts/migrate-wp/index.ts`
- `scripts/migrate-wp/config.ts`
- `scripts/migrate-wp/logger.ts`
- `scripts/migrate-wp/README.md`

### Dependencias

- F0.setup.T01

### Estimación

S (3h)

### Notas técnicas

`ConvexHttpClient` de `convex/browser` con `setAuth(deployKey)`. No usar el cliente React.

---

## F1.migracion.T02 — Normalización de cédulas + detección de duplicados

### Objetivo

Función `normalizeCedula` (usada también por F2.pacientes) + detector de duplicados en el dataset origen con reporte pre-migración.

### Contexto

ARCH ADR-06. S2 documenta los formatos reales. Reporte de conflictos DEBE resolverse manualmente antes del cutover.

### Alcance

Sí hace:
- `packages/lib/cedula.ts`:
  - `normalizeCedula(raw: string): string` → `V-12345678` o `E-12345678`.
  - Retorna `null` (o lanza `InvalidCedulaError`) si no matchea.
- `scripts/migrate-wp/normalize.ts`:
  - Lee todos los `rv_pacientes`, normaliza cada cédula, agrupa por cédula normalizada.
  - Reporta duplicados (misma cédula, diferentes WP IDs) → CSV output.
- Tests unitarios en `packages/lib` (20+ casos edge de S2).

No hace:
- Resolución automática de duplicados (siempre manual).

### Criterios de aceptación

- [ ] `normalizeCedula("V- 33.338.896")` → `"V-33338896"`.
- [ ] `normalizeCedula("v21197865")` → `"V-21197865"`.
- [ ] `normalizeCedula("XX-123")` → error/null.
- [ ] Script genera `conflicts-cedulas.csv` con duplicados detectados.
- [ ] Casos raros de S2 tienen tests.

### Archivos afectados

- `packages/lib/cedula.ts`
- `packages/lib/cedula.test.ts`
- `scripts/migrate-wp/normalize.ts`

### Dependencias

- F1.migracion.T01
- S2.wp-migration (resuelto)

### Estimación

M (4h)

---

## F1.migracion.T03 — Mappers `rv_titulos` + `rv_examenes` → Convex

### Objetivo

Mapper que migra grupos y exámenes del plugin al schema Convex, respetando la lista final de S4.

### Contexto

`examenes_titulos` y `examenes` (ARCH §6). Precio en USD ya en origen (verificar en S2).

### Alcance

Sí hace:
- `scripts/migrate-wp/mappers/titulos.ts`: lee `rv_titulos`, mapea a `examenes_titulos`, escribe con `ConvexHttpClient.mutation(api.examenes.titulos.create)` (o mutation interna dedicada de migración).
- `scripts/migrate-wp/mappers/examenes.ts`: mismo patrón para `rv_examenes`, resolviendo `titulo_id` via `_migration_map`.
- Mutation interna `internal.migration.upsertTitulo` y `internal.migration.upsertExamen` que salta la validación de duplicados (usa `_migration_map` para idempotencia).
- Dry-run: sólo cuenta y reporta, no escribe.

No hace:
- Reasignación de grupos post-S4 (usar los mismos IDs mapeados en S4).

### Criterios de aceptación

- [ ] Dry-run reporta N títulos y M exámenes a migrar.
- [ ] Ejecución real crea todos los títulos y exámenes.
- [ ] Re-ejecución: 0 inserts nuevos (idempotencia via `_migration_map`).
- [ ] Precios preservados con precisión.

### Archivos afectados

- `scripts/migrate-wp/mappers/titulos.ts`
- `scripts/migrate-wp/mappers/examenes.ts`
- `packages/convex/migration.ts` (mutations internas)
- `packages/convex/schema.ts` (asegurar `_migration_map` con index)

### Dependencias

- F1.migracion.T01
- F1.migracion.T02
- F1.catalogo.T01
- F1.catalogo.T02

### Estimación

M (6h)

---

## F1.migracion.T04 — Mapper `rv_pacientes` con cédulas normalizadas

### Objetivo

Mapper de pacientes con normalización de cédula, resolución de duplicados post-conflict-report, y snapshot a `_migration_map`.

### Contexto

Depende de que los conflictos de T02 ya estén resueltos (manualmente o con reglas explícitas).

### Alcance

Sí hace:
- `scripts/migrate-wp/mappers/pacientes.ts`:
  - Lee `rv_pacientes`, normaliza cédula.
  - Si cédula duplicada y no hay resolución declarada → falla con error accionable.
  - Si duplicado con "merge rule" declarada (archivo `resolutions/pacientes.json`) → aplica.
  - Escribe pacientes via `internal.migration.upsertPaciente`.
  - Popula `_migration_map`.
- Mutation interna `internal.migration.upsertPaciente` que salta unique check si viene por migración (usa `_migration_map` para no duplicar).
- Reporte: N insertados, M skipped (idempotencia), K errores.

No hace:
- UI de resolución de conflictos (manual via JSON).

### Criterios de aceptación

- [ ] Dry-run cuenta correctamente.
- [ ] Ejecución real inserta pacientes con cédulas normalizadas.
- [ ] Duplicado sin resolución → error visible con `wp_id` para debug.
- [ ] Duplicado con resolución declarada → aplica correctamente.
- [ ] 204+ pacientes de origen quedan migrados.

### Archivos afectados

- `scripts/migrate-wp/mappers/pacientes.ts`
- `scripts/migrate-wp/resolutions/pacientes.json` (template vacío)
- `packages/convex/migration.ts` (extender)

### Dependencias

- F1.migracion.T02
- F2.pacientes.T01 (schema y validaciones — puede coordinarse en paralelo)

### Estimación

M (5h)

---

## F1.migracion.T05 — Mapper `rv_paquetes` + join `paquetes_examenes`

### Objetivo

Mapper de paquetes y su join con exámenes.

### Contexto

9 paquetes existentes.

### Alcance

Sí hace:
- Mapper `paquetes.ts` que lee `rv_paquetes` y `rv_paquetes_examenes` (join en WP).
- Resuelve `examen_id` via `_migration_map`.
- Escribe con mutation interna `internal.migration.upsertPaquete` + `upsertPaqueteExamen`.
- Preserva `orden` si existe en WP; si no, orden secuencial.

### Criterios de aceptación

- [ ] 9 paquetes migrados.
- [ ] Cada paquete tiene la lista correcta de exámenes (validado vs origen).
- [ ] Reejecutable idempotente.

### Archivos afectados

- `scripts/migrate-wp/mappers/paquetes.ts`
- `packages/convex/migration.ts` (extender)

### Dependencias

- F1.migracion.T03
- F2.paquetes.T01 (schema — coordinable)

### Estimación

M (4h)

---

## F1.migracion.T06 — Mapper `rv_resultados` + detalle con snapshots

### Objetivo

Mapper de resultados y su detalle, snapshotenado nombre y precio de cada examen (del origen — NO del catálogo Convex actual).

### Contexto

ARCH ADR-04. 652 resultados. Los snapshots preservan datos históricos.

### Alcance

Sí hace:
- `scripts/migrate-wp/mappers/resultados.ts` que:
  - Lee `rv_resultados` (header) y `rv_resultados_detalle` (líneas).
  - Resuelve `paciente_id` y `examen_id` via `_migration_map`.
  - Snapshot `nombre_snap` y `precio_snap` desde columnas WP (o desde tabla exámenes en el momento — según S2 defina).
  - Determina `estado` (Pendiente / Completado) desde flag WP.
  - Escribe con `internal.migration.upsertResultado` + N `upsertResultadoExamen`.
- Preserva `created_at` original (timestamp WP).

No hace:
- Regenerar PDFs (los originales del WP se conservan como backup fuera del sistema).

### Criterios de aceptación

- [ ] 652 resultados migrados.
- [ ] Cada línea tiene snapshot correcto.
- [ ] Verify: query `resultados_examenes` para 5 resultados random matchea el origen fila a fila.
- [ ] Idempotencia.

### Archivos afectados

- `scripts/migrate-wp/mappers/resultados.ts`
- `packages/convex/migration.ts` (extender)

### Dependencias

- F1.migracion.T03
- F1.migracion.T04
- F2.resultados.T01 (schema — coordinable)

### Estimación

L (8h)

---

## F1.migracion.T07 — Mapper `rv_presupuestos` + detalle + snapshots

### Objetivo

Mapper de presupuestos y su detalle, con snapshot y decisión `paciente_id` vs `paciente_nombre_libre`.

### Contexto

545 presupuestos. ARCH ADR-05.

### Alcance

Sí hace:
- `scripts/migrate-wp/mappers/presupuestos.ts` que:
  - Lee `rv_presupuestos` y `rv_presupuestos_detalle`.
  - Si `paciente_id` (WP) existe → resuelve Convex ID.
  - Si en WP el presupuesto tiene sólo un nombre suelto sin FK → poblar `paciente_nombre_libre`.
  - Preserva `descuento_pct`, `ganancia_pct`, `tasa_bs`, `total_usd`, `total_bs`, `estado`.
  - Snapshots en detalle.

### Criterios de aceptación

- [ ] 545 presupuestos migrados.
- [ ] Distinción `paciente_id` vs `nombre_libre` respetada.
- [ ] Totales USD/Bs preservados con precisión.
- [ ] Estados correctos.
- [ ] Idempotencia.

### Archivos afectados

- `scripts/migrate-wp/mappers/presupuestos.ts`
- `packages/convex/migration.ts` (extender)

### Dependencias

- F1.migracion.T03
- F1.migracion.T04
- F2.presupuestos.T01 (schema — coordinable)

### Estimación

L (8h)

---

## F1.migracion.T08 — Reporte final + verify + rollback playbook

### Objetivo

Comando `--verify` que compara counts + spot-check de 5 registros random por entidad contra el origen, y documenta el procedimiento de rollback.

### Contexto

PRD §8 (rollback), §9 (success — 100% migrados).

### Alcance

Sí hace:
- CLI flag `--verify` que:
  - Cuenta registros en Convex por entidad.
  - Compara vs count WP.
  - Selecciona 5 IDs random por entidad, spot-check campo a campo.
  - Reporte final JSON + tabla en consola.
- Documento `scripts/migrate-wp/ROLLBACK.md` con procedimiento paso a paso (restaurar dump MySQL, cómo dejar WP en read-only, cómo re-exportar desde Convex si post-cutover hay que rollback).
- Comando `--reset` (DESTRUCTIVO, solo en dev/preview) para limpiar `_migration_map` y todas las tablas de dominio antes de re-correr.

### Criterios de aceptación

- [ ] `--verify` reporta 100% match esperado.
- [ ] Discrepancia genera exit code != 0.
- [ ] `ROLLBACK.md` cubre pre-cutover, in-cutover, post-cutover.
- [ ] `--reset` protegido con confirmación explícita + env flag.

### Archivos afectados

- `scripts/migrate-wp/verify.ts`
- `scripts/migrate-wp/reset.ts`
- `scripts/migrate-wp/ROLLBACK.md`

### Dependencias

- F1.migracion.T03
- F1.migracion.T04
- F1.migracion.T05
- F1.migracion.T06
- F1.migracion.T07

### Estimación

M (5h)
