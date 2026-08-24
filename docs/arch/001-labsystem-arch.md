---
type: arch
project_id: labo-system
version: 0.1
depends_on:
  - prd/001-labsystem-v1.md
consumed_by:
  - archify
  - orch-spec
generated_by: orch-arch
generated_at: 2026-08-23
title: LabSystem — Arquitectura Técnica v1 (Convex + Next.js 14 + @react-pdf)
---

# ARCH: LabSystem — Arquitectura Técnica v1

## 1. Contexto

Este ARCH materializa el PRD `prd/001-labsystem-v1.md` en decisiones técnicas
concretas para reemplazar el plugin WordPress `rv-laboratorio v1.2.1` por una
aplicación web moderna con backend Convex y frontend Next.js 14 App Router.

El sistema debe soportar el flujo operativo completo del laboratorio clínico
(pacientes, catálogo, resultados, presupuestos con doble moneda USD/Bs,
paquetes, migración one-shot desde WordPress, exportación) para un
laboratorio mono-tenant en Venezuela, garantizando cero pérdida de datos
históricos (204+ pacientes, 652 resultados, 545 presupuestos, 9 paquetes) y
performance objetivo (búsqueda ≤300 ms p95, PDF ≤3 s p95, 99.5% uptime).

El stack está bloqueado: **Convex** (DB + auth + storage + cron + actions),
**Next.js 14** (App Router), **@react-pdf/renderer** (sin Puppeteer),
**shadcn/ui + Tailwind**, monorepo **pnpm + turborepo**. Esta arquitectura
resuelve los 10 módulos (F1–F10) y encuadra los 8 spikes exploratorios
descritos en el PRD, indicando cuáles son bloqueantes por feature.

## 2. Decisiones de arquitectura (ADR-like)

### ADR-01: Convex como backend unificado (DB + serverless + storage)

- **Contexto**: el PRD lista Convex como stack cerrado (DB, queries,
  mutations, actions, file storage). Necesitamos coherencia con `.tsx` del
  frontend, realtime nativo para listas grandes, y cron para el scraper BCV.
- **Decisión**: Convex es el único backend. Toda persistencia, toda lógica
  server-side y todo asset (logos, firmas, sellos, exports temporales) vive
  en Convex (`convex.db`, `convex.storage`, `internalAction`, `crons`).
- **Alternativas descartadas**:
  - PostgreSQL + Prisma + Next Route Handlers → mayor madurez SQL pero
    perdemos realtime built-in y sumamos operatividad de DB gestionada.
  - Supabase → similar productividad pero el PRD ya cerró Convex.
- **Consecuencias**: (+) realtime automático en listas, (+) type-safety
  end-to-end con `convex/_generated`, (+) file storage con URLs firmadas
  built-in. (−) vendor lock-in mitigado con F10 Exportación como escape
  hatch permanente. (−) reportes analíticos complejos son más verbosos que
  SQL puro.

### ADR-02: @react-pdf/renderer server-side en **Next.js Route Handler** (Node runtime)

- **Contexto**: SPIKE S3. `@react-pdf` corre en Node, no en Convex V8
  runtime (deno-like). Convex tiene un runtime Node opcional (`"use node"`)
  pero cold-start es superior a Vercel y el bundle de `@react-pdf` con
  fuentes + `pdfkit` supera límites cómodos de la Convex action layer.
- **Decisión**: los PDFs se renderizan en un Next.js Route Handler
  (`app/api/pdf/resultado/[id]/route.ts` y `.../presupuesto/[id]/route.ts`)
  bajo Node runtime, streamea al cliente como `application/pdf`. El
  Route Handler llama Convex queries con token de sesión, arma el
  `PDFDocument` de `@react-pdf`, y usa `ReactPDF.renderToStream(...)`.
- **Alternativas descartadas**:
  - **Convex action (Node runtime)**: probado conceptualmente inviable
    por tamaño de bundle + latencia; se valida en S3 pero es Plan B.
  - **Client-side render**: viola requisito de "PDF con firma/sello del
    laboratorio embebidos server-side" — assets deberían viajar al cliente
    y firma legal quedaría en frontend (inaceptable).
  - **Puppeteer**: descartado por PRD (costo operativo, chromium en
    serverless).
- **Consecuencias**: (+) latencia baja (Vercel Node runtime warm), (+)
  streaming nativo al browser, (+) mismo dominio (evita CORS). (−) el Next
  Route Handler debe llamar Convex con token → agregamos un helper
  `convexServerClient(token)`. (−) los assets (logo/firma/sello) se leen
  vía URL firmada de Convex File Storage y se descargan en request de PDF
  → agrega ~100-300 ms si no cacheamos. Mitigación: cache in-memory con TTL
  de 5 min en el Route Handler.

### ADR-03: Convex Auth nativo con RBAC en query/mutation (Plan B: Clerk)

- **Contexto**: SPIKE S5. Auth es fundacional; migrar tarde es caro. PRD
  requiere: password login, sesiones ~8h, roles Admin/Operador.
- **Decisión**: **Convex Auth** con provider `Password` únicamente en v1.
  Rol se almacena en tabla `usuarios` (`role: "admin" | "operador"`). Cada
  query/mutation llama `ctx.auth.getUserIdentity()` y valida el rol contra
  esa tabla. Middleware de Next.js (`middleware.ts`) protege rutas
  redirigiendo a `/login` cuando no hay session cookie.
- **Alternativas descartadas**:
  - **Clerk**: mejor UX y features maduros (invitaciones, MFA) pero suma
    dependencia externa y coste. Queda como Plan B si S5 falla.
  - **NextAuth**: no integra tan limpio con Convex.
- **Consecuencias**: (+) cero dependencias externas, (+) el token viaja
  automáticamente al Route Handler PDF vía cookie. (−) recuperación de
  contraseña e invitación de usuarios hay que armarlos a mano (endpoint
  `sendPasswordResetEmail` en Convex action + tabla `password_reset_tokens`).

### ADR-04: Schema Convex con **snapshots** en tablas de detalle

- **Contexto**: el PRD exige integridad histórica: editar un examen del
  catálogo NO debe alterar resultados/presupuestos ya emitidos.
