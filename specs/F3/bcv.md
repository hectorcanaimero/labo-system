---
type: spec
phase: F3
package: bcv
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - F0.auth
  - F2.presupuestos
  - S1.bcv-scraper
blocks: []
generated_by: orch-spec
generated_at: 2026-08-23
title: "F3.bcv — Cron scraper BCV + fallback DolarToday + banner UI stale"
---

# F3 · BCV (Cron scraper)

Cron diario que scrapea la tasa BCV, escribe en `tasa_cambio_bcv`, con fallback a DolarToday y banner UI cuando la tasa está stale.

## Referencias

- **PRD**: §10 (S1), §4 F2 y F6 (tasa BCV).
- **ARCH**: ADR-07 (cron), §5.3, §4.3 (sequence).
- **Spike**: S1.bcv-scraper (resuelto).

---

## F3.bcv.T01 — Scraper action `crons/scrapeBCV` (Node runtime)

### Objetivo

Convex action que scrapea `bcv.org.ve` con fetch+cheerio, parsea tasa USD, escribe en tabla.

### Contexto

ARCH ADR-07 y §4.3. S1 confirma selector y estrategia.

### Alcance

Sí hace:
- `packages/convex/scrape/bcv.ts`:
  - Export `scrapeBCV` internalAction (Node runtime `"use node"`).
  - `fetch("https://bcv.org.ve/")` con user-agent realista (de S1).
  - `cheerio.load(html)` + selector CSS de S1.
  - Parse número (regex + Number.parseFloat).
  - Insert `tasa_cambio_bcv` con `fuente: "bcv"`, `fecha` (hoy VE), `scraped_at` (now).
  - Retry con backoff (1 intento primario + 2 reintentos).
  - Si falla → llamar `scrapeDolarTodayFallback` (T02).
  - Audit log de éxito/fallo.

### Criterios de aceptación

- [ ] Scrape exitoso escribe fila.
- [ ] Fetch falla → 2 reintentos backoff (1s, 3s).
- [ ] 3 fallos → invoca fallback.
- [ ] Fallo total → audit log warning, no lanza.

### Archivos afectados

- `packages/convex/scrape/bcv.ts`

### Dependencias

- F0.setup.T03
- S1.bcv-scraper

### Estimación

M (4h)

---

## F3.bcv.T02 — Fallback DolarToday

### Objetivo

Segunda fuente de tasa cuando `bcv.org.ve` falla.

### Alcance

Sí hace:
- `packages/convex/scrape/dolartoday.ts`:
  - Export `scrapeDolarTodayFallback` internalAction.
  - Fetch a API DolarToday (endpoint definido en S1).
  - Parse JSON.
  - Insert `tasa_cambio_bcv` con `fuente: "dolartoday"`.

### Criterios de aceptación

- [ ] Fallback escribe fila cuando primario falla.
- [ ] Audit log distingue fuente.

### Archivos afectados

- `packages/convex/scrape/dolartoday.ts`

### Dependencias

- F3.bcv.T01

### Estimación

S (2h)

---

## F3.bcv.T03 — Registrar cron diario en `crons.ts`

### Objetivo

Cron Convex 09:00 VET (13:00 UTC estándar).

### Alcance

Sí hace:
- `packages/convex/crons.ts`:
  - `crons.daily("scrapeBCV", { hourUTC: 13, minuteUTC: 0 }, internal.scrape.bcv.scrapeBCV)`.
- Documentar en README de convex.

### Criterios de aceptación

- [ ] Cron visible en Convex dashboard.
- [ ] Ejecución manual desde dashboard OK.
- [ ] Corre al horario correcto.

### Archivos afectados

- `packages/convex/crons.ts`

### Dependencias

- F3.bcv.T01

### Estimación

S (1h)

---

## F3.bcv.T04 — Banner UI "tasa stale" + alerta email a Admin (2 días)

### Objetivo

Componente banner que aparece en `/presupuestos/*` cuando la tasa tiene > 24h. Alerta email a Admin si > 2 días.

### Contexto

ARCH ADR-07 (banner amarillo), §7.3 (alerta email).

### Alcance

Sí hace:
- Component `packages/ui/tasa/StaleTasaBadge.tsx`:
  - `useQuery(tasa.getLatest)`.
  - Si `stale === true` → badge amarillo con tooltip "Última: X horas atrás".
  - Si tasa null → badge rojo "Sin tasa registrada".
- Insertar badge en form nuevo presupuesto (F2.presupuestos.T06).
- Cron adicional `checkStaleTasaAlert` diario que:
  - Si tasa más reciente > 48h → dispara email a Admin (`usuarios.role === "admin"`).
  - Idempotente (no re-envía si ya alertó hoy).

### Criterios de aceptación

- [ ] Badge amarillo con tasa > 24h.
- [ ] Badge rojo sin tasa.
- [ ] Email a Admin con tasa > 48h (mock/log en dev).

### Archivos afectados

- `packages/ui/tasa/StaleTasaBadge.tsx`
- `packages/convex/crons.ts` (agregar cron alerta)
- `packages/convex/crons/checkStaleTasaAlert.ts`

### Dependencias

- F0.auth.T04
- F2.presupuestos.T03
- F3.bcv.T01

### Estimación

M (4h)
