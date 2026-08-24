---
type: spec
phase: F2
package: pacientes
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - F0.auth
blocks:
  - F1.migracion
  - F2.resultados
  - F2.presupuestos
  - F3.dashboard
generated_by: orch-spec
generated_at: 2026-08-23
title: "F2.pacientes — CRUD Pacientes + búsqueda + cédula normalizada"
---

# F2 · Pacientes

CRUD de pacientes con cédula única normalizada, búsqueda en tiempo real (debounce 300ms), ficha con historial de resultados y presupuestos. Reutiliza `normalizeCedula` de `packages/lib`.

## Referencias

- **PRD**: §4 F3 (Pacientes), §9 (métrica búsqueda ≤ 300 ms).
- **ARCH**: ADR-06 (cédula normalizada), §6 (tabla `pacientes` + indexes), §3 componente F3.

---

## F2.pacientes.T01 — Schema validations + `normalizeCedula` reuse

### Objetivo

Schemas Zod de pacientes y wiring con `normalizeCedula` en `packages/lib` (creado en F1.migracion.T02).

### Contexto

`normalizeCedula` puede ser creada en F1.migracion.T02 o aquí — coordinar. Este task asume que existe.

### Alcance

Sí hace:
- `packages/lib/schemas/paciente.ts` con schemas `pacienteCreate`, `pacienteUpdate`, `pacienteSearch`.
- Zod `.transform` que aplica `normalizeCedula` al parse.
- Sexo enum `["M", "F", "O"]`.
- Fecha nacimiento como `z.date()` transformada a `number` (timestamp).
- Tests unitarios de las validaciones.

No hace:
- Mutations (T02).
- UI (T05).

### Criterios de aceptación

- [ ] Schema rechaza `nombre` vacío.
- [ ] Schema rechaza `cedula` sin prefijo V/E.
- [ ] Schema transforma cédula "raw" a normalizada.
- [ ] Fecha nacimiento futura rechaza.

### Archivos afectados

- `packages/lib/schemas/paciente.ts`
- `packages/lib/schemas/paciente.test.ts`

### Dependencias

- F0.setup.T01
- F1.migracion.T02 (si existe `normalizeCedula`; si no, aquí se crea)

### Estimación

S (3h)

---

## F2.pacientes.T02 — CRUD queries/mutations `pacientes`

### Objetivo

Queries y mutations para create, get, list paginado, update, deactivate.

### Contexto

ARCH §5.1 (`pacientes.create`, `pacientes.search`), §6.

### Alcance

Sí hace:
- `packages/convex/pacientes.ts`:
  - Query `getById({ id })`.
  - Query `list({ cursor?, limit? })` — paginado, orden por `created_at` desc.
  - Mutation `create({ ... })` — valida cédula única (check contra index `by_cedula`).
  - Mutation `update({ id, ... })`.
  - Mutation `deactivate({ id })` — soft-delete si tiene resultados/presupuestos; hard-delete OK si no.
- Errores `CEDULA_DUPLICADA`, `CEDULA_INVALIDA`, `PACIENTE_TIENE_HISTORIAL`.
- `requireRole(ctx, "operador" | "admin")`.

No hace:
- Búsqueda (T03).
- Ficha con historial (T04).

### Criterios de aceptación

- [ ] Create con cédula única OK.
- [ ] Create con cédula existente lanza `CEDULA_DUPLICADA`.
- [ ] Update no toca cédula sin validación (idempotente si cambia otros campos).
- [ ] Deactivate con historial → soft-delete.
- [ ] Deactivate sin historial → hard-delete permitido.

### Archivos afectados

- `packages/convex/pacientes.ts`

### Dependencias

- F0.auth.T04
- F2.pacientes.T01

### Estimación

M (5h)

### Notas técnicas

Soft-delete requiere flag `activo: boolean` — agregar a schema si no está. Alternativa: no permitir delete si hay historial (más simple, ver PRD).

---

## F2.pacientes.T03 — Query `search` con debounce y top-10

### Objetivo

Query `pacientes.search({ term })` que busca por prefix en nombre/apellido/cédula, retorna top 10.

### Contexto

ARCH §5.1. NFR búsqueda ≤ 300 ms p95.

### Alcance