- **Decisión**: las tablas `resultados_examenes` y `presupuestos_examenes`
  guardan `nombre_snap: string` y `precio_snap: number` **además** del FK
  `examen_id`. Al render de PDF y listas históricas se usa siempre el
  snapshot. El FK se mantiene sólo para trazabilidad/reportes.
- **Alternativas descartadas**:
  - Sólo FK: rompe historia al editar catálogo.
  - Versionar catálogo con `examen_version_id`: aumenta complejidad sin
    ganancia real para el volumen (250 exámenes).
- **Consecuencias**: (+) integridad histórica trivial, (+) queries de PDF
  no necesitan join. (−) duplicación controlada de datos (aceptable).

### ADR-05: Presupuesto con paciente **opcional** (`paciente_id?` XOR `paciente_nombre_libre?`)

- **Contexto**: PRD F6 explícito — "a veces el paciente no quiere ni dar
  el nombre completo". Necesitamos presupuesto ágil sin crear ficha.
- **Decisión**: schema `presupuestos` con:
  - `paciente_id?: v.id("pacientes")`
  - `paciente_nombre_libre?: v.string()`
  - Constraint aplicativa en la mutation: **exactamente uno** de los dos
    debe estar poblado. Validación con Zod en el layer `packages/lib`.
- **Alternativas descartadas**:
  - Crear "pacientes fantasma" para nombres libres: contamina la tabla
    de pacientes y complica métricas.
  - Tabla separada `presupuestos_walkin`: duplica lógica de listado.
- **Consecuencias**: (+) UI puede ofrecer un input libre sin fricción,
  (+) al Convertir a Resultado se puede ofrecer "crear paciente ahora" o
  bloquear si no hay ficha. (−) queries de "presupuestos de X paciente"
  filtran por `paciente_id` solamente (no encuentra los libres — es lo
  deseado).

### ADR-06: Cédula como campo **normalizado + único** en `pacientes`

- **Contexto**: auditoría del plugin actual muestra `V-21197865`, `V- 33338896`,
  `V.21.197.865` — imposible buscar consistentemente.
- **Decisión**: función `normalizeCedula()` en `packages/lib/cedula.ts`
  transforma cualquier input a `V-12345678` o `E-12345678` (uppercase, sin
  puntos, sin espacios). Se aplica en Zod schema (input) y en la mutation
  antes de escribir. Índice único de Convex sobre `cedula`.
- **Consecuencias**: (+) búsqueda determinística, (+) previene duplicados.
  (−) migración F8 debe normalizar y reportar conflictos previo al
  cutover (idempotencia + dry-run).

### ADR-07: BCV scraper como **Convex cron action** (Node) con fallback manual

- **Contexto**: SPIKE S1. Necesitamos tasa BCV diaria pre-cargada en
  presupuestos, con override manual siempre disponible.
- **Decisión**: cron diario `09:00 VET` (13:00 UTC en horario estándar
  VE) → `internalAction("crons/scrapeBCV")` con `fetch` + `cheerio` a
  `bcv.org.ve`. Escribe en tabla `tasa_cambio_bcv` (`{ fecha, tasa,
  fuente, scraped_at }`). Fallback si falla el scrape: usar la última
  tasa disponible + flag `stale: true`. UI muestra badge amarillo cuando
  la tasa tiene > 24h.
- **Alternativas descartadas**:
  - API DolarToday: Plan B para override cuando bcv.org.ve cae.
  - Cron externo (GitHub Actions): sumar dependencia sin ganancia.
- **Consecuencias**: (+) tasa siempre disponible, (+) admin puede
  sobrescribir en Config Empresa. (−) HTML de bcv.org.ve puede cambiar
  → monitor + alerta a Admin.

### ADR-08: Monorepo pnpm + turborepo con **5 paquetes** y frontera estricta

- **Contexto**: PRD fija monorepo pnpm+turborepo con `apps/web` y
  `packages/{convex, ui, lib, pdf}`.
- **Decisión**: 5 packages con reglas de import estrictas (enforcement
  vía `eslint-plugin-import` `no-restricted-paths`):
  - `apps/web` → puede importar de `packages/*`.
  - `packages/pdf` → puede importar de `packages/lib` (types).
  - `packages/ui` → puede importar de `packages/lib` (types).
  - `packages/convex` → puede importar de `packages/lib` (schemas Zod
    compartidos con frontend).
  - `packages/lib` → NO importa de nadie (leaf package).
- **Alternativas descartadas**:
  - Todo en `apps/web`: acopla PDF templates a Next, hace test unitario
    difícil, imposibilita reuso del PDF fuera de Next.
- **Consecuencias**: (+) test unitario aislado por package, (+) publicar
  `packages/pdf` como npm privado en el futuro es trivial. (−) más config
  inicial (tsconfig paths, turbo pipelines).

### ADR-09: Exportación CSV en v1 vía **Convex action** con URL firmada

- **Contexto**: SPIKE S6. Necesitamos exportar Pacientes, Presupuestos,
  Resultados, Costos con filtros aplicados. Volúmenes 500–10.000 filas.
- **Decisión**: v1 = **CSV** (streaming) generado en `internalAction`
  con `papaparse` o serializado a mano (más ligero). El action escribe
  el archivo a Convex File Storage y devuelve la `storageId`. La UI hace
  `useAction(...)` → recibe storageId → `getUrl()` → `window.open()`.
  XLSX con SheetJS entra en Fase 2 (mismo pattern con `xlsx.write()`).
- **Alternativas descartadas**:
  - Generar client-side con SheetJS: satura navegador con 10k rows.
  - Streaming HTTP directo desde action: Convex actions no soportan
    streaming HTTP nativo al cliente; File Storage es el canal correcto.
- **Consecuencias**: (+) navegador nunca procesa 10k rows, (+) URL
  firmada expira (~1h) por seguridad. (−) archivo intermedio ocupa
  storage temporal → cron `cleanupExports` semanal borra archivos > 7d.

### ADR-10: Migración WP → Convex como **script Node standalone** con dry-run

