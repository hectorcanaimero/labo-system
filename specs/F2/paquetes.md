---
type: spec
phase: F2
package: paquetes
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - F0.auth
  - F1.catalogo
blocks:
  - F1.migracion
  - F2.resultados
  - F2.presupuestos
generated_by: orch-spec
generated_at: 2026-08-23
title: "F2.paquetes — CRUD Paquetes + constructor drag-and-drop"
---

# F2 · Paquetes

Agrupaciones reutilizables de exámenes. Constructor split-view con drag-and-drop (dnd-kit). Cargables desde Resultados y Presupuestos con un clic.

## Referencias

- **PRD**: §4 F7 (Paquetes).
- **ARCH**: §6 (tablas `paquetes`, `paquetes_examenes`), §3 componente F7.

---

## F2.paquetes.T01 — Schema Zod + CRUD queries/mutations

### Objetivo

Queries/mutations para paquetes + join `paquetes_examenes`.

### Contexto

Schema ya en `packages/convex/schema.ts` (F0.setup.T03).

### Alcance

Sí hace:
- `packages/lib/schemas/paquete.ts` con `paqueteCreate`, `paqueteUpdate`.
- `packages/convex/paquetes.ts`:
  - Query `list()` — todos los paquetes con count de exámenes.
  - Query `getById({ id })` — paquete + array de exámenes ordenados.
  - Query `getExamenes({ id })` — sólo lista de examenes (para cargar en Resultado/Presupuesto).
  - Mutation `create({ nombre, descripcion? })`.
  - Mutation `update({ id, nombre?, descripcion? })`.
  - Mutation `delete({ id })`.
  - Mutation `setExamenes({ id, examenIds: string[] })` — reemplaza toda la lista con orden dado.
- Validación `nombre` único.
- Requiere Admin para create/update/delete; Operador puede leer.

No hace:
- UI (T02).

### Criterios de aceptación

- [ ] Create paquete único OK.
- [ ] Create nombre duplicado rechaza `PAQUETE_DUPLICADO`.
- [ ] `setExamenes` reemplaza toda la lista.
- [ ] `getExamenes` retorna exámenes ordenados.
- [ ] `list` incluye count.

### Archivos afectados

- `packages/lib/schemas/paquete.ts`
- `packages/convex/paquetes.ts`

### Dependencias

- F0.auth.T04
- F1.catalogo.T02

### Estimación

M (4h)

---

## F2.paquetes.T02 — UI `/paquetes` con dnd-kit split-view

### Objetivo

Constructor de paquetes con dos columnas: catálogo (source) y paquete actual (target), con drag-and-drop bidireccional y reorder interno.

### Contexto

PRD §4 F7 (dnd-kit). ARCH §3 F7 (`packages/ui/dnd/`).

### Alcance

Sí hace:
- `apps/web/app/(app)/paquetes/page.tsx` — lista de paquetes con card por paquete.
- `apps/web/app/(app)/paquetes/[id]/page.tsx` — vista/edición.
- Componente `PaqueteBuilder` (client, `'use client'`):
  - Split view: izquierda catálogo con búsqueda (reuse F1.catalogo.T03), derecha lista del paquete.
  - Dnd-kit: `DndContext`, `SortableContext`, `useDraggable`, `useDroppable`.
  - Drag desde catálogo a paquete = agregar.
  - Drag dentro del paquete = reorder.
  - Drag fuera del paquete = quitar (o botón "quitar" por row).
  - Botón "Guardar" ejecuta `setExamenes`.
- Modal create de paquete (nombre + descripción).
- Admin gestiona; Operador ve read-only.

No hace:
- Múltiples paquetes editables al mismo tiempo.

### Criterios de aceptación

- [ ] Crear paquete abre editor vacío.
- [ ] Drag de examen desde catálogo lo agrega al paquete.
- [ ] Reorder interno del paquete funciona.
- [ ] Quitar examen del paquete funciona.
- [ ] Guardar persiste la lista con orden.
- [ ] Búsqueda del catálogo filtra en vivo con highlight.
- [ ] Operador ve read-only (o UI oculta acciones de edit).

### Archivos afectados

- `apps/web/app/(app)/paquetes/page.tsx`
- `apps/web/app/(app)/paquetes/[id]/page.tsx`
- `apps/web/app/(app)/paquetes/PaqueteBuilder.tsx`
- `packages/ui/dnd/SortableList.tsx`
- `packages/ui/dnd/DraggableItem.tsx`

### Dependencias

- F0.setup.T06
- F0.auth.T03
- F1.catalogo.T02
- F1.catalogo.T03
- F2.paquetes.T01

### Estimación

XL (12h)

### Notas técnicas

`dnd-kit`: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. Necesita `'use client'`. Testeado en Next 14 App Router (ARCH §9 confirma).

---

## F2.paquetes.T03 — Selector "Cargar Paquete" reusable

### Objetivo

Componente `<CargarPaqueteButton onLoad={(examenes) => ...}>` que abre un modal con lista de paquetes y al seleccionar retorna los exámenes.

### Contexto

Reusable en F2.resultados y F2.presupuestos (PRD "cargar paquete con un clic").

### Alcance

Sí hace:
- Componente en `packages/ui/paquetes/CargarPaqueteButton.tsx`.
- Modal con `useQuery(paquetes.list)`.
- Click en paquete → `useQuery(paquetes.getExamenes)` → llama `onLoad`.
- Loading state, empty state.

### Criterios de aceptación

- [ ] Modal muestra paquetes con nombre y count.
- [ ] Click en paquete emite los exámenes.
- [ ] Empty state si no hay paquetes.
- [ ] Cierra modal post-selección.

### Archivos afectados

- `packages/ui/paquetes/CargarPaqueteButton.tsx`

### Dependencias

- F2.paquetes.T01

### Estimación

S (3h)