Sí hace:
- Query `search({ term })`:
  - Normaliza term (si empieza con V/E → intenta match por cédula).
  - Sino: prefix search en `nombre` + `apellido`.
  - Retorna top 10 con `{ _id, nombre, apellido, cedula, fecha_nacimiento }`.
- Component reusable `packages/ui/pacientes/PacienteAutocomplete.tsx`:
  - Input debounced 300ms.
  - Dropdown con highlight.
  - `onSelect(paciente)`.
- Tests unitarios (mock query).

No hace:
- Fuzzy search.

### Criterios de aceptación

- [ ] Term "Juan" retorna pacientes matcheando prefix.
- [ ] Term "V-2119" retorna pacientes con cédula matcheando prefix.
- [ ] Debounce funciona (verificado con test manual).
- [ ] p95 < 300 ms con 500+ pacientes migrados (medir post-cutover).

### Archivos afectados

- `packages/convex/pacientes.ts` (extender)
- `packages/ui/pacientes/PacienteAutocomplete.tsx`

### Dependencias

- F2.pacientes.T02
- F1.catalogo.T03 (`HighlightedText` reuse)

### Estimación

M (5h)

### Notas técnicas

Convex `by_search_nombre` (index compuesto sobre `nombre`, `apellido`) — filter en JS post-index-scan si es necesario.

---

## F2.pacientes.T04 — Query `getWithHistorial` (ficha)

### Objetivo

Query que retorna paciente + últimos N resultados + últimos N presupuestos, ordenados desc.

### Contexto

PRD §4 F3 (ficha con historial).

### Alcance

Sí hace:
- Query `pacientes.getWithHistorial({ id, resultadosLimit?, presupuestosLimit? })`.
- Retorna `{ paciente, resultados: [...], presupuestos: [...] }`.
- Calcula edad server-side.
- Auth requerida (Operador OK).

No hace:
- UI (T05).

### Criterios de aceptación

- [ ] Retorna paciente completo.
- [ ] Retorna hasta N resultados en orden `created_at` desc.
- [ ] Retorna hasta N presupuestos en orden `created_at` desc.
- [ ] Retorna edad calculada.
- [ ] Retorna arrays vacíos si sin historial.

### Archivos afectados

- `packages/convex/pacientes.ts` (extender)
- `packages/lib/edad.ts` (utility)

### Dependencias

- F2.pacientes.T02
- F2.resultados.T02 (schema) — coordinable
- F2.presupuestos.T02 (schema) — coordinable

### Estimación

S (3h)

---

## F2.pacientes.T05 — UI `/pacientes` (list + search + form + ficha)

### Objetivo

Página `/pacientes` con lista paginada, búsqueda en tiempo real, botón "Nuevo", modal form. Página `/pacientes/[id]` con ficha e historial.

### Contexto

PRD §4 F3; ARCH §3 F3.

### Alcance

Sí hace:
- `apps/web/app/(app)/pacientes/page.tsx`:
  - Server component preload de primer page.
  - Client component `PacientesList` con `useQuery(list)` + input de búsqueda debounced.
  - Botón "Nuevo Paciente" → modal.
- `apps/web/app/(app)/pacientes/[id]/page.tsx`:
  - Ficha con datos + tabs "Resultados" y "Presupuestos".
  - Botón "Editar".
- Modal `PacienteFormDialog` (create/edit) con RHF + zod.
- Confirmación de delete/deactivate.
- Empty state ("Sin pacientes").

### Criterios de aceptación

- [ ] Lista muestra pacientes paginados.
- [ ] Búsqueda en tiempo real (debounce 300ms) filtra la lista.
- [ ] Crear paciente OK; error de cédula duplicada visible.
- [ ] Ficha muestra edad + tabs.
- [ ] Editar y guardar funciona.
- [ ] Delete/deactivate con confirmación.

### Archivos afectados

- `apps/web/app/(app)/pacientes/page.tsx`
- `apps/web/app/(app)/pacientes/PacientesList.tsx`
- `apps/web/app/(app)/pacientes/PacienteFormDialog.tsx`
- `apps/web/app/(app)/pacientes/[id]/page.tsx`
- `apps/web/app/(app)/pacientes/[id]/FichaTabs.tsx`

### Dependencias

- F0.setup.T06
- F0.auth.T03
- F2.pacientes.T02
- F2.pacientes.T03
- F2.pacientes.T04

### Estimación

L (10h)