- **Contexto**: SPIKE S2. Fuente MySQL de WordPress (tablas custom
  `rv_pacientes`, `rv_examenes`, `rv_titulos`, `rv_paquetes`, `rv_resultados*`,
  `rv_presupuestos*`). One-shot, no debe convivir con el plugin.
- **Decisión**: `scripts/migrate-wp/` — script Node standalone con:
  - Lectura MySQL vía `mysql2` (readonly).
  - Escritura Convex vía `ConvexHttpClient` con `deployKey`.
  - Modo **`--dry-run`** que sólo reporta diffs sin escribir.
  - **IDs nuevos** (Convex genera `Id<...>` fresh) + tabla auxiliar
    `_migration_map` (`{ wp_table, wp_id, convex_id, migrated_at }`) para
    trazabilidad y re-ejecución idempotente.
  - Normalización de cédulas (F8) con reporte de conflictos previo.
  - Snapshots poblados desde WP (nombre/precio históricos preservados).
- **Alternativas descartadas**:
  - Preservar IDs WP: imposible (Convex IDs son opaque strings, no int).
  - Convex action de migración: bundle enorme + límite de ejecución de
    actions (< 10 min). Script standalone puede correr horas.
- **Consecuencias**: (+) idempotente y re-ejecutable, (+) dry-run gratis
  para el cutover. (−) mantener `mysql2` como devDep del script.

## 3. Componentes del sistema

Los componentes se agrupan por **bounded context** siguiendo los 10 módulos
del PRD, con las capas de infra transversales listadas al final.

| Componente | Responsabilidad | Interactúa con |
|------------|-----------------|-----------------|
| **F1 Dashboard** (`apps/web/app/(app)/dashboard`) | Renderiza KPIs, gráfico Recharts (últimos 6 meses), actividad reciente. Server Component con Convex query preload. | `packages/convex/dashboard.ts` (query `getKPIs`, `getRecentActivity`) |
| **F2 Config Empresa** (`apps/web/app/(app)/config`) | Form Admin-only para nombre laboratorio, dirección, RIF, logo/firma/sello (upload → Convex File Storage), tasa BCV manual. | `packages/convex/config.ts` (`getConfig`, `updateConfig`, `uploadAsset`), `convex.storage` |
| **F3 Pacientes** (`apps/web/app/(app)/pacientes`) | CRUD + búsqueda debounced 300 ms, ficha con historial. | `packages/convex/pacientes.ts`, `packages/lib/cedula.ts` |
| **F4 Catálogo Exámenes** (`apps/web/app/(app)/examenes`) | CRUD Títulos + Exámenes, importación Excel (SheetJS), búsqueda con highlight. | `packages/convex/examenes.ts`, `packages/lib/xlsx-import.ts` |
| **F5 Resultados** (`apps/web/app/(app)/resultados`) | Crear/editar resultados con autocomplete paciente, cargar paquete, generar PDF. | `packages/convex/resultados.ts`, `apps/web/app/api/pdf/resultado/[id]`, `packages/pdf/ResultadoPDF.tsx` |
| **F6 Presupuestos** (`apps/web/app/(app)/presupuestos`) | Autocomplete paciente O nombre libre, cálculo doble moneda live, conversión → Resultado. | `packages/convex/presupuestos.ts`, `packages/convex/tasa.ts`, `apps/web/app/api/pdf/presupuesto/[id]`, `packages/pdf/PresupuestoPDF.tsx` |
| **F7 Paquetes** (`apps/web/app/(app)/paquetes`) | Constructor drag-and-drop (`dnd-kit`), split-view catálogo ↔ paquete. | `packages/convex/paquetes.ts`, `packages/ui/dnd/*` |
| **F8 Migración WP** (`scripts/migrate-wp/`) | Script Node one-shot MySQL → Convex, dry-run, mapping IDs, normalización cédulas. | MySQL WP, `ConvexHttpClient`, `_migration_map` table |
| **F9 Auth** (`apps/web/app/(auth)/`, `packages/convex/auth.ts`) | Login password, sesión 8h, RBAC Admin/Operador, middleware Next.js. | Convex Auth, tabla `usuarios`, `middleware.ts` |
| **F10 Exportación** (`packages/convex/exports.ts`) | Actions que generan CSV → File Storage → URL firmada. | `convex.storage`, `papaparse` |
| **BCV Scraper** (`packages/convex/crons.ts` + `packages/convex/scrape/bcv.ts`) | Cron diario 09:00 VET → fetch + cheerio → tabla `tasa_cambio_bcv`. | `bcv.org.ve` (external), fallback DolarToday |
| **PDF Route Handlers** (`apps/web/app/api/pdf/*`) | Node runtime, invocan Convex queries con token, arman `PDFDocument`, streamea al cliente. | `packages/pdf`, `packages/convex` (server client) |
| **Convex Schema + Indexes** (`packages/convex/schema.ts`) | Definición de tablas, indexes, FKs. | Todos los queries/mutations |

## 4. Flujo de datos

Diagramas interactivos (HTML standalone, generados con archify):

- **Sistema + Monorepo**: `arch/diagrams/001-labsystem.diagrams.html`
- **Schema ERD (14 tablas)**: `arch/diagrams/001-labsystem-erd.diagrams.html`
- **Sequence F5 · Crear Resultado + PDF**: `arch/diagrams/001-labsystem-f5-pdf.diagrams.html`
- **Sequence F6 · Convertir Presupuesto -> Resultado**: `arch/diagrams/001-labsystem-f6-convert.diagrams.html`
- **Sequence · Actualización tasa BCV (cron)**: `arch/diagrams/001-labsystem-bcv-cron.diagrams.html`
- **Dataflow F10 · Exportación CSV**: `arch/diagrams/001-labsystem-export.diagrams.html`

Cuatro flujos principales end-to-end:

### 4.1 Crear Resultado + generar PDF (F5)

1. Operador entra a `/resultados/nuevo`, escribe nombre de paciente.
2. Componente `<PacienteAutocomplete>` llama `useQuery(api.pacientes.search)`
   con debounce 300 ms. Convex responde con top 10 matches.
3. Operador selecciona paciente, agrega exámenes uno a uno o clic
   "Cargar Paquete" → `useQuery(api.paquetes.getExamenes)`.
