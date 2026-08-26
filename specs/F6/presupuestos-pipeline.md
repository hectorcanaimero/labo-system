---
type: spec
phase: F6
package: pipeline
project_id: labo-system
version: 0.1
depends_on:
  - F6.core
blocks: []
generated_by: orch-spec
generated_at: 2026-08-25
title: "F6.pipeline — Pipeline de Presupuestos como Leads (Estados & Kanban UI)"
---

# F6.2 · Pipeline de Presupuestos como Leads

Evolución del módulo de presupuestos a un embudo comercial / pipeline de leads:
1. Base de datos y esquemas: migración para soportar estados `['Borrador', 'Enviado', 'Aprobado', 'Rechazado', 'Cancelado', 'Convertido']`, columna `motivo_rechazo text` y validaciones Zod.
2. Repositorios y API: máquina de estados con validación estricta de transiciones, soporte de filtros múltiples por estado en listados y endpoint `PATCH /api/presupuestos/[id]` con auditoría.
3. UI Pipeline & Kanban: tablero visual interactivo (`PresupuestoPipelineKanban.tsx`), badges por estado, switch de visualización [Tabla | Kanban] y diálogos de acción rápida (Enviar con copy de WhatsApp/Email, Rechazar con motivo obligatorio, Aprobar y Convertir a Resultado clínico).

---

## F6.2.T1 — Presupuestos DB & Schemas: estados de pipeline y motivo de rechazo

### Objetivo

Actualizar el esquema de base de datos PostgreSQL y los contratos Zod para soportar los estados completos del pipeline comercial de presupuestos (`Borrador`, `Enviado`, `Aprobado`, `Rechazado`, `Cancelado`, `Convertido`), agregar la columna `motivo_rechazo` y tests unitarios.

### Alcance

Sí hace:
- Crear migración SQL `packages/db/migrations/0004_presupuestos_pipeline_estados.sql` para actualizar el constraint de estados en la tabla `presupuestos` soportando: `Borrador`, `Enviado`, `Aprobado`, `Rechazado`, `Cancelado`, `Convertido`.
- Añadir columna `motivo_rechazo text` y timestamp `fecha_estado timestamp with time zone DEFAULT now()` en la tabla `presupuestos`.
- Actualizar `packages/db/schema.sql` reflejando los nuevos estados y campos.
- Actualizar `packages/lib/schemas/presupuesto.ts` definiendo `PresupuestoEstadoEnum` y el schema de cambio de estado `presupuestoCambiarEstadoSchema` requiriendo `motivo_rechazo` si el estado es `Rechazado`.
- Crear tests unitarios en `packages/lib/schemas/presupuesto.test.ts`.

No hace:
- Lógica de repositorios y transiciones de estados (F6.2.T2).

### Criterios de aceptación

- [ ] Migración `0004_presupuestos_pipeline_estados.sql` aplica limpia sobre PostgreSQL.
- [ ] `presupuestoCambiarEstadoSchema` valida que al cambiar a `Rechazado` el campo `motivo_rechazo` tenga al menos 3 caracteres.
- [ ] Transiciones de estados permitidos están correctamente tipadas en TypeScript.
- [ ] Tests unitarios `pnpm --filter @labo/lib test` pasan en verde.

### Archivos afectados

- `packages/db/migrations/0004_presupuestos_pipeline_estados.sql`
- `packages/db/schema.sql`
- `packages/lib/schemas/presupuesto.ts`
- `packages/lib/schemas/presupuesto.test.ts`

### Dependencias

- Ninguna

### Estimación

1.5h

---

## F6.2.T2 — Presupuestos Repos y API: máquina de estados, transiciones y endpoint PATCH

### Objetivo

Implementar la lógica de máquina de estados de presupuestos en `@labo/db`, soportar filtros por estado en el repositorio, y crear el endpoint `PATCH /api/presupuestos/[id]` (o `/estado`) con validación de transiciones permitidas y auditoría.

### Alcance

