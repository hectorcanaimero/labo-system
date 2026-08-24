---
type: spec
phase: F1
package: catalogo
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - F0.auth
  - S4.grupos-examenes
blocks:
  - F1.migracion
  - F2.paquetes
  - F2.resultados
  - F2.presupuestos
generated_by: orch-spec
generated_at: 2026-08-23
title: "F1.catalogo — Catálogo de Exámenes (Títulos + Exámenes + Import Excel)"
---

# F1 · Catálogo de Exámenes

CRUD de la jerarquía **Título (grupo) → Examen** con búsqueda, validación anti-duplicados por Título, e importación masiva desde Excel (SheetJS). Módulo Admin-only. Bloquea F1.migracion (que necesita seed de títulos) y todos los módulos que agregan exámenes a resultados/presupuestos/paquetes.

## Referencias

- **PRD**: §4 F4 (Catálogo).
- **ARCH**: §6 (tablas `examenes_titulos`, `examenes`), §3 componente F4.
- **Spike**: S4 (lista final de títulos).

---

## F1.catalogo.T01 — CRUD `examenes_titulos` (grupos)

### Objetivo

Queries/mutations para crear/listar/renombrar/borrar títulos (grupos) del catálogo.

### Contexto

Schema `examenes_titulos` (ARCH §6) — mutable, sin IDs hardcoded. Borrar título requiere que no tenga exámenes hijos.

### Alcance

Sí hace:
- `packages/convex/examenes.ts`:
  - Query `titulos.list()`: retorna todos los títulos ordenados por `orden`.
  - Mutation `titulos.create({ nombre, orden })`: valida nombre único.
  - Mutation `titulos.update({ id, nombre?, orden? })`.
  - Mutation `titulos.delete({ id })`: rechaza si tiene exámenes hijos activos.
  - Mutation `titulos.reorder({ orderedIds })`: para dnd de reordenamiento.
- `requireRole(ctx, "admin")` en todas las mutations.
- audit_log de cambios.

No hace:
- UI (T05).
- Import Excel (T04).

### Criterios de aceptación

- [ ] Crear título único funciona.
- [ ] Crear título duplicado (mismo `nombre`) rechaza `TITULO_DUPLICADO`.
- [ ] Borrar título con exámenes rechaza `TITULO_TIENE_EXAMENES`.
- [ ] Reorder actualiza `orden` de todos los IDs pasados.
- [ ] Operador rechazado.

### Archivos afectados

- `packages/convex/examenes.ts` (submodulo `titulos` — o dividir en archivos si crece)

### Dependencias

- F0.setup.T03
- F0.auth.T04

### Estimación

M (4h)

### Notas técnicas

Convex no tiene subcarpetas per-entidad en `_generated`; se usa `examenes.titulos.create` como namespace o se crea `titulos.ts` separado.

---

## F1.catalogo.T02 — CRUD `examenes`

### Objetivo

Queries/mutations para crear/listar/editar/soft-delete de exámenes dentro de un título.

### Contexto

Schema `examenes` con `titulo_id`, `nombre` único por título, `precio_usd`, `unidad?`, `valores_referencia?`, `activo`.

### Alcance

Sí hace:
- Query `examenes.listByTitulo({ titulo_id })`.
- Query `examenes.search({ term })`: busca por prefix en `nombre` (index `by_nombre_search`), top 10.
- Query `examenes.getById({ id })`.
- Mutation `examenes.create({ titulo_id, nombre, precio_usd, unidad?, valores_referencia? })`: valida `nombre` único dentro del `titulo_id`.
- Mutation `examenes.update({ id, ... })`.
- Mutation `examenes.deactivate({ id })`: soft-delete (`activo: false`).
- Mutation `examenes.activate({ id })`.
- `requireRole(ctx, "admin")`.

No hace:
- Borrado hard (nunca — snapshots dependen del FK).
- UI (T05).

### Criterios de aceptación

- [ ] Crear examen con nombre único en título OK.
- [ ] Crear examen con nombre repetido en mismo título rechaza `EXAMEN_DUPLICADO_EN_TITULO`.
- [ ] Mismo nombre en OTRO título es válido.
- [ ] Editar precio no afecta snapshots existentes (verificado con test).
- [ ] Soft-delete oculta de listados default.
- [ ] Búsqueda retorna top 10 por prefix.

### Archivos afectados

- `packages/convex/examenes.ts`

### Dependencias

- F1.catalogo.T01

### Estimación

M (5h)

### Notas técnicas

Búsqueda por prefix: Convex índice `by_nombre_search` + `.withSearchIndex` (si se usa search index) o filter en JS sobre top-N. En caso de search index, requiere declaración explícita en schema.

---

## F1.catalogo.T03 — Búsqueda con highlight en UI (utility)

### Objetivo

Utilidad de highlight de término en resultado de búsqueda (usada en catálogo, y reusable en pacientes/resultados/presupuestos).

### Contexto

PRD §4 F4 pide highlight del término. Es utility, no vive en Convex.

### Alcance

Sí hace:
- `packages/lib/highlight.ts` con `highlight(text: string, term: string): { parts: Array<{ text, match: boolean }> }`.
- Componente `packages/ui/text/HighlightedText.tsx` que renderiza con `<mark>`.
- Tests unitarios (case-insensitive, múltiples matches, término vacío).

