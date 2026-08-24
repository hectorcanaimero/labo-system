---
type: spec
phase: F4
package: cutover
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - F0.auth
  - F1.config
  - F1.catalogo
  - F1.migracion
  - F2.pacientes
  - F2.paquetes
  - F2.resultados
  - F2.presupuestos
  - F3.dashboard
  - F3.export
  - F3.bcv
  - F4.hardening
blocks: []
generated_by: orch-spec
generated_at: 2026-08-23
title: "F4.cutover — Dry-run final + smoke tests + go-live + rollback"
---

# F4 · Cutover

Última milla. Dry-run completo de migración contra copia MySQL prod, validación diff-a-diff con Admin, ventana de cutover con downtime del plugin WP, migración final, smoke tests, go-live LabSystem, plugin WP en modo read-only.

## Referencias

- **PRD**: §8 rollout Sem 10, §9 success criteria, §8 rollback.
- **ARCH**: §8 plan rollout técnico, §9 riesgos.

---

## F4.cutover.T01 — Dry-run completo migración contra copia MySQL prod

### Objetivo

Ejecutar `migrate-wp --dry-run --verify` contra dump/copia de MySQL prod para reportar lo que va a migrar sin escribir.

### Contexto

Depende de F1.migracion.T08 (`--verify` implementado). Reunión con Admin post-run para revisar reporte.

### Alcance

Sí hace:
- Obtener dump MySQL prod (o snapshot readonly con timestamp T0).
- Correr `pnpm --filter migrate-wp run migrate -- --dry-run --verify` contra el dump.
- Generar reporte JSON + tabla humana con: counts esperados, conflictos detectados, warnings.
- Sesión con Admin (Rosa) para revisar y aprobar/ajustar `resolutions/pacientes.json`.
- Timeline documentado del run (cuánto tarda).

No hace:
- Escritura real (dry-run).

### Criterios de aceptación

- [ ] Reporte con counts exactos (204+ pacientes, 250+ exámenes, etc.).
- [ ] Cero conflictos no resueltos.
- [ ] Admin firma la aprobación por escrito (comentario en tracker).
- [ ] Timeline < 60min conocido.

### Archivos afectados

- Reporte en `docs/migration/dry-run-<fecha>.md`.
- Actualizar `scripts/migrate-wp/resolutions/pacientes.json` con resoluciones firmadas.

### Dependencias

- F1.migracion.T08
- F4.hardening.T03 (schemas endurecidos)

### Estimación

M (6h — incluye reunión)

---

## F4.cutover.T02 — Ventana de cutover: WP read-only + migración real

### Objetivo

Ejecutar la migración real en ventana acordada, con plugin WP puesto en read-only durante la ejecución.

### Contexto

PRD §7 (ventana coordinada), §8 rollout.

### Alcance

Sí hace:
- Comunicación previa al equipo del laboratorio (email + WhatsApp Business).
- Pasos:
  1. Backup MySQL prod (dump completo con timestamp T0).
  2. Poner plugin WP en modo mantenimiento / read-only (banner "sistema en actualización, no ingresar datos nuevos").
  3. Ejecutar `pnpm --filter migrate-wp run migrate -- --confirm` contra prod Convex.
  4. Ejecutar `--verify` post-migración.
  5. Si verify OK → smoke tests (T03).
  6. Si smoke OK → go-live LabSystem, quitar WP mantenimiento pero dejar en read-only.
- Runbook `docs/migration/CUTOVER-RUNBOOK.md` con cada paso, tiempo esperado, criterio de abort.

No hace:
- Fixes en vivo (aborta si falla).

### Criterios de aceptación

- [ ] Backup MySQL creado antes de tocar nada.
- [ ] Migración real termina sin errores.
- [ ] `--verify` retorna 100% match.
- [ ] LabSystem operativo post-migración.
- [ ] WP en read-only (banner o plugin de "solo lectura").
- [ ] Comunicación enviada al equipo.

