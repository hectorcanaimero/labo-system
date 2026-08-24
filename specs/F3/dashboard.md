---
type: spec
phase: F3
package: dashboard
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - F0.auth
  - F2.pacientes
  - F2.resultados
  - F2.presupuestos
blocks: []
generated_by: orch-spec
generated_at: 2026-08-23
title: "F3.dashboard — KPIs + gráfico + actividad reciente"
---

# F3 · Dashboard

Panel de inicio con KPIs del mes, gráfico de resultados últimos 6 meses (Recharts), actividad reciente. Es la primera pantalla que ve el usuario post-login.

## Referencias

- **PRD**: §4 F1 (Dashboard — NUEVO).
- **ARCH**: §3 componente F1, §9 (Recharts con `next/dynamic`).

---

## F3.dashboard.T01 — Queries `dashboard.getKPIs` y `dashboard.getRecentActivity`

### Objetivo

Backend Convex con dos queries eficientes para el dashboard.

### Alcance

Sí hace:
- `packages/convex/dashboard.ts`:
  - Query `getKPIs()` retorna `{ pacientesMes, resultadosMes, presupuestosMes, ingresosEstimadosUsd }`:
    - Cuenta pacientes creados este mes.
    - Cuenta resultados completados este mes.
    - Cuenta presupuestos aprobados+convertidos este mes.
    - Suma `total_usd` de presupuestos aprobados+convertidos.
  - Query `getResultadosPorMes({ months: number })` retorna array `[{ mes: "2026-08", count: 42 }, ...]` de los últimos N meses.
  - Query `getRecentActivity({ limit })` retorna `{ resultados: [...], presupuestos: [...] }` últimos 5.
- Auth requerida (Operador OK — ve mismo dashboard).

No hace:
- UI (T02).

### Criterios de aceptación

- [ ] `getKPIs` retorna números correctos (test con dataset seed).
- [ ] `getResultadosPorMes(6)` retorna 6 items.
- [ ] `getRecentActivity(5)` retorna arrays con hasta 5 items.
- [ ] Performance < 500ms con dataset migrado.

### Archivos afectados

- `packages/convex/dashboard.ts`

### Dependencias

- F0.auth.T04
- F2.pacientes.T02
- F2.resultados.T02
- F2.presupuestos.T02

### Estimación

M (4h)

### Notas técnicas

Usar `by_fecha` / `by_estado` indexes. Para count por mes: recorrer y agrupar en JS (Convex no tiene aggregation SQL). Considerar cachear si es lento.

---

## F3.dashboard.T02 — UI `/dashboard` con KPI cards + chart + actividad

### Objetivo

Página `/dashboard` con layout de 4 cards KPI, chart de línea/barra de últimos 6 meses, dos listas de actividad reciente, accesos directos.

### Contexto

PRD §4 F1; ARCH §9 (Recharts con `next/dynamic sin SSR`).

### Alcance

Sí hace:
- `apps/web/app/(app)/dashboard/page.tsx` — Server component con preload.
- Cards KPI (4): Pacientes mes, Resultados mes, Presupuestos mes, Ingresos USD estimados.
- Chart Recharts (import dinámico) barras/línea de resultados últimos 6 meses.
- Lista "Últimos 5 resultados" con link a detalle.
- Lista "Últimos 5 presupuestos" con link a detalle.
- Cards de "Acceso rápido" a los módulos operativos.
- Loading states + empty state ("empezá creando tu primer paciente").

### Criterios de aceptación

- [ ] Renderiza sin errores con dataset seed.
- [ ] Cards KPI actualizan en tiempo real (Convex realtime).
- [ ] Chart legible; tooltip funciona.
- [ ] Links de actividad navegan al detalle correcto.
- [ ] Recharts import dinámico (verificado en bundle analyzer).

### Archivos afectados

- `apps/web/app/(app)/dashboard/page.tsx`
- `apps/web/app/(app)/dashboard/KPICards.tsx`
- `apps/web/app/(app)/dashboard/ResultadosChart.tsx`
- `apps/web/app/(app)/dashboard/RecentActivity.tsx`
- `apps/web/app/(app)/dashboard/QuickLinks.tsx`

### Dependencias

- F0.setup.T06
- F0.auth.T03
- F3.dashboard.T01

### Estimación

L (8h)

### Notas técnicas

`const Chart = dynamic(() => import('./ResultadosChart'), { ssr: false })`.