No hace:
- Fuzzy search (v1 es prefix match del backend + highlight cliente sobre el resultado).

### Criterios de aceptación

- [ ] `highlight("Hemograma", "hemo")` retorna partes correctas.
- [ ] Highlight case-insensitive.
- [ ] Term vacío retorna texto sin cambios.
- [ ] Múltiples ocurrencias resaltan todas.

### Archivos afectados

- `packages/lib/highlight.ts`
- `packages/ui/text/HighlightedText.tsx`
- `packages/lib/highlight.test.ts`

### Dependencias

- F0.setup.T01

### Estimación

S (2h)

### Notas técnicas

Sanitizar el término para evitar regex injection (`escapeRegex`).

---

## F1.catalogo.T04 — Importación Excel (SheetJS) con reporte

### Objetivo

Convex action que recibe un archivo XLSX y crea/actualiza títulos+exámenes en batch, con reporte de creados / actualizados / duplicados / errores.

### Contexto

PRD §4 F4 (bullet importación masiva). Debe ser Admin. Volumen 250+ exámenes.

### Alcance

Sí hace:
- `packages/lib/xlsx-import.ts`: parser server-side de XLSX a rows `{ titulo, nombre, precio_usd, unidad?, valores_referencia? }`.
- Convex action `examenes.importXlsx({ storageId })` (Node runtime `"use node"`):
  - Lee archivo de storage.
  - Parsea con SheetJS (`xlsx`).
  - Por cada row: crea título si no existe; crea o actualiza examen (upsert por `titulo_id + nombre`).
  - Retorna reporte `{ titulos_creados, examenes_creados, examenes_actualizados, duplicados_ignorados, errores: [{ row, msg }] }`.
- Mutation `examenes.generateImportUploadUrl()`.
- UI: página `/examenes/import` con drag-drop + tabla de reporte post-import.
- Template XLSX de ejemplo disponible para descarga (`/public/plantilla-import.xlsx`).

No hace:
- CSV import (v1 es sólo XLSX).
- Migración WP (F1.migracion).

### Criterios de aceptación

- [ ] Upload XLSX válido inserta títulos y exámenes.
- [ ] Reporte muestra counts correctos.
- [ ] Fila con `titulo` vacío se reporta como error, no rompe todo.
- [ ] Reimport idempotente (mismo archivo dos veces no duplica).
- [ ] Operador rechazado.
- [ ] Archivo > 10 MB rechaza.

### Archivos afectados

- `packages/lib/xlsx-import.ts`
- `packages/convex/examenes.ts` (action `importXlsx`)
- `apps/web/app/(app)/examenes/import/page.tsx`
- `apps/web/app/(app)/examenes/import/ImportWizard.tsx`
- `apps/web/public/plantilla-import.xlsx`

### Dependencias

- F1.catalogo.T01
- F1.catalogo.T02
- S4.grupos-examenes (resuelto — lista final de títulos)

### Estimación

L (10h)

### Notas técnicas

SheetJS `xlsx` tiene CVEs conocidas (ver ARCH §9). Pin versión, usar sólo server-side.

---

## F1.catalogo.T05 — UI CRUD `/examenes` (list + form modal + search)

### Objetivo

Página `/examenes` con navegación por títulos (accordion o tabs), CRUD de títulos y exámenes, búsqueda con highlight, botón "Importar Excel".

### Contexto

PRD §4 F4; ARCH §3 F4.

### Alcance

Sí hace:
- `apps/web/app/(app)/examenes/page.tsx` (Server component preload).
- Componente `TitulosNavigator` (accordion de títulos con exámenes hijos).
- Modal `ExamenFormDialog` (create/edit).
- Modal `TituloFormDialog` (create/edit).
- Input de búsqueda debounced 300ms usando `HighlightedText`.
- Botón "Importar Excel" → link a `/examenes/import`.
- Botón "Nuevo Título" y "Nuevo Examen" (Admin only).
- Empty states.

No hace:
- Drag-and-drop de reordenamiento (v1 usa botón "Subir/Bajar" simple; dnd real en F2.paquetes ya cubre el componente).
- Vista de paquetes desde acá.

### Criterios de aceptación

- [ ] Lista títulos con exámenes hijos.
- [ ] Crear título abre modal, guarda, refresca lista.
- [ ] Crear examen dentro de un título OK.
- [ ] Editar examen precio funciona.
- [ ] Búsqueda "hemo" resalta términos en resultados.
- [ ] Botón "Importar" navega a wizard.
- [ ] Operador rechazado (middleware) — pero si accede vía deep link, redirect a dashboard.

### Archivos afectados

- `apps/web/app/(app)/examenes/page.tsx`
- `apps/web/app/(app)/examenes/TitulosNavigator.tsx`
- `apps/web/app/(app)/examenes/ExamenFormDialog.tsx`
- `apps/web/app/(app)/examenes/TituloFormDialog.tsx`

### Dependencias

- F0.setup.T06
- F0.auth.T03
- F1.catalogo.T01
- F1.catalogo.T02
- F1.catalogo.T03

### Estimación

L (8h)

### Notas técnicas

`useQuery` con `titulos.list()` y `examenes.listByTitulo({ titulo_id })` por título expandido (lazy).