4. Al guardar: `useMutation(api.resultados.create)` con array de
   `examenes` (`{ examen_id, valor, observacion? }`). La mutation:
   - Valida rol (Operador o Admin).
   - Lee `examenes` por ID, snapshotea `nombre` y `precio` en cada línea.
   - Inserta `resultados` + `resultados_examenes` en transacción.
   - Retorna `resultadoId`.
5. UI navega a `/resultados/[id]` mostrando el resultado + botón
   "Descargar PDF".
6. Clic en botón → `window.open("/api/pdf/resultado/[id]")`.
7. Route Handler (Node runtime):
   - Lee token de sesión de cookie.
   - Llama `convexServerClient(token).query(api.resultados.getForPDF, { id })`
     → devuelve resultado + paciente + config empresa + URLs firmadas de
     logo/firma/sello.
   - `ReactPDF.renderToStream(<ResultadoPDF data={...} />)`.
   - Responde `application/pdf` con streaming.

### 4.2 Convertir Presupuesto → Resultado (F6 → F5)

1. Admin/Operador abre presupuesto Aprobado en `/presupuestos/[id]`.
2. Clic "Convertir a Resultado" → `useMutation(api.presupuestos.convertToResultado)`.
3. La mutation:
   - Valida estado = "Aprobado".
   - Si `paciente_id` está poblado → usa ese. Si no (`paciente_nombre_libre`),
     UI redirige a crear ficha antes de convertir (bloqueo aplicativo).
   - Crea `resultados` con estado `Pendiente`, copia snapshots de exámenes.
   - Cambia estado presupuesto a `Convertido` + guarda `resultado_id`.
   - Retorna `resultadoId`.
4. UI navega a `/resultados/[id]` con datos precargados.

### 4.3 Actualización tasa BCV (cron)

1. Convex cron dispara `internalAction("crons/scrapeBCV")` diario 13:00 UTC.
2. Action hace `fetch("https://bcv.org.ve/")` → `cheerio.load(html)` →
   selecciona el div de USD → parsea número (regex + `Number.parseFloat`).
3. Si tasa OK: inserta en `tasa_cambio_bcv` (`{ fecha, tasa, fuente: "bcv",
   scraped_at }`).
4. Si fetch falla o parsing falla: intenta DolarToday API (fallback).
   Si ambos fallan: escribe warning en `audit_log` y no actualiza.
5. UI de Presupuestos hace `useQuery(api.tasa.getLatest)` — realtime;
   si el resultado tiene `scraped_at > 24h`, muestra badge "Tasa vieja".
6. Admin puede override manual desde `/config` → mutation
   `tasa.setManual({ tasa, motivo })` → escribe registro con
   `fuente: "manual"`.

### 4.4 Exportación CSV (F10)

1. Usuario en `/presupuestos` filtra por fecha, clic "Exportar".
2. UI llama `useAction(api.exports.presupuestosCSV, { filters })`.
3. Action `presupuestosCSV`:
   - Lee todos los presupuestos que matcheen filtros (paginación interna
     por 1000).
   - Arma filas CSV en memoria (10k rows ~2-5 MB OK).
   - Sube a `convex.storage.store()` → obtiene `storageId`.
   - Retorna `{ storageId }`.
4. UI llama `useMutation(api.exports.getSignedUrl, { storageId })` →
   devuelve URL firmada.
5. UI `window.open(url)` → descarga.
6. Cron semanal `cleanupExports` borra storage items con tag
   `export` y `age > 7d`.

## 5. Contratos e interfaces

### 5.1 Convex queries/mutations (contratos principales)

#### Query: `pacientes.search`
- **Args**: `{ term: string }`
- **Returns**: `Array<{ _id, nombre, apellido, cedula, fecha_nacimiento }>` (top 10)
- **Index usado**: `by_search_nombre` + `by_search_cedula` (union en JS)
- **Auth**: Operador o Admin

#### Mutation: `pacientes.create`
- **Args**: `{ nombre, apellido, cedula, fecha_nacimiento, telefono?, email? }`
- **Returns**: `{ _id }`
- **Validaciones**: `normalizeCedula`, unique index sobre `cedula`
- **Errors**: `CEDULA_DUPLICADA`, `CEDULA_INVALIDA`, `UNAUTHORIZED`

#### Mutation: `resultados.create`
- **Args**: `{ paciente_id, fecha_muestra, fecha_resultado?, medico_solicitante?, examenes: Array<{ examen_id, valor: string, observacion? }> }`
- **Returns**: `{ _id }`
- **Side effects**: snapshot nombre + precio de cada examen; insert 1 fila `resultados` + N filas `resultados_examenes`
- **Auth**: Operador o Admin

#### Mutation: `presupuestos.convertToResultado`
- **Args**: `{ presupuesto_id, fecha_muestra: number, medico_solicitante? }`
- **Returns**: `{ resultado_id }`
- **Precondiciones**: presupuesto en estado `Aprobado`, con `paciente_id` NO null
- **Errors**: `PRESUPUESTO_NO_APROBADO`, `PACIENTE_LIBRE_REQUIERE_FICHA`

#### Query: `tasa.getLatest`
- **Args**: `{}`
- **Returns**: `{ tasa: number, fuente: "bcv"|"dolartoday"|"manual", scraped_at: number, stale: boolean }`
- **Auth**: Cualquier user autenticado

#### Action: `exports.presupuestosCSV`
- **Args**: `{ filters: { desde?: number, hasta?: number, estado?: "Borrador"|"Aprobado"|"Convertido" } }`
- **Returns**: `{ storageId: Id<"_storage"> }`
- **Node runtime**: sí (papaparse)

### 5.2 HTTP Route Handlers (Next.js)

#### `GET /api/pdf/resultado/[id]`
- **Auth**: cookie de sesión Convex Auth (validada server-side)
- **Response**: `Content-Type: application/pdf`, streamed
- **Errors**: 401 sin sesión, 404 sin resultado, 403 sin permisos

#### `GET /api/pdf/presupuesto/[id]`
- Igual patrón, template `PresupuestoPDF`.

### 5.3 Cron jobs (Convex)

