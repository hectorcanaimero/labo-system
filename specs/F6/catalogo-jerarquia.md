---
type: spec
phase: F6
package: catalogo
project_id: labo-system
version: 0.1
depends_on:
  - F1.catalogo
blocks:
  - F6.paquetes
  - F6.presupuestos
generated_by: orch-spec
generated_at: 2026-08-25
title: "F6.catalogo — Catálogo: Jerarquía, Tipo de Análisis y Método"
---

# F6.3 · Catálogo: Jerarquía, Tipo de Análisis y Método

Evolución del catálogo de exámenes para soportar estructura jerárquica médica avanzada:
1. Base de datos y esquemas: Migración `0005_examenes_tipo_analisis_metodo.sql` agregando columnas `tipo_analisis` y `metodo` en `examenes`, y `tipo_analisis_snap` + `metodo_snap` en `resultados_examenes`. Esquemas Zod en `@labo/lib/schemas/examen.ts` y actualización de `packages/db/schema.sql`.
2. Importador Excel y Repositorios: Actualización de `packages/lib/xlsx-import.ts` y `plantilla-import.xlsx` para importar columnas `Tipo de Análisis` y `Método`. Actualización de upsert en `packages/db/repos/examenes.ts` y snapshots en `packages/db/repos/resultados.ts`.
3. UI de Catálogo y Reportes PDF: Actualización de `ExamenFormDialog.tsx` y `TitulosNavigator.tsx` con campos/badges de tipo de análisis y método. Actualización de `ResultadoPDF.tsx` y `ExamenesTable.tsx` para sub-agrupar por tipo de análisis dentro de cada grupo y renderizar el método clínico.

---

## F6.3.T1 — DB & Schemas de Catálogo: Migración tipo_analisis y metodo

### Objetivo

Crear la migración `0005_examenes_tipo_analisis_metodo.sql` para añadir las columnas opcionales `tipo_analisis text` y `metodo text` a la tabla `examenes`, y `tipo_analisis_snap text` + `metodo_snap text` a `resultados_examenes`. Actualizar `packages/db/schema.sql` y definir/actualizar los esquemas Zod en `@labo/lib/schemas/examen.ts` junto con sus tests unitarios.

### Alcance

Sí hace:
- Crear migración SQL `packages/db/migrations/0005_examenes_tipo_analisis_metodo.sql` con `ALTER TABLE examenes ADD COLUMN tipo_analisis text, ADD COLUMN metodo text;` y `ALTER TABLE resultados_examenes ADD COLUMN tipo_analisis_snap text, ADD COLUMN metodo_snap text;`.
- Actualizar `packages/db/schema.sql` con las nuevas columnas y tipos.
- Crear/actualizar `packages/lib/schemas/examen.ts` con validaciones Zod para `tipo_analisis` (opcional, string trimmed) y `metodo` (opcional, string trimmed).
- Añadir tests unitarios en `packages/lib/schemas/examen.test.ts`.

No hace:
- Modificaciones al importador Excel o repos (asignado a F6.3.T2).
- UI o PDF (asignado a F6.3.T3).

### Criterios de aceptación

- [ ] Migración `0005_examenes_tipo_analisis_metodo.sql` aplica limpia sobre PostgreSQL.
- [ ] `packages/db/schema.sql` contiene las columnas `tipo_analisis`, `metodo` en `examenes` y `tipo_analisis_snap`, `metodo_snap` en `resultados_examenes`.
- [ ] Esquemas Zod validan correctamente campos opcionales `tipo_analisis` y `metodo`.
- [ ] Tests unitarios `pnpm --filter @labo/lib test` pasan en verde.

### Archivos afectados

- `packages/db/migrations/0005_examenes_tipo_analisis_metodo.sql`
- `packages/db/schema.sql`
- `packages/lib/schemas/examen.ts`
- `packages/lib/schemas/examen.test.ts`

### Dependencias

- Ninguna

### Estimación

1.5h

---

## F6.3.T2 — Importador Excel y Repos: Soporte tipo_analisis y metodo con snapshots

### Objetivo

Actualizar `packages/lib/xlsx-import.ts` y la plantilla de ejemplo `plantilla-import.xlsx` para soportar las columnas opcionales "Tipo de Análisis" y "Método", y extender las funciones de upsert en `packages/db/repos/examenes.ts` y copiado de snapshots en `packages/db/repos/resultados.ts`.

### Alcance