### Archivos afectados

- `docs/migration/CUTOVER-RUNBOOK.md`

### Dependencias

- F4.cutover.T01

### Estimación

L (8h — incluye ventana de ejecución)

### Notas técnicas

Ejecutar en horario fuera de operativa (viernes noche o sábado madrugada). Convex prod deploy debe estar creado y probado antes.

---

## F4.cutover.T03 — Smoke tests post-cutover (checklist manual + Playwright)

### Objetivo

Checklist manual + subset Playwright que valida los 10 flujos críticos con datos reales migrados.

### Alcance

Sí hace:
- Checklist en `docs/migration/SMOKE-TESTS.md`:
  1. Login Admin y Operador.
  2. Dashboard carga con KPIs reales.
  3. Buscar 3 pacientes conocidos (por cédula, nombre).
  4. Abrir ficha de paciente con historial migrado.
  5. Crear resultado nuevo (paciente + exámenes).
  6. Descargar PDF de resultado migrado (verificar snapshots).
  7. Crear presupuesto (nombre libre + real).
  8. Convertir presupuesto a resultado.
  9. Exportar CSV de presupuestos.
  10. Verificar tasa BCV automática funciona (o manual override).
- Ejecutar suite Playwright de F4.hardening.T05 contra prod (con user de test).
- Reporte de smoke firmado por Admin.

### Criterios de aceptación

- [ ] 10/10 items checklist manual pasan.
- [ ] Playwright E2E pasa contra prod.
- [ ] Admin firma go-live.

### Archivos afectados

- `docs/migration/SMOKE-TESTS.md`

### Dependencias

- F4.cutover.T02
- F4.hardening.T05

### Estimación

M (4h)

---

## F4.cutover.T04 — Plan de rollback + procedimiento post-cutover

### Objetivo

Documentar y probar el procedimiento de rollback (WP read-only backup + procedimiento de re-import).

### Contexto

PRD §8 rollback.

### Alcance

Sí hace:
- `docs/migration/POST-CUTOVER-PLAYBOOK.md` con:
  - Cómo funciona WP en modo read-only 30d como backup.
  - Procedimiento de emergencia: si LabSystem tiene bug bloqueante → cómo reactivar WP para operar.
  - Procedimiento de re-import de datos post-cutover si hay que rollback.
  - Dumps periódicos Convex + export XLSX mensual.
- Ensayar el procedimiento de rollback en preview.

### Criterios de aceptación

- [ ] Playbook completo y revisado.
- [ ] Ensayo de rollback documentado con evidencia.
- [ ] Dump periódico Convex configurado.

### Archivos afectados

- `docs/migration/POST-CUTOVER-PLAYBOOK.md`

### Dependencias

- F1.migracion.T08

### Estimación

M (4h)

---

## F4.cutover.T05 — Monitoreo uptime + primer mes post-cutover

### Objetivo

Configurar monitoreo, alertas y checkpoint del primer mes.

### Contexto

PRD §9 success (uptime 99.5%, cero P0/P1 15d post-cutover).

### Alcance

Sí hace:
- Configurar alertas Convex (uptime < 99.5%, PDF render > 5s p95).
- Configurar alerta email BCV stale (F3.bcv.T04 ya lo cubre).
- Dashboard interno de métricas (Vercel + Convex nativo).
- Ceremonia checkpoint día 15 y día 30 post-cutover con Admin.
- Documentar tickets/incidentes encontrados.

### Criterios de aceptación

- [ ] Alertas activas.
- [ ] Checkpoints día 15 y 30 realizados.
- [ ] Reporte "primer mes" con métricas vs targets del PRD §9.
- [ ] Cero P0/P1 abiertos al día 15 (success criteria).

### Archivos afectados

- Configuración en Convex dashboard / Vercel dashboard.
- `docs/migration/POST-CUTOVER-METRICS.md`.

### Dependencias

- F4.cutover.T03

### Estimación

M (4h — spread across weeks)