| Cron | Frecuencia | Action | Descripción |
|------|-----------|--------|-------------|
| `scrapeBCV` | Diario 13:00 UTC (09:00 VET) | `internalAction("crons/scrapeBCV")` | Scrape bcv.org.ve → tabla `tasa_cambio_bcv` |
| `cleanupExports` | Semanal (domingo 04:00 UTC) | `internalAction("crons/cleanupExports")` | Borra storage items `export` > 7d |

### 5.4 Eventos (semánticos, no bus real)

Convex es sync-first; los "eventos" son sólo cambios reactivos que la UI
observa vía `useQuery` con reconexión websocket automática. No hay bus.

## 6. Modelo de datos (Convex schema)

Definido en `packages/convex/schema.ts`. Convex IDs son `Id<"tabla">`
(strings opacos). Todos los timestamps son `number` (ms desde epoch UTC).

### Entidad: `laboratorio_config` (singleton, un solo doc)

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `nombre` | `v.string()` | requerido, no vacío | Bloquea PDFs si falta |
| `direccion` | `v.string()` | requerido | |
| `telefono` | `v.optional(v.string())` | | |
| `email` | `v.optional(v.string())` | | |
| `rif` | `v.optional(v.string())` | formato `J-XXXXXXXX-X` | |
| `logo_storage_id` | `v.optional(v.id("_storage"))` | | Convex File Storage |
| `firma_storage_id` | `v.optional(v.id("_storage"))` | | |
| `sello_storage_id` | `v.optional(v.id("_storage"))` | | |
| `pdf_pie_pagina` | `v.optional(v.string())` | | |
| `updated_at` | `v.number()` | | |
| `updated_by` | `v.id("usuarios")` | | |

### Entidad: `pacientes`

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `nombre` | `v.string()` | requerido | |
| `apellido` | `v.string()` | requerido | |
| `cedula` | `v.string()` | requerido, único | Normalizado `V-12345678` |
| `fecha_nacimiento` | `v.number()` | requerido | timestamp |
| `sexo` | `v.optional(v.union(v.literal("M"), v.literal("F"), v.literal("O")))` | | |
| `telefono` | `v.optional(v.string())` | | |
| `email` | `v.optional(v.string())` | | |
| `direccion` | `v.optional(v.string())` | | |
| `created_at` | `v.number()` | | |
| `updated_at` | `v.number()` | | |

**Indexes**:
- `by_cedula` (`cedula`) — **unique** enforcement en mutation
- `by_search_nombre` (`nombre`, `apellido`) — para prefix search
- `by_created` (`created_at`) — orden listado

### Entidad: `examenes_titulos` (grupos, mutables)

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `nombre` | `v.string()` | requerido, único | ej. "Hematología" |
| `orden` | `v.number()` | | Para ordenar en PDF |
| `created_at` | `v.number()` | | |

**Sin IDs hardcoded** — el cliente puede crear/borrar/renombrar títulos
sin migración (SPIKE S4).

### Entidad: `examenes`

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `titulo_id` | `v.id("examenes_titulos")` | requerido | |
| `nombre` | `v.string()` | requerido | Único por `titulo_id` (validación en mutation) |
| `precio_usd` | `v.number()` | ≥ 0 | |
| `unidad` | `v.optional(v.string())` | | ej. "mg/dL" |
| `valores_referencia` | `v.optional(v.string())` | | Free-text |
| `activo` | `v.boolean()` | | Soft-delete |
| `created_at` | `v.number()` | | |
| `updated_at` | `v.number()` | | |

**Indexes**:
- `by_titulo` (`titulo_id`, `nombre`)
- `by_nombre_search` (`nombre`) — búsqueda catálogo

### Entidad: `paquetes`

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `nombre` | `v.string()` | requerido, único | |
| `descripcion` | `v.optional(v.string())` | | |
| `created_at` | `v.number()` | | |

### Entidad: `paquetes_examenes` (join)

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `paquete_id` | `v.id("paquetes")` | | |
| `examen_id` | `v.id("examenes")` | | |
| `orden` | `v.number()` | | Para drag-and-drop |

**Indexes**: `by_paquete` (`paquete_id`, `orden`)

### Entidad: `resultados`

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `paciente_id` | `v.id("pacientes")` | requerido | |
| `fecha_muestra` | `v.number()` | requerido | |
| `fecha_resultado` | `v.optional(v.number())` | | Null si Pendiente |
| `medico_solicitante` | `v.optional(v.string())` | | |
| `estado` | `v.union(v.literal("Pendiente"), v.literal("Completado"))` | | |
| `observaciones` | `v.optional(v.string())` | | |
| `origen_presupuesto_id` | `v.optional(v.id("presupuestos"))` | | Trazabilidad conversión |
| `created_at` | `v.number()` | | |
| `created_by` | `v.id("usuarios")` | | |

**Indexes**:
- `by_paciente` (`paciente_id`, `created_at`)
- `by_fecha` (`fecha_muestra`)
- `by_estado` (`estado`)

### Entidad: `resultados_examenes` (detalle con **snapshot**)

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `resultado_id` | `v.id("resultados")` | | |
| `examen_id` | `v.id("examenes")` | | FK trazabilidad |
| `nombre_snap` | `v.string()` | | **Snapshot** nombre |
| `precio_snap` | `v.number()` | | **Snapshot** precio |
| `unidad_snap` | `v.optional(v.string())` | | Snapshot |
| `valores_referencia_snap` | `v.optional(v.string())` | | Snapshot |
| `valor` | `v.string()` | | Valor medido |
| `observacion` | `v.optional(v.string())` | | |
| `orden` | `v.number()` | | Para PDF |

**Indexes**: `by_resultado` (`resultado_id`, `orden`)

### Entidad: `presupuestos`

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `paciente_id` | `v.optional(v.id("pacientes"))` | | XOR con `paciente_nombre_libre` |
| `paciente_nombre_libre` | `v.optional(v.string())` | | XOR |
| `descuento_pct` | `v.number()` | 0-100 | |
| `ganancia_pct` | `v.number()` | ≥ 0 | Interno, no en PDF |
| `tasa_bs` | `v.number()` | > 0 | Snapshot de tasa al momento |
| `total_usd` | `v.number()` | | Precomputado |
| `total_bs` | `v.number()` | | `total_usd * tasa_bs` |
| `estado` | `v.union(v.literal("Borrador"), v.literal("Aprobado"), v.literal("Convertido"))` | | |
| `resultado_id` | `v.optional(v.id("resultados"))` | | Populated on convert |
| `created_at` | `v.number()` | | |
| `created_by` | `v.id("usuarios")` | | |

