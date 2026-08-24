---
type: spec
phase: F3
package: export
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - F0.auth
  - F2.pacientes
  - F2.resultados
  - F2.presupuestos
  - S6.export-details
blocks: []
generated_by: orch-spec
generated_at: 2026-08-23
title: "F3.export — Exportación CSV (Pacientes, Presupuestos, Resultados, Costos)"
---

# F3 · Exportación de Datos

Actions Convex que generan CSV vía File Storage con URL firmada. 4 exportes: Pacientes, Presupuestos, Resultados, Costos.

## Referencias

- **PRD**: §4 F10 (Exportación — NUEVO).
- **ARCH**: ADR-09 (CSV + File Storage), §4.4 (dataflow), §5.1.
- **Spike**: S6 (formato + columnas + performance validados).

---

## F3.export.T01 — Utility CSV writer + subir a Storage + URL firmada

### Objetivo

Helper reutilizable para: generar CSV string desde rows → subir a Convex File Storage → retornar `storageId` + generar URL firmada.

### Alcance

Sí hace:
- `packages/convex/helpers/csv-export.ts`:
  - `writeCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key, header, format? }>): string` (UTF-8 BOM).
  - `uploadCsvToStorage(ctx, csv: string, filename: string): Promise<storageId>`.
- Mutation compartida `exports.getSignedUrl({ storageId })` que devuelve URL firmada.
- Cache-Control header apropiado.

### Criterios de aceptación

- [ ] `writeCsv` escapa comillas y comas correctamente.
- [ ] UTF-8 BOM presente (Excel-friendly).
- [ ] `uploadCsvToStorage` retorna storageId válido.
- [ ] `getSignedUrl` retorna URL descargable ~1h.

### Archivos afectados

- `packages/convex/helpers/csv-export.ts`
- `packages/convex/exports.ts` (mutation `getSignedUrl`)

### Dependencias

- F0.auth.T04
- S6.export-details

### Estimación

M (4h)

### Notas técnicas

Convex action `"use node"` si usa `papaparse`. Alternativa: escribir CSV a mano (más ligero, sin dependencia).

---

## F3.export.T02 — Action `exports.pacientesCSV`

### Objetivo

Exporta lista de pacientes con filtros aplicados a CSV.

### Alcance

Sí hace:
- Action `pacientesCSV({ filters?: { term? }})`:
  - Lee pacientes matcheando filtros (paginación interna 1000).
  - Columnas de S6: cédula, nombre, apellido, fecha_nacimiento, sexo, teléfono, email, dirección, created_at.
  - Sube CSV → retorna `{ storageId }`.

### Criterios de aceptación

- [ ] 200+ pacientes exportados sin timeout.
- [ ] Columnas coinciden con spec S6.
- [ ] Fecha formato spec S6.

### Archivos afectados

- `packages/convex/exports.ts` (action)

### Dependencias

- F2.pacientes.T02
- F3.export.T01

### Estimación

S (3h)

---

## F3.export.T03 — Action `exports.presupuestosCSV`

### Objetivo

Exporta presupuestos con filtros (desde/hasta/estado) a CSV.

### Alcance

Sí hace:
- Action `presupuestosCSV({ filters: { desde?, hasta?, estado? } })`.
- Columnas de S6: fecha, paciente (nombre o libre), estado, subtotal USD, descuento %, ganancia %, total USD, tasa Bs, total Bs.
- Paginación interna.

### Criterios de aceptación

- [ ] 545+ presupuestos exportados.
- [ ] Filtros aplicados.
- [ ] Columnas correctas.

### Archivos afectados

- `packages/convex/exports.ts` (extender)

### Dependencias

- F2.presupuestos.T02
- F3.export.T01

### Estimación

S (3h)

---

## F3.export.T04 — Action `exports.resultadosCSV`

### Objetivo

Exporta resultados con filtros a CSV.

### Alcance

Sí hace:
- Action `resultadosCSV({ filters })`.
- Columnas de S6: fecha muestra, fecha resultado, paciente, cédula, médico solicitante, estado, count exámenes.
- Opcional: incluir líneas exámenes en hoja adicional (o export separado — decidir S6).

### Criterios de aceptación

- [ ] Filtros aplicados.
- [ ] 652+ resultados OK.

### Archivos afectados

- `packages/convex/exports.ts` (extender)

### Dependencias

- F2.resultados.T02
- F3.export.T01

### Estimación

S (3h)

---

## F3.export.T05 — Action `exports.costosCSV`

### Objetivo

Exporta histórico de precios por examen (snapshot histórico).

### Alcance

Sí hace:
- Action `costosCSV()`:
  - Lee todos los `resultados_examenes` + `presupuestos_examenes` con snapshots.
  - Agrupa por `examen_id` y muestra evolución de `precio_snap` en el tiempo.
  - Columnas: fecha, examen (nombre snap), precio USD snap, contexto (resultado/presupuesto).

### Criterios de aceptación

- [ ] Muestra evolución de precios por examen.
- [ ] Volumen ~10k rows sin timeout.

### Archivos afectados

- `packages/convex/exports.ts` (extender)

### Dependencias

- F2.resultados.T02
- F2.presupuestos.T02
- F3.export.T01

### Estimación

M (4h)

---

## F3.export.T06 — Cron `cleanupExports` (semanal, borra > 7d)

### Objetivo

Cron que borra archivos de export del File Storage con `age > 7 días`.

### Contexto

ARCH ADR-09 y §5.3.

### Alcance

Sí hace:
- Registrar cron en `packages/convex/crons.ts`.
- Action `internalAction("crons/cleanupExports")` que:
  - Lista storage items con tag `"export"` (metadata al store).
  - Borra items creados hace > 7d.
- Audit log del borrado.

### Criterios de aceptación

- [ ] Cron registrado y visible en Convex dashboard.
- [ ] Borrado sólo elimina items marcados como export.
- [ ] Audit log presente.

### Archivos afectados

- `packages/convex/crons.ts`
- `packages/convex/crons/cleanupExports.ts`

### Dependencias

- F3.export.T01

### Estimación

S (2h)

---

## F3.export.T07 — Componente `<ExportButton>` reusable

### Objetivo

Botón "Exportar" en cada lista (pacientes, presupuestos, resultados) que llama la action correspondiente y descarga el CSV.

### Alcance

Sí hace:
- `packages/ui/exports/ExportButton.tsx`:
  - Props: `actionName: string`, `filters?`.
  - `useAction(...)` → recibe storageId → `useMutation(getSignedUrl)` → `window.open`.
  - Loading state.
- Integrado en `/pacientes`, `/presupuestos`, `/resultados` (páginas existentes de F2).

### Criterios de aceptación

- [ ] Click descarga CSV con filtros aplicados.
- [ ] Loading visible.
- [ ] Error toast si falla.

### Archivos afectados

- `packages/ui/exports/ExportButton.tsx`
- `apps/web/app/(app)/pacientes/PacientesList.tsx` (integrar botón)
- `apps/web/app/(app)/presupuestos/PresupuestosList.tsx` (integrar botón)
- `apps/web/app/(app)/resultados/ResultadosList.tsx` (integrar botón)

### Dependencias

- F3.export.T02
- F3.export.T03
- F3.export.T04
- F3.export.T05

### Estimación

S (3h)

### Notas técnicas

Feature flag `NEXT_PUBLIC_FEATURE_EXPORTACION` para poder deshabilitar si el SPIKE S6 tarda.
