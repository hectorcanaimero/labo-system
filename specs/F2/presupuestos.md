---
type: spec
phase: F2
package: presupuestos
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - F0.auth
  - F1.config
  - F1.catalogo
  - F2.pacientes
  - F2.paquetes
  - F2.resultados
  - S3.react-pdf-runtime
  - S7.bs-rounding
blocks:
  - F3.dashboard
  - F3.export
generated_by: orch-spec
generated_at: 2026-08-23
title: "F2.presupuestos — CRUD Presupuestos + doble moneda + convertir + nombre libre"
---

# F2 · Presupuestos

CRUD de presupuestos con paciente XOR nombre libre, cálculo en tiempo real de doble moneda USD/Bs, tasa BCV precargada, conversión a Resultado, PDF con doble moneda. Bloqueado por S3 (PDF runtime) y S7 (formato Bs).

## Referencias

- **PRD**: §4 F6 (Presupuestos), §9 (métricas).
- **ARCH**: ADR-02 (PDF), ADR-05 (paciente XOR nombre libre), §6, §3 componente F6.
- **Spikes**: S3, S7.

---

## F2.presupuestos.T01 — Utilidades de dinero + `packages/lib/bs-format.ts`

### Objetivo

Implementar `formatBs`, `formatUsd`, `roundBs`, `calcularTotales` con las reglas de S7.

### Contexto

S7 documenta reglas exactas (decimales, redondeo, separadores).

### Alcance

Sí hace:
- `packages/lib/bs-format.ts`:
  - `formatBs(amount: number): string`.
  - `formatUsd(amount: number): string`.
  - `roundBs(amount: number): number`.
  - `roundUsd(amount: number): number`.
  - `calcularTotales({ subtotal, descuentoPct, gananciaPct, tasa }): { totalUsd, totalBs }`.
- Suite de tests exhaustiva (mínimo 20 casos edge de S7).

### Criterios de aceptación

- [ ] Reglas S7 respetadas en 100% de tests.
- [ ] `calcularTotales` matchea fórmula PRD: `Total USD = subtotal × (1 - desc%) × (1 + gan%)`, `Total Bs = round(Total USD × tasa)`.
- [ ] Edge cases: 0.005, 0.015, negativos, descuento 100%.

### Archivos afectados

- `packages/lib/bs-format.ts`
- `packages/lib/bs-format.test.ts`
- `packages/lib/calcular-totales.ts`
- `packages/lib/calcular-totales.test.ts`

### Dependencias

- F0.setup.T01
- S7.bs-rounding (resuelto)

### Estimación

M (5h)

---

## F2.presupuestos.T02 — CRUD queries/mutations con snapshots + XOR paciente

### Objetivo

Backend Convex completo para presupuestos.

### Contexto

ARCH ADR-05, §6.

### Alcance

Sí hace:
- `packages/convex/presupuestos.ts`:
  - Query `list({ cursor?, limit?, filters })` — filtros paciente, estado, fecha.
  - Query `getById({ id })` — presupuesto + líneas.
  - Query `getForPDF({ id })` — para el PDF.
  - Query `search({ term })`.
  - Mutation `create({ paciente_id?, paciente_nombre_libre?, descuento_pct, ganancia_pct, tasa_bs, examenes: [...] })`:
    - Constraint: exactamente uno de `paciente_id` / `nombre_libre` (Zod).
    - Snapshot nombre/precio.
    - Precomputa `total_usd`, `total_bs` con `calcularTotales`.
    - Estado inicial `Borrador`.
  - Mutation `update({ id, ... })`.
  - Mutation `updateEstado({ id, estado })`.
  - Mutation `delete({ id })` — Admin only.
- `packages/lib/schemas/presupuesto.ts` con Zod (XOR constraint via `.refine`).
- Auth Operador OK.
- Audit log.

### Criterios de aceptación

- [ ] Create con paciente_id OK.
- [ ] Create con nombre_libre OK.
- [ ] Create con ambos → error `PACIENTE_XOR_REQUIRED`.
- [ ] Create sin ninguno → error.
- [ ] Totales precomputados coinciden con `calcularTotales`.
- [ ] Cambiar estado a Convertido requiere `resultado_id`.
- [ ] Snapshots preservados.

### Archivos afectados

- `packages/lib/schemas/presupuesto.ts`
- `packages/convex/presupuestos.ts`

### Dependencias

- F0.auth.T04
- F1.catalogo.T02
- F2.pacientes.T02
- F2.presupuestos.T01

### Estimación

L (8h)

---

## F2.presupuestos.T03 — Tasa BCV: `getLatest` + `setManual`

### Objetivo

Query `tasa.getLatest()` (ya iniciada en F1.config.T03) + mutation `tasa.setManual({ tasa, motivo })` (Admin only).

### Contexto

ARCH ADR-07, §6. Se usa en form de presupuesto para pre-rellenar `tasa_bs`. F3.bcv agrega el cron.

### Alcance

Sí hace:
- Completa `packages/convex/tasa.ts`:
  - Query `getLatest()` retorna `{ tasa, fuente, scraped_at, stale }` (stale = age > 24h).
  - Mutation `setManual({ tasa, motivo })` (Admin) — inserta con `fuente: "manual"`.