**Constraint aplicativa (mutation)**: exactamente uno de
`paciente_id` / `paciente_nombre_libre` poblado.

**Indexes**:
- `by_paciente` (`paciente_id`, `created_at`)
- `by_estado` (`estado`, `created_at`)
- `by_fecha` (`created_at`)

### Entidad: `presupuestos_examenes` (detalle con **snapshot**)

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `presupuesto_id` | `v.id("presupuestos")` | | |
| `examen_id` | `v.id("examenes")` | | FK trazabilidad |
| `nombre_snap` | `v.string()` | | |
| `precio_snap` | `v.number()` | | |
| `orden` | `v.number()` | | |

**Indexes**: `by_presupuesto` (`presupuesto_id`, `orden`)

### Entidad: `usuarios`

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `email` | `v.string()` | único | |
| `nombre` | `v.string()` | | |
| `role` | `v.union(v.literal("admin"), v.literal("operador"))` | | |
| `activo` | `v.boolean()` | | |
| `created_at` | `v.number()` | | |

**Indexes**: `by_email` (`email`)

Convex Auth mantiene `authAccounts` / `authSessions` en tablas separadas
(auto-generadas); esta tabla `usuarios` es el perfil de dominio con role.

### Entidad: `tasa_cambio_bcv`

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `tasa` | `v.number()` | > 0 | Bs por USD |
| `fecha` | `v.number()` | | Fecha calendario VE |
| `fuente` | `v.union(v.literal("bcv"), v.literal("dolartoday"), v.literal("manual"))` | | |
| `scraped_at` | `v.number()` | | Timestamp exacto |
| `motivo` | `v.optional(v.string())` | | Sólo para `manual` |
| `created_by` | `v.optional(v.id("usuarios"))` | | Sólo `manual` |

**Indexes**: `by_fecha` (`fecha`, `scraped_at` desc) — para `getLatest`

### Entidad: `audit_log`

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `usuario_id` | `v.optional(v.id("usuarios"))` | | Null para crons |
| `accion` | `v.string()` | | ej. "resultado.create" |
| `entity_type` | `v.string()` | | ej. "resultados" |
| `entity_id` | `v.optional(v.string())` | | |
| `metadata` | `v.any()` | | JSON adicional |
| `created_at` | `v.number()` | | |

**Indexes**: `by_created` (`created_at`), `by_usuario` (`usuario_id`, `created_at`)

### Entidad: `_migration_map` (sólo para F8, se puede borrar post-cutover)

| Campo | Tipo | Constraint | Nota |
|-------|------|------------|------|
| `wp_table` | `v.string()` | | ej. `"rv_pacientes"` |
| `wp_id` | `v.number()` | | ID original int |
| `convex_id` | `v.string()` | | ID Convex generado |
| `migrated_at` | `v.number()` | | |

**Indexes**: `by_wp` (`wp_table`, `wp_id`) — para idempotencia

## 7. Consideraciones no-funcionales

### 7.1 Performance

Traceability de cada NFR del PRD:

| NFR PRD | Cómo lo cumple la arquitectura |
|---------|--------------------------------|
| Búsqueda ≤ 300 ms p95 | Indexes Convex `by_search_*` sobre `nombre`/`cedula`; debounce 300 ms en UI; `useQuery` con websocket (0 latencia post-subscription); top-10 truncation server-side. |
| PDF ≤ 3 s p95 | Next Route Handler Node runtime warm; cache in-memory de assets Config Empresa (TTL 5 min); Convex query pre-hydrated con todos los joins necesarios; `@react-pdf` streaming al cliente (no buffer completo). |
| 10.000 resultados sin degradación | Index `by_fecha` + paginación cursor-based en listados; snapshots evitan joins caros; exportación via action con storage (no en request). |
| Búsqueda catálogo con highlight | Match client-side sobre top-N devuelto por index; highlight es render-only. |

### 7.2 Seguridad

- **AuthN**: Convex Auth (password), sesiones 8h con refresh automático.
  Cookie `httpOnly` `secure` `sameSite=lax`.
- **AuthZ (RBAC)**: helper `requireRole(ctx, "admin" | "operador")` en
  cada mutation/query sensible. Middleware Next.js aplica coarse-grained
  (rutas `/config` y `/examenes` sólo Admin).
- **PII**: cédula, nombre, teléfono, email de pacientes son datos
  sensibles bajo LOPD-equivalente. Convex encripta at-rest (SOC 2). En
  tránsito TLS 1.3 automático (Convex + Vercel).
- **PDFs**: Route Handlers validan sesión ANTES de renderizar. URLs de
  assets (Convex File Storage) son firmadas con TTL.
- **Threat model corto**:
  - Fuga de PDF por URL: mitigada — no hay URLs públicas de PDFs, se
    generan on-demand con auth.
  - Escalada Operador → Admin: mitigada por `requireRole` en TODAS las
    mutations de `config`, `examenes`, `usuarios`.
  - Duplicación de pacientes (cédula): mitigada con index único +
    normalización.
  - Man-in-the-middle: HTTPS obligatorio (Vercel + Convex).
- **Secretos**: `CONVEX_DEPLOY_KEY`, `BCV_FALLBACK_API_KEY` en Vercel
  env vars encriptados. Nunca en repo.

### 7.3 Observabilidad

- **Logs estructurados**: cada mutation/action loguea `{ user_id, action,
  entity_id, duration_ms }` via `console.log` (Convex captura y expone
  en dashboard).
- **Métricas clave**:
  - `pdf_render_duration_ms` p50/p95 (Vercel Route Handler).
  - `search_query_duration_ms` p50/p95 (Convex query metrics).
  - `bcv_scrape_success_rate` (audit_log).
  - `migration_rows_processed` (durante F8).
