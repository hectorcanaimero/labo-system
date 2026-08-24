---
type: spec
phase: F4
package: hardening
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
  - F2.presupuestos
  - F3.dashboard
  - F3.export
  - F3.bcv
blocks:
  - F4.cutover
generated_by: orch-spec
generated_at: 2026-08-23
title: "F4.hardening — Empty states, validaciones edge, error handling, tests E2E"
---

# F4 · Hardening

Pulido antes del cutover: empty states, validaciones edge no cubiertas, error boundaries, mensajes de error, tests E2E críticos con Playwright, warm-up ping PDF, health check endpoint.

## Referencias

- **PRD**: §8 Sem 8-9 (cierre + hardening).
- **ARCH**: §7 NFR, §9 riesgos técnicos (cold-start warm-up).

---

## F4.hardening.T01 — Empty states + loading skeletons en todas las listas

### Objetivo

Cada lista y ficha tiene empty state ilustrado y loading skeleton (no spinner genérico).

### Alcance

Sí hace:
- Empty states en: pacientes, resultados, presupuestos, paquetes, exámenes, dashboard, config.
- Skeletons para: cards KPI, tablas, formularios.
- Componente reusable `packages/ui/feedback/EmptyState.tsx` y `packages/ui/feedback/Skeleton.tsx`.
- Copy con voz del producto (español VE, calidez).

### Criterios de aceptación

- [ ] Cada lista muestra empty state en dataset vacío.
- [ ] Loading skeleton visible en carga inicial.
- [ ] Sin spinners genéricos.

### Archivos afectados

- `packages/ui/feedback/EmptyState.tsx`
- `packages/ui/feedback/Skeleton.tsx`
- Integraciones en cada página de F1/F2/F3.

### Dependencias

- Todas las F2/F3 UI tasks (T05, T06 de cada package).

### Estimación

M (6h)

---

## F4.hardening.T02 — Error boundaries + toasts de error consistentes

### Objetivo

Error boundary por sección + sistema de toasts unificado (reusar `sonner` o shadcn toast).

### Alcance

Sí hace:
- `apps/web/app/(app)/error.tsx` boundary root.
- Per-section: `apps/web/app/(app)/[modulo]/error.tsx`.
- Helper `packages/ui/feedback/toast.ts` con `notifyError`, `notifySuccess`, `notifyInfo`.
- Refactor mutations: capturar error → toast con mensaje humano-legible (mapping errores conocidos → texto).
- Todos los errores backend (Convex + Route Handlers) mapeados.

### Criterios de aceptación

- [ ] Excepción no capturada → error boundary muestra "Algo salió mal" con reset.
- [ ] Todos los errores conocidos tienen mensaje humano en toast.
- [ ] Errores 401 en API redirigen a login.

### Archivos afectados

- `apps/web/app/(app)/error.tsx`
- `apps/web/app/(app)/*/error.tsx` (por módulo)
- `packages/ui/feedback/toast.ts`
- `packages/lib/error-messages.ts`

### Dependencias

- Todas las UI de F2/F3.

### Estimación

M (5h)

---

## F4.hardening.T03 — Validaciones edge (fechas, límites, XOR checks)

### Objetivo

Cubrir edge cases identificados en QA: fechas absurdas, cédulas rebordes, montos negativos, descuento > 100%, tasa 0.

### Alcance

Sí hace:
- Refuerzo Zod schemas con `.refine` para:
  - Fecha muestra ≤ hoy.
  - Fecha resultado ≥ fecha muestra si ambas.
  - Descuento 0-100.
  - Ganancia ≥ 0.
  - Tasa > 0.
  - Cédula sin caracteres raros.
- Backend defensive check duplicado (mutations validan además de UI).
- Tests unitarios + de integración cubriendo cada edge.

### Criterios de aceptación

- [ ] Fecha muestra futura rechaza.
- [ ] Descuento 150% rechaza en form y backend.
- [ ] Presupuesto con `paciente_id` + `nombre_libre` rechaza en backend (test integración).
- [ ] Test coverage de schemas > 90%.

### Archivos afectados

- `packages/lib/schemas/*.ts` (refuerzo)
- `packages/convex/*.ts` (checks defensivos)

### Dependencias

- F2.pacientes.T01
- F2.resultados.T01
- F2.presupuestos.T01

### Estimación

M (5h)

---

## F4.hardening.T04 — Warm-up ping PDF + health check

### Objetivo

Cron ping `/api/pdf/health` cada 5min para mantener Vercel Route Handler warm (mitigación cold-start PDF).

### Contexto

ARCH §9 riesgo cold-start.

### Alcance

Sí hace:
- Endpoint `apps/web/app/api/pdf/health/route.ts` (Node runtime) que:
  - Retorna 200 OK.
  - Opcional: hace un render dummy mini (1KB PDF) para calentar `@react-pdf`.
- Cron externo (Vercel Cron o endpoint público hit por Convex cron) cada 5min en horario laboral.
- Métrica `pdf_health_ok` en logs.

### Criterios de aceptación

- [ ] `/api/pdf/health` responde 200.
- [ ] Cron activo en Vercel dashboard.
- [ ] Métrica visible.

### Archivos afectados

- `apps/web/app/api/pdf/health/route.ts`
- `vercel.json` (cron config) O `packages/convex/crons.ts` (ping desde Convex)

### Dependencias

- F2.resultados.T05

### Estimación

S (2h)

---

## F4.hardening.T05 — Tests E2E Playwright de flujos críticos

### Objetivo

Suite Playwright cubriendo flujos que si fallan bloquean operación: login, crear paciente, crear resultado + PDF, crear presupuesto + convertir, exportar CSV.

### Alcance

Sí hace:
- `apps/web/e2e/` con Playwright config.
- Test `auth.spec.ts` (login OK, login fail).
- Test `paciente.spec.ts` (crear + buscar).
- Test `resultado.spec.ts` (crear + descargar PDF).
- Test `presupuesto.spec.ts` (crear + aprobar + convertir a resultado).
- Test `export.spec.ts` (exportar presupuestos).
- Fixtures seed data.
- CI job E2E (separado, con headless Chrome).

### Criterios de aceptación

- [ ] 5 tests pasan en local + CI.
- [ ] Tiempo total < 5min.
- [ ] Screenshot on failure.

### Archivos afectados

- `apps/web/e2e/*.spec.ts`
- `apps/web/playwright.config.ts`
- `.github/workflows/e2e.yml`

### Dependencias

- Todas las UI de F2/F3.

### Estimación

L (10h)

---

## F4.hardening.T06 — Audit log dashboard (Admin only)

### Objetivo

Página Admin `/audit` para ver últimos N eventos del `audit_log`.

### Contexto

ARCH §7.3.

### Alcance

Sí hace:
- Query `audit.list({ cursor?, limit? })`.
- Página `/audit` (Admin only via middleware).
- Tabla con filtros por usuario, acción, entity, fecha.
- Sólo visualización (no edit).

### Criterios de aceptación

- [ ] Admin ve logs; Operador redirigido.
- [ ] Filtros funcionan.
- [ ] Paginación.

### Archivos afectados

- `packages/convex/audit.ts` (query `list`)
- `apps/web/app/(app)/audit/page.tsx`
- `apps/web/middleware.ts` (agregar guard `/audit` admin)

### Dependencias

- F0.auth.T04
- F0.auth.T05

### Estimación

M (4h)