Sí hace:
- Definir la matriz de transiciones válidas en `packages/db/repos/presupuestos.ts` (ej. `Borrador` -> `Enviado`/`Cancelado`, `Enviado` -> `Aprobado`/`Rechazado`/`Cancelado`, `Aprobado` -> `Convertido`/`Cancelado`, `Rechazado` -> `Borrador`/`Cancelado`).
- Actualizar `presupuestosRepo.list` para permitir filtrado por uno o múltiples estados (`estados?: PresupuestoEstado[]`).
- Implementar función `cambiarEstado(id, nuevoEstado, motivoRechazo?, userId?)` que valide la transición, actualice columnas y guarde entrada en audit log.
- Crear o actualizar Route Handler `apps/web/app/api/presupuestos/[id]/route.ts` o `apps/web/app/api/presupuestos/[id]/estado/route.ts` respondiendo a peticiones `PATCH`.
- Crear tests de integración en `packages/db/repos/presupuestos.integration.test.ts`.

No hace:
- Componentes UI Kanban o modales de acción rápida (F6.2.T3).

### Criterios de aceptación

- [ ] Transición no permitida devuelve error `TRANSICION_ESTADO_INVALIDA` con código 400.
- [ ] Al transicionar a `Rechazado`, `motivo_rechazo` es guardado en base de datos.
- [ ] Endpoint `PATCH` actualiza estado y genera registro en `audit_log`.
- [ ] Listado de presupuestos filtra correctamente por array de estados.
- [ ] Tests de integración en `@labo/db` pasan en verde.

### Archivos afectados

- `packages/db/repos/presupuestos.ts`
- `packages/db/repos/presupuestos.integration.test.ts`
- `apps/web/app/api/presupuestos/[id]/route.ts`

### Dependencias

- F6.2.T1

### Estimación

2.0h

---

## F6.2.T3 — Presupuestos UI: Pipeline Kanban, view toggle y acciones rápidas de estado

### Objetivo

Construir la interfaz de gestión comercial de presupuestos como Pipeline / Kanban con columnas por estado, selector de vista [Tabla | Kanban], badges de estado con código de color, y modales de acción rápida (Enviar, Rechazar con motivo, Aprobar, Convertir a Resultado clínico).

### Alcance

Sí hace:
- Crear componente `packages/ui/presupuestos/PresupuestoPipelineKanban.tsx` con columnas por etapa de lead (`Borrador`, `Enviado`, `Aprobado`, `Rechazado`, `Convertido`), totales acumulados en USD/Bs y tarjetas interactivas.
- Crear componente `packages/ui/presupuestos/PresupuestoEstadoBadge.tsx` con estilos diferenciados por estado.
- Añadir toggle de visualización [Tabla | Kanban] en `apps/web/app/(app)/presupuestos/page.tsx` y persistir la preferencia de vista.
- Implementar modal de acciones rápidas `PresupuestoAccionesDialog.tsx`:
  - Enviar: plantilla rápida para WhatsApp/Email + cambio a `Enviado`.
  - Rechazar: formulario con campo obligatorio `motivo_rechazo`.
  - Aprobar: confirmación directa.
  - Convertir: navegación con prellenado a creación de Resultado clínico (`/resultados/nuevo?presupuesto_id=...`).
- Actualizar `PresupuestosList.tsx` y `PresupuestoDetalle.tsx` con soporte de pipeline.
- Actualizar y ejecutar suite E2E en `apps/web/e2e/presupuesto.spec.ts`.

No hace:
- Modificación de esquemas de base de datos (F6.2.T1).

### Criterios de aceptación

- [ ] Switch [Tabla | Kanban] permite alternar entre tabla tradicional y tablero Kanban sin recargar la página.
- [ ] Columnas del Kanban muestran conteo de presupuestos y suma total en USD y Bs.
- [ ] Diálogo de rechazo exige motivo y actualiza la tarjeta en tiempo real.
- [ ] Acción de convertir enlaza al flujo de creación de resultados vinculados.
- [ ] Tests E2E de presupuestos cubren las acciones del pipeline y pasan 100% en verde.

### Archivos afectados

- `packages/ui/presupuestos/PresupuestoPipelineKanban.tsx`
- `packages/ui/presupuestos/PresupuestoEstadoBadge.tsx`
- `packages/ui/presupuestos/PresupuestoAccionesDialog.tsx`
- `apps/web/app/(app)/presupuestos/PresupuestosList.tsx`
- `apps/web/app/(app)/presupuestos/page.tsx`
- `apps/web/app/(app)/presupuestos/[id]/PresupuestoDetalle.tsx`
- `apps/web/e2e/presupuesto.spec.ts`

### Dependencias

- F6.2.T2

### Estimación

3.0h
