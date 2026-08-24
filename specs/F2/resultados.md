---
type: spec
phase: F2
package: resultados
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - F0.auth
  - F1.config
  - F1.catalogo
  - F2.pacientes
  - F2.paquetes
  - S3.react-pdf-runtime
blocks:
  - F3.dashboard
  - F3.export
generated_by: orch-spec
generated_at: 2026-08-23
title: "F2.resultados — CRUD Resultados + PDF con @react-pdf"
---

# F2 · Resultados

CRUD de resultados clínicos con snapshot de exámenes, generación de PDF vía Next Route Handler + @react-pdf/renderer (ADR-02). Bloqueado por S3.

## Referencias

- **PRD**: §4 F5 (Resultados), §9 (PDF ≤ 3s p95, nombre laboratorio requerido).
- **ARCH**: ADR-02 (PDF Route Handler), ADR-04 (snapshots), §5.1, §4.1 (sequence F5), §6.
- **Spike**: S3.react-pdf-runtime (resuelto).

---

## F2.resultados.T01 — Schema Zod + audit

### Objetivo

Schemas de validación para `resultadoCreate`, `resultadoUpdate`, `lineaResultado`.

### Alcance

- `packages/lib/schemas/resultado.ts` con Zod schemas.
- Validación `fecha_muestra` no futura.
- Validación `examenes` array no vacío al crear.
- Enum `estado` = `["Pendiente", "Completado"]`.

### Criterios de aceptación

- [ ] Schemas validan bien casos happy y edge.
- [ ] Test unitarios.

### Archivos afectados

- `packages/lib/schemas/resultado.ts`
- `packages/lib/schemas/resultado.test.ts`

### Dependencias

- F0.setup.T01

### Estimación

S (2h)

---

## F2.resultados.T02 — CRUD queries/mutations con snapshots

### Objetivo

Backend Convex completo para resultados.

### Contexto

ARCH §5.1 (`resultados.create`, `resultados.getForPDF`), ADR-04.

### Alcance

Sí hace:
- `packages/convex/resultados.ts`:
  - Query `list({ cursor?, limit?, filters? })` — paginado, filtros por paciente, fecha, estado.
  - Query `getById({ id })` — resultado + líneas.
  - Query `getForPDF({ id })` — resultado + paciente + config empresa + URLs firmadas de logo/firma/sello.
  - Query `search({ term, filters? })` — por nombre/cédula/fecha.
  - Mutation `create({ paciente_id, fecha_muestra, fecha_resultado?, medico_solicitante?, observaciones?, examenes: [...] })`:
    - Snapshot `nombre`, `precio`, `unidad`, `valores_referencia` desde catálogo.
    - Estado inicial `Pendiente` si `fecha_resultado` es null, sino `Completado`.
    - Insert `resultados` + N `resultados_examenes` en transacción.
  - Mutation `update({ id, ... })` — permite editar valores/observaciones/estado.
  - Mutation `updateEstado({ id, estado })`.
  - Mutation `delete({ id })` — Admin only.
- Auth: Operador OK.
- Audit log.

No hace:
- PDF (T04, T05).
- UI (T06).

### Criterios de aceptación

- [ ] Create con 3 exámenes inserta 1 resultado + 3 líneas con snapshots.
- [ ] Editar precio del catálogo NO afecta snapshots (test explícito).
- [ ] `getForPDF` retorna todo lo necesario para el template.
- [ ] Estado se calcula/actualiza correctamente.
- [ ] Delete Admin only.

### Archivos afectados

- `packages/convex/resultados.ts`

### Dependencias

- F0.auth.T04
- F1.catalogo.T02
- F2.pacientes.T02
- F2.resultados.T01

### Estimación

L (8h)

---

## F2.resultados.T03 — Convertir presupuesto → resultado (backend)

### Objetivo

Mutation `presupuestos.convertToResultado` que crea un resultado a partir de un presupuesto Aprobado.