- **audit_log**: tabla dedicada para eventos de negocio (crear resultado,
  aprobar presupuesto, cambiar config).
- **Alertas**:
  - BCV scrape falla 2 días seguidos → email Admin.
  - PDF render > 5s p95 → alerta Vercel.
  - Uptime < 99.5% mensual → alerta Convex.

### 7.4 Confiabilidad

- **Idempotencia**:
  - F8 migración: `_migration_map` previene duplicación.
  - `presupuestos.convertToResultado`: chequea `resultado_id` antes de
    crear (retorna existente si ya se convirtió).
  - Cron `scrapeBCV`: escritura upsert por fecha (no duplica).
- **Retries**:
  - BCV scrape: intento primario → fallback DolarToday → warning.
  - Vercel Route Handlers: idempotentes GET (retry seguro).
- **Backup**: retención 30d nativa de Convex Cloud + export XLSX
  mensual como respaldo humano-legible (procedimiento documentado).
- **Testing**:
  - Unit tests (`packages/lib`): `normalizeCedula`, cálculo doble
    moneda, formato Bs venezolano.
  - Integration tests (`packages/convex`): mutations con `convex-test`.
  - E2E (Playwright): flujos críticos F5 (crear resultado + PDF), F6
    (crear presupuesto + convertir), F3 (búsqueda paciente).
  - Migration dry-run como test de regresión pre-cutover.

## 8. Plan de rollout técnico

**Feature flags** simples via env vars (`NEXT_PUBLIC_FEATURE_EXPORTACION`,
`NEXT_PUBLIC_FEATURE_BCV_AUTO`) para separar core de add-ons.

**Orden de deploy** (alineado con las 4 semanas del PRD):

1. **Sem 1-3 · Fundación**
   - Setup monorepo, tsconfigs, turbo pipelines, ESLint boundaries.
   - Convex init + `schema.ts` completo + indexes.
   - Convex Auth + tabla `usuarios` + middleware Next.
   - F2 Config Empresa (Admin) + upload File Storage.
   - F4 Catálogo con importación Excel.
   - F8 script migración WP (dry-run funcional).
2. **Sem 4-7 · Core Operativo**
   - F3 Pacientes con búsqueda.
   - F7 Paquetes con dnd-kit.
   - F5 Resultados + `ResultadoPDF` + Route Handler.
   - F6 Presupuestos + `PresupuestoPDF` + conversión → Resultado.
3. **Sem 8-9 · Cierre**
   - F1 Dashboard + Recharts.
   - F10 Exportación CSV.
   - Cron BCV + fallback DolarToday.
   - Hardening: empty states, mensajes error, validaciones edge.
4. **Sem 10 · Cutover**
   - Dry-run migración completa contra copia MySQL prod.
   - Validación diff a diff con Admin.
   - Cutover: WP a read-only → migración final → smoke tests → go-live.

**Rollback** (idéntico al PRD, ver §8 del PRD): pre-cutover no promocionar,
in-cutover restaurar dump MySQL, post-cutover mantener WP read-only 30d.

## 9. Riesgos técnicos + mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| `@react-pdf` cold-start en Vercel > 3s | Alta | SPIKE S3 valida; warm-up cron cada 5min ping a `/api/pdf/health`; cache asset URLs. |
| Convex cron falla silencioso en scrape BCV | Media | `audit_log` + alerta email si `stale > 24h`; UI banner amarillo. |
| Bundle size Next Route Handler PDF > 50MB | Media | `@react-pdf` es ~15MB, aceptable; fuentes custom sólo si necesarias. Tree-shake agresivo. |
| Convex Auth no soporta reset password out-of-box | Media | Implementar endpoint action + tabla `password_reset_tokens`; si es muy costoso migrar a Clerk (Plan B S5). |
| Migración WP genera IDs duplicados por retry parcial | Alta | `_migration_map` con index único `(wp_table, wp_id)`; script chequea antes de insertar. |
| Cédulas WP con caracteres raros no cubiertos por regex | Media | Dry-run reporta unmatched → resolución manual asistida antes de cutover. |
| dnd-kit conflicta con SSR de Next 14 | Baja | `'use client'` explícito en `<PaqueteBuilder>`; validado en spike ligero. |
| Recharts pesa mucho en bundle F1 | Baja | Import dinámico `next/dynamic` sin SSR para el chart. |
| xlsx (SheetJS) tiene CVE conocidos | Media | Fijar versión pinned; usar sólo server-side (no exponer parser al cliente). |
| BCV scraper bloqueado por Cloudflare / rate limit | Media | User-agent realista + fallback DolarToday + retry con backoff. |

## 10. Cambios en el codebase

Codebase greenfield. Toda la estructura es **N** (Nuevo).