Sí hace:
- Adaptar `packages/lib/xlsx-import.ts` para mapear columnas de encabezado `Tipo de Análisis` / `Tipo de Analisis` / `Tipo Análisis` y `Método` / `Metodo`.
- Actualizar `apps/web/public/plantilla-import.xlsx` para incluir columnas de ejemplo.
- Actualizar `examenesRepo.create`, `examenesRepo.update` y `examenesRepo.upsertBatch` en `packages/db/repos/examenes.ts` para persistir `tipo_analisis` y `metodo`.
- Actualizar `resultadosRepo.create` y `resultadosRepo.update` en `packages/db/repos/resultados.ts` para capturar `tipo_analisis_snap` y `metodo_snap` del examen al generar el resultado.
- Añadir tests unitarios para importación XLSX con las nuevas columnas.

No hace:
- Modificaciones visuales a componentes React (asignado a F6.3.T3).

### Criterios de aceptación

- [ ] El importador Excel procesa correctamente archivos XLSX con o sin columnas `Tipo de Análisis` y `Método`.
- [ ] Upsert en catálogo persiste `tipo_analisis` y `metodo`.
- [ ] Creación de resultado clínico guarda snapshots `tipo_analisis_snap` y `metodo_snap` inmutables.
- [ ] Tests unitarios en `@labo/lib` y `@labo/db` pasan en verde.

### Archivos afectados

- `packages/lib/xlsx-import.ts`
- `apps/web/public/plantilla-import.xlsx`
- `packages/db/repos/examenes.ts`
- `packages/db/repos/resultados.ts`
- `packages/lib/xlsx-import.test.ts`

### Dependencias

- F6.3.T1

### Estimación

2.0h

---

## F6.3.T3 — Catálogo UI: formulario de examen y visualización en navegador de títulos

### Objetivo

Extender la interfaz de catálogo (`ExamenFormDialog.tsx`, `TitulosNavigator.tsx`) para editar y visualizar `tipo_analisis` y `metodo` en el catálogo de exámenes.

### Alcance

Sí hace:
- Agregar inputs para `tipo_analisis` y `metodo` en el modal `ExamenFormDialog.tsx`.
- Mostrar badges/etiquetas de tipo de análisis y método en `TitulosNavigator.tsx`.
- Manejar sugerencias o selects de autocompletado para tipos de análisis comunes si aplica.

No hace:
- Modificación de esquemas de BD o importadores (F6.3.T1, F6.3.T2).
- Plantillas PDF de resultados (F6.3.T4).

### Criterios de aceptación

- [ ] Formulario de examen permite ingresar y editar Tipo de Análisis y Método.
- [ ] Listado de catálogo muestra badges informativos de método y tipo de análisis.
- [ ] Si un examen no posee método ni tipo de análisis, la UI mantiene una disposición limpia sin artefactos vacíos.

### Archivos afectados

- `apps/web/app/(app)/examenes/ExamenFormDialog.tsx`
- `apps/web/app/(app)/examenes/TitulosNavigator.tsx`

### Dependencias

- F6.3.T1

### Estimación

1.5h

---

## F6.3.T4 — Resultados PDF & Tabla: agrupación jerárquica por tipo de análisis y método

### Objetivo

Actualizar el renderizado del informe clínico en `@labo/pdf/ResultadoPDF.tsx` y la tabla de resultados (`ExamenesTable.tsx`) para agrupar por Grupo (Título), sub-agrupar por Tipo de Análisis y mostrar la línea de Método.

### Alcance

Sí hace:
- Modificar `packages/pdf/components/ExamenesTable.tsx` y `packages/pdf/ResultadoPDF.tsx` para estructurar la tabla jerárquicamente: Título -> Sub-encabezado de Tipo de Análisis -> Lista de Exámenes.
- Imprimir la leyenda `Método: {metodo_snap}` debajo del nombre de cada examen cuando esté definido.
- Mantener diseño limpio y compacto en `@react-pdf/renderer` asegurando saltos de página adecuados sin cortar grupos.

No hace:
- Modificación de esquemas de BD o importadores (F6.3.T1, F6.3.T2).

### Criterios de aceptación

- [ ] El reporte PDF renderiza sub-encabezados de Tipo de Análisis dentro de cada grupo de examen.
- [ ] Muestra el método clínico correspondiente junto a cada examen que posea `metodo_snap`.
- [ ] Exámenes sin sub-agrupación ni método se renderizan limpiamente con espaciado consistente.

### Archivos afectados

- `packages/pdf/components/ExamenesTable.tsx`
- `packages/pdf/ResultadoPDF.tsx`

### Dependencias

- F6.3.T2
- F6.6.T2

### Estimación

2.0h