### Contexto

ARCH §5.1 y §4.2. Vive en `packages/convex/presupuestos.ts` pero se lista acá por coherencia funcional. Puede coordinarse con F2.presupuestos.

### Alcance

Sí hace:
- Mutation en `packages/convex/presupuestos.ts` (declarada aquí, implementada en task de presupuestos si preferís):
  - Valida `estado === "Aprobado"`.
  - Requiere `paciente_id` populated; si sólo `paciente_nombre_libre`, retorna error `PACIENTE_LIBRE_REQUIERE_FICHA`.
  - Crea `resultados` con estado `Pendiente`, `origen_presupuesto_id`.
  - Copia snapshots de exámenes desde `presupuestos_examenes` (nombre, precio) al nuevo `resultados_examenes`.
  - Actualiza `presupuestos.estado = "Convertido"` y `resultado_id`.
  - Idempotente: si ya hay `resultado_id`, retorna el existente.

### Criterios de aceptación

- [ ] Presupuesto Aprobado con paciente → convierte OK.
- [ ] Presupuesto Borrador rechaza `PRESUPUESTO_NO_APROBADO`.
- [ ] Presupuesto con `nombre_libre` rechaza `PACIENTE_LIBRE_REQUIERE_FICHA`.
- [ ] Segundo convert idempotente retorna mismo `resultado_id`.
- [ ] Estado cambia a `Convertido`.

### Archivos afectados

- `packages/convex/presupuestos.ts` (mutation `convertToResultado`)

### Dependencias

- F2.resultados.T02
- F2.presupuestos.T02 (schema y CRUD de presupuestos)

### Estimación

M (4h)

---

## F2.resultados.T04 — Template PDF `<ResultadoPDF />`

### Objetivo

Componente React del PDF de resultado con `@react-pdf/renderer`: encabezado con logo/nombre, datos paciente, tabla exámenes, firma + sello, pie de página.

### Contexto

ARCH §3 (`packages/pdf/ResultadoPDF.tsx`, `packages/pdf/components/*`), S3 confirmado runtime.

### Alcance

Sí hace:
- `packages/pdf/ResultadoPDF.tsx` — layout completo.
- Componentes reutilizables en `packages/pdf/components/`:
  - `<PDFHeader logo={...} nombre={...} rif={...} direccion={...} />`
  - `<PacienteInfo paciente={...} edad={...} fecha={...} />`
  - `<ExamenesTable rows={...} />`
  - `<PDFFooter firma={...} sello={...} pieDePagina={...} />`
- Estilos con `StyleSheet.create`.
- Fuentes default (custom sólo si S3 lo requiere).
- Manejo de assets con URL firmada (viene de `getForPDF`).

No hace:
- Route handler (T05).
- Streaming (T05).

### Criterios de aceptación

- [ ] Renderiza en `renderToStream` sin errores.
- [ ] Layout coincide con mockup (o brief del cliente).
- [ ] Logo/firma/sello se cargan y renderizan.
- [ ] Tabla exámenes escala con muchas filas (page break OK).
- [ ] Nombre del laboratorio siempre visible.

### Archivos afectados

- `packages/pdf/ResultadoPDF.tsx`
- `packages/pdf/components/PDFHeader.tsx`
- `packages/pdf/components/PacienteInfo.tsx`
- `packages/pdf/components/ExamenesTable.tsx`
- `packages/pdf/components/PDFFooter.tsx`

### Dependencias

- F2.resultados.T02
- S3.react-pdf-runtime (resuelto)

### Estimación

L (10h)

---

## F2.resultados.T05 — Route Handler `/api/pdf/resultado/[id]`

### Objetivo

Endpoint Next.js Node runtime que valida sesión, llama `resultados.getForPDF`, renderiza `<ResultadoPDF>` y streamea `application/pdf`.

### Contexto

ARCH ADR-02 y §5.2.

### Alcance