- Audit log.

### Criterios de aceptación

- [ ] `getLatest` retorna null si tabla vacía.
- [ ] `getLatest` marca `stale: true` si > 24h.
- [ ] `setManual` Admin only.
- [ ] audit_log registra motivo.

### Archivos afectados

- `packages/convex/tasa.ts`

### Dependencias

- F0.auth.T04
- F1.config.T03

### Estimación

S (2h)

---

## F2.presupuestos.T04 — Template PDF `<PresupuestoPDF />`

### Objetivo

Componente PDF con doble moneda (USD + Bs), sin mostrar ganancia interna.

### Contexto

ARCH §3, PRD §4 F6 (bullet "PDF con doble moneda sin ganancia").

### Alcance

Sí hace:
- `packages/pdf/PresupuestoPDF.tsx`:
  - Header reusable (F2.resultados.T04).
  - Datos paciente (real o nombre libre).
  - Tabla exámenes con precio USD y precio Bs (según tasa del presupuesto).
  - Subtotal, descuento, Total USD, Total Bs.
  - **NO muestra ganancia %**.
  - Footer con firma + sello + pie.
- Formato con `formatBs`/`formatUsd`.

### Criterios de aceptación

- [ ] Renderiza sin errores.
- [ ] Ganancia % NO visible en PDF (test explícito).
- [ ] Formato Bs sigue reglas S7.
- [ ] Paciente libre vs paciente real ambos renderizan.

### Archivos afectados

- `packages/pdf/PresupuestoPDF.tsx`

### Dependencias

- F2.resultados.T04 (reusa header/footer)
- F2.presupuestos.T01
- F2.presupuestos.T02

### Estimación

M (6h)

---

## F2.presupuestos.T05 — Route Handler `/api/pdf/presupuesto/[id]`

### Objetivo

Endpoint Next.js igual a resultados pero para presupuestos.

### Alcance

- `apps/web/app/api/pdf/presupuesto/[id]/route.ts`.
- Mismo patrón que F2.resultados.T05 (helper + guards + streaming).

### Criterios de aceptación

- [ ] Request válido devuelve PDF.
- [ ] Errores 401/403/404 correctos.
- [ ] p95 warm < 3s.

### Archivos afectados

- `apps/web/app/api/pdf/presupuesto/[id]/route.ts`

### Dependencias

- F2.presupuestos.T02
- F2.presupuestos.T04
- F2.resultados.T05 (helper `convex-server` reuse)

### Estimación

S (3h)

---

## F2.presupuestos.T06 — UI `/presupuestos` (list + form + detalle + convertir)

### Objetivo

Página con lista + filtros; form nuevo con doble moneda live; detalle con botones "Aprobar", "Convertir a Resultado", "Descargar PDF".

### Contexto

PRD §4 F6 completo; ARCH §4.2 sequence.

### Alcance

Sí hace:
- `apps/web/app/(app)/presupuestos/page.tsx` — lista con filtros.
- `apps/web/app/(app)/presupuestos/nuevo/page.tsx` — form:
  - Toggle "Paciente registrado" vs "Nombre libre".
  - `<PacienteAutocomplete>` o `<input>` según toggle.
  - "Cargar Paquete" (F2.paquetes.T03).
  - Agregar exámenes uno a uno.
  - Descuento %, Ganancia % (visible sólo en UI, no en PDF).
  - Tasa Bs pre-rellenada con `tasa.getLatest()` + badge "stale" si >24h.
  - Cálculo LIVE de subtotal, Total USD, Total Bs mientras el usuario edita.
- `apps/web/app/(app)/presupuestos/[id]/page.tsx` — detalle:
  - Botones según estado: Borrador → "Aprobar", Aprobado → "Convertir a Resultado", "Descargar PDF" siempre.
  - Modal confirmar convertir → si nombre libre → mensaje "primero crear ficha" con link a form pacientes con datos precargados.
- Edición sólo en Borrador.

### Criterios de aceptación

- [ ] Cálculo live actualiza al cambiar cualquier campo.
- [ ] Aprobar cambia estado y bloquea edición.
- [ ] Convertir con paciente real → navega a nuevo resultado precargado.
- [ ] Convertir con nombre libre → muestra bloqueo con acción "crear ficha".
- [ ] Tasa BCV se pre-rellena; badge "stale" visible si >24h.
- [ ] PDF descarga OK.

### Archivos afectados

- `apps/web/app/(app)/presupuestos/page.tsx`
- `apps/web/app/(app)/presupuestos/PresupuestosList.tsx`
- `apps/web/app/(app)/presupuestos/nuevo/page.tsx`
- `apps/web/app/(app)/presupuestos/nuevo/PresupuestoForm.tsx`
- `apps/web/app/(app)/presupuestos/[id]/page.tsx`
- `apps/web/app/(app)/presupuestos/[id]/PresupuestoDetalle.tsx`

### Dependencias

- F0.setup.T06
- F0.auth.T03
- F2.pacientes.T03
- F2.paquetes.T03
- F2.presupuestos.T01
- F2.presupuestos.T02
- F2.presupuestos.T03
- F2.presupuestos.T05
- F2.resultados.T03 (mutation convertToResultado)

### Estimación

XL (14h)