| Path | Tipo | Descripción |
|------|------|-------------|
| `pnpm-workspace.yaml` | N | Config workspaces |
| `turbo.json` | N | Pipelines build/dev/lint/test |
| `tsconfig.base.json` | N | Config TS compartida |
| `.eslintrc.cjs` | N | Con `no-restricted-paths` para boundaries |
| `apps/web/` | N | Next.js 14 App Router |
| `apps/web/app/(auth)/login/page.tsx` | N | Login con Convex Auth |
| `apps/web/app/(app)/dashboard/page.tsx` | N | F1 |
| `apps/web/app/(app)/config/page.tsx` | N | F2 (Admin only) |
| `apps/web/app/(app)/pacientes/**` | N | F3 |
| `apps/web/app/(app)/examenes/**` | N | F4 |
| `apps/web/app/(app)/resultados/**` | N | F5 |
| `apps/web/app/(app)/presupuestos/**` | N | F6 |
| `apps/web/app/(app)/paquetes/**` | N | F7 |
| `apps/web/app/api/pdf/resultado/[id]/route.ts` | N | Node runtime PDF |
| `apps/web/app/api/pdf/presupuesto/[id]/route.ts` | N | Node runtime PDF |
| `apps/web/middleware.ts` | N | Auth guard + role guard |
| `apps/web/lib/convex-server.ts` | N | Helper `convexServerClient(token)` |
| `packages/convex/schema.ts` | N | Schema completo (11 tablas) |
| `packages/convex/auth.ts` | N | Convex Auth config |
| `packages/convex/pacientes.ts` | N | CRUD + search |
| `packages/convex/examenes.ts` | N | CRUD + import Excel |
| `packages/convex/paquetes.ts` | N | CRUD |
| `packages/convex/resultados.ts` | N | CRUD + `getForPDF` |
| `packages/convex/presupuestos.ts` | N | CRUD + `convertToResultado` |
| `packages/convex/config.ts` | N | F2 |
| `packages/convex/tasa.ts` | N | `getLatest`, `setManual` |
| `packages/convex/dashboard.ts` | N | KPIs + activity |
| `packages/convex/exports.ts` | N | F10 CSV actions |
| `packages/convex/audit.ts` | N | Helpers para `audit_log` |
| `packages/convex/crons.ts` | N | Cron registrations |
| `packages/convex/scrape/bcv.ts` | N | BCV scraper action |
| `packages/convex/helpers/auth.ts` | N | `requireRole()` |
| `packages/ui/**` | N | shadcn/ui components compartidos |
| `packages/lib/cedula.ts` | N | `normalizeCedula` |
| `packages/lib/bs-format.ts` | N | Formato + redondeo Venezuela (S7) |
| `packages/lib/xlsx-import.ts` | N | Parser SheetJS (server) |
| `packages/lib/schemas/**` | N | Zod schemas compartidos |
| `packages/pdf/ResultadoPDF.tsx` | N | Template F5 |
| `packages/pdf/PresupuestoPDF.tsx` | N | Template F6 |
| `packages/pdf/components/**` | N | Header, Footer, Firma, Sello |
| `packages/pdf/fonts/**` | N | Fuentes embebidas (si necesario) |
| `scripts/migrate-wp/index.ts` | N | Script F8 |
| `scripts/migrate-wp/mappers/**` | N | Mappers por tabla WP |
| `scripts/migrate-wp/normalize.ts` | N | Cédulas + duplicados |

## 11. Fases sugeridas (input para orch-spec)

Cada fase genera un `docs/spec/f<n>-*.md` con orch-spec.

- **F0 · Setup fundacional**
  - Monorepo, tsconfig, turbo, ESLint boundaries.
  - Convex init + `schema.ts` completo (11 tablas + indexes).
  - Convex Auth + middleware Next.
  - Layout base `apps/web` (shadcn, tailwind, tema).
  - CI GitHub Actions (lint + typecheck + unit test).
- **F1 · Config + Catálogo + Migración**
  - F2 Config Empresa (Admin, con upload File Storage).
  - F4 Catálogo Exámenes (CRUD Titulos + Exámenes, import Excel).
  - F8 Script migración WP (dry-run + reporte).
- **F2 · Core operativo**
  - F3 Pacientes (CRUD, búsqueda debounced, ficha con historial).
  - F7 Paquetes (dnd-kit split-view).
  - F5 Resultados (CRUD + Route Handler PDF).
  - F6 Presupuestos (CRUD + doble moneda + nombre libre + convertir).
- **F3 · Dashboard + Exportación + BCV**
  - F1 Dashboard (KPIs + Recharts + actividad).
  - F10 Exportación CSV (Pacientes, Presupuestos, Resultados, Costos).
  - BCV cron + fallback DolarToday + banner UI stale.
  - Cleanup exports cron.
- **F4 · Hardening + Cutover**
  - Empty states, error boundaries, validaciones edge.
  - Migración final + smoke tests + go-live.
  - Post-cutover: audit log dashboards, monitoreo uptime.

## 12. Spikes → gating por feature

| Spike | Bloquea | Debe resolver antes de |
|-------|---------|------------------------|
| **S3 · @react-pdf server-side** | F5, F6 (PDFs) | Fase 2 (Core operativo) — sin PDF no hay entregable |
| **S2 · Migración WP → Convex** | F8 (migración) | Fase 1 (Config + Catálogo + Migración) |
| **S5 · Convex Auth prod-ready** | F9 (auth) | **F0 Setup** — auth es fundacional |
| **S7 · Formato/redondeo Bs** | F6 (presupuestos) | Fase 2 (antes de F6) |
| **S4 · Reestructuración grupos exámenes** | F4 (catálogo) | Fase 1 (antes de import Excel) |
| **S1 · Scraper BCV** | Cron BCV (no bloquea F6 porque hay manual) | Fase 3 |
| **S6 · Exportación CSV/XLSX** | F10 | Fase 3 |
| **S8 · Multi-tenant Fase 2** | Ninguna en v1 | Post-v1 (sólo diseño) |

**Gates críticos**:
- S5 debe resolverse en día 1 del proyecto (auth escrita en F0).
- S3 debe resolverse antes de iniciar F5/F6 (Fase 2 no arranca sin PDF path).
- S2 debe resolverse antes de F8 (Fase 1).
- S7 debe resolverse antes de F6 (cálculos incorrectos = plata mal cobrada).

## 13. Referencias

- **PRD**: `docs/prd/001-labsystem-v1.md`
- **Diagramas interactivos** (archify HTML standalone):
  - `docs/arch/diagrams/001-labsystem.diagrams.html` — sistema + monorepo
  - `docs/arch/diagrams/001-labsystem-erd.diagrams.html` — schema Convex ERD
  - `docs/arch/diagrams/001-labsystem-f5-pdf.diagrams.html` — sequence F5 (Crear Resultado + PDF)
  - `docs/arch/diagrams/001-labsystem-f6-convert.diagrams.html` — sequence F6 (Convertir Presupuesto)
  - `docs/arch/diagrams/001-labsystem-bcv-cron.diagrams.html` — sequence tasa BCV cron
  - `docs/arch/diagrams/001-labsystem-export.diagrams.html` — dataflow F10 exportación CSV
- **PRD fuente (cliente)**: `LabSystem — PRD.pdf` v1.0
- **Auditoría plugin WP**: `RV Laboratorio — Auditoría.pdf`
- **Plugin origen**: `rv-laboratorio` v1.2.1 (WordPress)
- **Convex docs**: https://docs.convex.dev
- **@react-pdf docs**: https://react-pdf.org/
- **shadcn/ui**: https://ui.shadcn.com/