Sí hace:
- `apps/web/app/api/pdf/resultado/[id]/route.ts` con `export const runtime = 'nodejs'`.
- Lee token de sesión de cookie.
- Helper `apps/web/lib/convex-server.ts` `convexServerClient(token)` (implementado en S3).
- Guard: si nombre de laboratorio vacío → `403 NOMBRE_LABORATORIO_REQUERIDO` (bloqueante PDF).
- `ReactPDF.renderToStream(<ResultadoPDF data={...} />)` → respuesta `application/pdf` streamed.
- Cache in-memory de assets (5min TTL).
- Errores: 401 sin sesión, 404 sin resultado, 403 sin permisos o config incompleta.
- Metric log `pdf_render_duration_ms`.

### Criterios de aceptación

- [ ] Request con sesión válida devuelve PDF válido.
- [ ] Request sin sesión responde 401.
- [ ] Request de resultado inexistente responde 404.
- [ ] Nombre laboratorio vacío responde 403 con mensaje claro.
- [ ] Streaming funciona (Content-Length no obligatorio).
- [ ] p95 warm < 3s (medir en preview).

### Archivos afectados

- `apps/web/app/api/pdf/resultado/[id]/route.ts`
- `apps/web/lib/convex-server.ts`
- `apps/web/lib/asset-cache.ts`

### Dependencias

- F0.auth.T01
- F1.config.T01
- F1.config.T02
- F2.resultados.T02
- F2.resultados.T04
- S3.react-pdf-runtime

### Estimación

M (6h)

---

## F2.resultados.T06 — UI `/resultados` (list + create + edit + fichas)

### Objetivo

Página `/resultados` con lista + búsqueda + filtros; `/resultados/nuevo` con form; `/resultados/[id]` con detalle + botón "Descargar PDF".

### Contexto

PRD §4 F5; ARCH §3 F5, §4.1 (sequence).

### Alcance

Sí hace:
- `apps/web/app/(app)/resultados/page.tsx` — lista con filtros (paciente, fecha, estado).
- `apps/web/app/(app)/resultados/nuevo/page.tsx` — form completo con:
  - Autocomplete paciente (reuse F2.pacientes.T03 `<PacienteAutocomplete>`).
  - Botón "Cargar Paquete" (reuse F2.paquetes.T03).
  - Botón "Agregar Examen" (autocomplete de catálogo).
  - Tabla de líneas editable (examen, valor, observación).
  - Fechas muestra/resultado, médico, observaciones generales.
  - Botón guardar (Pendiente si falta fecha resultado; Completado si tiene).
- `apps/web/app/(app)/resultados/[id]/page.tsx` — detalle read-only + botón "Editar" + "Descargar PDF" (`window.open('/api/pdf/resultado/[id]')`).
- Modo edición.
- Empty/error states.

### Criterios de aceptación

- [ ] Crear resultado con paciente + 3 exámenes OK; navega a detalle.
- [ ] "Cargar Paquete" agrega todos los exámenes del paquete.
- [ ] Botón PDF abre PDF en nueva pestaña.
- [ ] Búsqueda funciona en < 300ms.
- [ ] Filtros por fecha/estado funcionan.
- [ ] Delete Admin only visible/oculto según role.

### Archivos afectados

- `apps/web/app/(app)/resultados/page.tsx`
- `apps/web/app/(app)/resultados/ResultadosList.tsx`
- `apps/web/app/(app)/resultados/nuevo/page.tsx`
- `apps/web/app/(app)/resultados/nuevo/ResultadoForm.tsx`
- `apps/web/app/(app)/resultados/[id]/page.tsx`
- `apps/web/app/(app)/resultados/[id]/ResultadoDetalle.tsx`

### Dependencias

- F0.setup.T06
- F0.auth.T03
- F2.pacientes.T03
- F2.paquetes.T03
- F2.resultados.T02
- F2.resultados.T05

### Estimación

XL (12h)
