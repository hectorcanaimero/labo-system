---
type: spec
phase: F0
package: setup
project_id: labo-system
version: 0.1
depends_on:
  - prd/001-labsystem-v1.md
  - arch/001-labsystem-arch.md
blocks:
  - F0.auth
  - F1.config
  - F1.catalogo
  - F1.migracion
  - F2.pacientes
  - F2.paquetes
  - F2.resultados
  - F2.presupuestos
  - F3.dashboard
  - F3.export
  - F3.bcv
  - F4.hardening
  - F4.cutover
generated_by: orch-spec
generated_at: 2026-08-23
title: "F0.setup — Fundación (monorepo, Convex init, layout base)"
---

# F0 · Setup fundacional

Bootstrap del proyecto: monorepo, tooling, Convex init, layout base Next.js, CI. Todo lo demás depende de este package.

## Referencias

- **PRD**: `docs/prd/001-labsystem-v1.md` §5 (stack), §8 (rollout Sem 1-3).
- **ARCH**: ADR-01 (Convex backend), ADR-08 (monorepo pnpm+turborepo, 5 packages con boundaries).

---

## F0.setup.T01 — Inicializar monorepo pnpm + turborepo

### Objetivo

Crear la estructura base del monorepo con `pnpm workspaces` + `turborepo`, siguiendo la topología de 5 packages fijada en ARCH ADR-08.

### Contexto

ARCH ADR-08 fija: `apps/web`, `packages/convex`, `packages/ui`, `packages/lib`, `packages/pdf`. Frontera estricta vía ESLint `no-restricted-paths`.

### Alcance

Sí hace:
- `package.json` root con `packageManager: pnpm@X.Y.Z`.
- `pnpm-workspace.yaml` con `apps/*` y `packages/*`.
- `turbo.json` con pipelines `build`, `dev`, `lint`, `typecheck`, `test`.
- Directorios vacíos con `package.json` mínimo para cada workspace.
- `tsconfig.base.json` compartido con paths.
- `.gitignore`, `.nvmrc`, `.node-version`.
- README de root con comandos base (`pnpm dev`, `pnpm build`).

No hace:
- Instalar dependencias reales de cada package (eso viene en tasks siguientes).
- Configurar ESLint boundaries (T04).

### Criterios de aceptación

- [ ] `pnpm install` corre sin errores en repo limpio.
- [ ] `pnpm turbo run typecheck` corre (aunque no haya código aún).
- [ ] Estructura de carpetas coincide con ARCH §10.
- [ ] `tsconfig.base.json` extiende correctamente en cada workspace.

### Archivos afectados

- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.base.json`
- `package.json` (root)
- `apps/web/package.json`
- `packages/convex/package.json`
- `packages/ui/package.json`
- `packages/lib/package.json`
- `packages/pdf/package.json`
- `.gitignore`, `.nvmrc`

### Dependencias

Ninguna.

### Estimación

S (2h)

### Notas técnicas

Node 20 LTS. pnpm 9.x. Turbo 2.x.

---

## F0.setup.T02 — Bootstrap apps/web (Next.js 14 App Router)

### Objetivo

Inicializar `apps/web` como app Next.js 14 App Router con TypeScript, Tailwind, shadcn/ui base.

### Contexto

PRD §5 fija Next.js 14 App Router + shadcn/ui + Tailwind. ARCH §10 fija estructura de rutas `(app)` / `(auth)`.

### Alcance

Sí hace:
- `create-next-app` (o manual) con App Router, TS, Tailwind.
- Configurar `tailwind.config.ts` con preset compartido futuro.
- Inicializar shadcn/ui con `npx shadcn init`.
- Layout root `apps/web/app/layout.tsx` con proveedores base.
- Placeholders `apps/web/app/(auth)/login/page.tsx` y `apps/web/app/(app)/dashboard/page.tsx` (contenido stub).
- Configurar `next.config.mjs` con transpilePackages de workspaces.

No hace:
- Auth real (F0.auth).
- Cualquier feature de negocio.

### Criterios de aceptación

- [ ] `pnpm --filter web dev` levanta Next.js sin errores.
- [ ] Ruta `/dashboard` responde con placeholder.
- [ ] Ruta `/login` responde con placeholder.
- [ ] Tailwind funcional (verificado con clase `text-red-500` en placeholder).
- [ ] Componente shadcn `Button` importable y renderiza.

### Archivos afectados

- `apps/web/next.config.mjs`
- `apps/web/tailwind.config.ts`
- `apps/web/postcss.config.js`
- `apps/web/tsconfig.json`
- `apps/web/app/layout.tsx`
- `apps/web/app/(auth)/login/page.tsx`
- `apps/web/app/(app)/dashboard/page.tsx`
- `apps/web/app/globals.css`
- `apps/web/components.json` (shadcn config)

### Dependencias

- F0.setup.T01

### Estimación

M (4h)

### Notas técnicas

App Router route groups `(app)` y `(auth)` sin afectar URL.

---

## F0.setup.T03 — Inicializar Convex + schema completo

### Objetivo

Instalar Convex en `packages/convex`, definir `schema.ts` con las 11 tablas del ARCH §6, y conectar dev deployment.

### Contexto

ARCH §6 detalla el schema completo con tipos Convex `v.*`, constraints, indexes. ADR-04 (snapshots), ADR-05 (paciente XOR nombre libre), ADR-06 (cédula normalizada).

### Alcance

Sí hace:
- `pnpm --filter convex add convex convex-helpers`.
- `packages/convex/convex.json` con paths.
- `packages/convex/schema.ts` con las 11 tablas: `laboratorio_config`, `pacientes`, `examenes_titulos`, `examenes`, `paquetes`, `paquetes_examenes`, `resultados`, `resultados_examenes`, `presupuestos`, `presupuestos_examenes`, `usuarios`, `tasa_cambio_bcv`, `audit_log`, `_migration_map` (14 tablas totales contando join + auxiliar).
- Todos los indexes documentados en ARCH §6.
- `npx convex dev` corre y crea deployment.
- Documentar `NEXT_PUBLIC_CONVEX_URL` y `CONVEX_DEPLOY_KEY` en `.env.example`.

No hace:
- Queries/mutations reales (packages posteriores).
- Auth (F0.auth).
- Seeds (post-migración).

### Criterios de aceptación

- [ ] `npx convex dev` conecta OK con deployment dev.
- [ ] `packages/convex/_generated/` se regenera automáticamente.
- [ ] Todas las tablas del ARCH §6 declaradas con tipos exactos.
- [ ] Todos los indexes declarados (`by_cedula`, `by_search_nombre`, `by_titulo`, `by_paciente`, `by_estado`, `by_fecha`, `by_email`, `by_wp`, etc.).
- [ ] `.env.example` documenta variables Convex.

### Archivos afectados

- `packages/convex/convex.json`
- `packages/convex/schema.ts`
- `packages/convex/package.json`
- `packages/convex/tsconfig.json`
- `.env.example`

### Dependencias

- F0.setup.T01

### Estimación

M (6h)

### Notas técnicas

- Índice único de `cedula`: Convex no tiene "unique" declarativo; se aplica vía check en la mutation (ver F2.pacientes.T02).
- `_migration_map` tiene índice `by_wp (wp_table, wp_id)` para idempotencia (ver F1.migracion).
- Tablas de Convex Auth (`authAccounts`, `authSessions`) se agregan cuando se instale Convex Auth (F0.auth).

---

## F0.setup.T04 — ESLint boundaries + Prettier + tsconfig paths

### Objetivo

Configurar ESLint con `eslint-plugin-import` y `no-restricted-paths` para enforce boundaries de ADR-08. Prettier compartido.

### Contexto

ARCH ADR-08: reglas de import por package. `packages/lib` es leaf (no importa de nadie); `apps/web` importa de todos; `packages/pdf`/`packages/ui`/`packages/convex` sólo importan de `packages/lib`.

### Alcance

Sí hace:
- Instalar ESLint 8 + `eslint-plugin-import` + `@typescript-eslint/parser`.
- `.eslintrc.cjs` root con `no-restricted-paths` implementando las reglas de ADR-08.
- Prettier config `.prettierrc` compartida.
- `.eslintignore`, `.prettierignore`.
- Configurar `tsconfig.base.json` con `paths` alias por workspace.
- Verificar con un import inválido de prueba (que falle build/lint).

No hace:
- Reglas de estilo más allá de default (`recommended` + `plugin:@typescript-eslint/recommended`).
- Import de reglas custom del equipo (no aplica en este proyecto).

### Criterios de aceptación

- [ ] `pnpm turbo run lint` pasa en repo limpio.
- [ ] Test negativo: import de `apps/web` desde `packages/lib` genera error de lint.
- [ ] Test negativo: import de `packages/convex` desde `packages/lib` genera error de lint.
- [ ] Prettier ejecuta y no rompe archivos existentes.

### Archivos afectados

- `.eslintrc.cjs`
- `.eslintignore`
- `.prettierrc`
- `.prettierignore`
- `tsconfig.base.json` (agregar paths)

### Dependencias

- F0.setup.T01
- F0.setup.T02
- F0.setup.T03

### Estimación

S (3h)

### Notas técnicas

`no-restricted-paths` requiere paths absolutos desde root; probar con un ejemplo real antes de commit.

---

## F0.setup.T05 — CI GitHub Actions (lint + typecheck + test)

### Objetivo

Pipeline de CI mínimo que corre en cada PR: install → lint → typecheck → test.

### Contexto

PRD §8 exige entregable estable Sem 1-3; CI previene regresiones desde el día 1.

### Alcance

Sí hace:
- `.github/workflows/ci.yml` con jobs: `lint`, `typecheck`, `test`, `build` (matrix Node 20).
- Cache de `pnpm store` para acelerar.
- `pnpm turbo run <cmd>` como comando de cada job.
- Badge de CI en README.

No hace:
- Deploy a Vercel (Vercel se conecta directo al repo).
- Deploy a Convex prod (manual desde CLI).
- E2E Playwright (fase posterior).

### Criterios de aceptación

- [ ] PR de prueba dispara CI y todos los jobs pasan.
- [ ] Cache pnpm reduce install a < 30s en runs consecutivos.
- [ ] Badge visible en README.

### Archivos afectados

- `.github/workflows/ci.yml`
- `README.md` (badge)

### Dependencias

- F0.setup.T01
- F0.setup.T04

### Estimación

S (2h)

### Notas técnicas

Turbo remote cache (Vercel) es opcional en v1 — dejar TODO comentado.

---

## F0.setup.T06 — Layout base apps/web (nav, theme, providers)

### Objetivo

Layout compartido `apps/web/app/(app)/layout.tsx` con navegación lateral, header con user, tema, y ConvexProvider wrapper.

### Contexto

ARCH §3: rutas bajo `(app)` (protegidas) usan un layout con nav. `(auth)` no.

### Alcance

Sí hace:
- `apps/web/app/(app)/layout.tsx` con sidebar + header.
- Sidebar con links a los 8 módulos (Dashboard, Pacientes, Exámenes, Paquetes, Resultados, Presupuestos, Config, Usuarios).
- Header con usuario logueado (placeholder — real en F0.auth.T*).
- `ConvexProvider` de `convex/react` envolviendo la app.
- Componentes `<Sidebar>`, `<Header>` en `packages/ui/nav/` reutilizables.
- Tema light (sin dark mode en v1, aunque shadcn lo soporta).
- Layout responsive hasta tablet 768px (PRD §4 NFR usabilidad).

No hace:
- Auth guard real (F0.auth.T*).
- Role guard (F0.auth.T*).
- Rutas de negocio (fases posteriores).

### Criterios de aceptación

- [ ] `/dashboard` muestra sidebar con 8 items + header.
- [ ] Sidebar colapsable a hamburguesa en < 768px.
- [ ] `ConvexProvider` envuelve toda la app; error clara si falta env var.
- [ ] Placeholder user en header (nombre + botón logout stub).

### Archivos afectados

- `apps/web/app/(app)/layout.tsx`
- `apps/web/components/providers.tsx`
- `packages/ui/nav/Sidebar.tsx`
- `packages/ui/nav/Header.tsx`
- `packages/ui/nav/index.ts`

### Dependencias

- F0.setup.T02
- F0.setup.T03

### Estimación

M (6h)

### Notas técnicas

Usar shadcn `Sidebar` (block) como base. `ConvexProvider` desde `convex/react`.

---

## F0.setup.T07 — Exponer PRD + ARCH + diagramas en orch dashboard

### Objetivo

Hacer que el PRD, el ARCH y los 6 diagramas HTML de arquitectura sean discoverables y navegables desde el orch dashboard (localhost:7420) con 1 click, sin que el equipo tenga que buscar paths bajo `docs/`.

### Contexto

F2 (ARCH) del pipeline `orch-plan` ya genera:
- **PRD**: `docs/prd/001-labsystem-v1.md`.
- **ARCH**: `docs/arch/001-labsystem-arch.md`.
- **Diagramas archify (6 HTMLs)**: `docs/arch/diagrams/*.html`.

Hoy están enterrados en `docs/` y nadie los abre. El orch dashboard (servido por `orch dashboard` en puerto 7420, configurado por `dashboard.yaml` en root — hoy sólo con secciones `kanban` y `tunnel`) es el punto de entrada natural del equipo: si los links están ahí, se leen; si no, se ignoran.

### Alcance

Sí hace:
- Investigar (spike corto) si `dashboard.yaml` soporta una sección custom tipo `docs:` / `links:` para listar rutas de documentación. Chequear `orch dashboard --help` y docs del paquete orch.
- Agregar sección/panel al dashboard que liste con links clickeables:
  - PRD (`docs/prd/001-labsystem-v1.md` — rendereado como HTML o servido raw).
  - ARCH (`docs/arch/001-labsystem-arch.md`).
  - Los 6 diagramas HTML de `docs/arch/diagrams/*.html` (idealmente vía auto-discovery con glob, para no hardcodear filenames que van a mutar).
- Si `dashboard.yaml` no soporta una sección de docs custom → fallback: generar `docs/index.html` estático (página simple con links a los 3 artefactos) y linkearlo desde el header/nav del dashboard vía template override o un único link "Docs".
- Empty state amigable: si un archivo aún no existe, el link muestra "pendiente" en vez de romper con 404.

No hace:
- No reescribir el dashboard ni tocar la lógica de kanban.
- No romper las secciones actuales de `dashboard.yaml` (`kanban`, `tunnel`).
- No convertir los `.md` a HTML si el dashboard puede servirlos raw / vía viewer nativo (evitar build step extra).
- No crear un doc site full (Docusaurus/Nextra) — es un panel de links, no un portal.

### Criterios de aceptación

- [ ] Desde el dashboard (`http://localhost:7420`) se accede al PRD con 1 click.
- [ ] Desde el dashboard se accede al ARCH con 1 click.
- [ ] Los 6 diagramas HTML de `docs/arch/diagrams/` son navegables desde el dashboard (cada uno con su link o un índice).
- [ ] Si un archivo linkeado aún no existe, el dashboard muestra empty state amigable (no 500 ni 404 crudo).
- [ ] `kanban` y `tunnel` de `dashboard.yaml` siguen funcionando igual que antes del cambio.
- [ ] Decisión documentada en el PR: "docs custom en `dashboard.yaml`" vs "fallback `docs/index.html`", con el porqué.

### Archivos afectados

- `dashboard.yaml` (extensión con sección de docs, si el schema lo soporta).
- `docs/index.html` (fallback: página HTML estática con links, si `dashboard.yaml` no soporta docs custom).
- Posibles archivos de template override del orch dashboard (a determinar en el spike — TBD según lo que ofrezca orch).

### Dependencias

- F0.setup.T01 (monorepo/scaffold básico debe existir para tener `docs/` bajo control de versiones).

No depende de fases F2/ARCH: los diagramas ya se generan en la fase ARCH del pipeline `orch-plan`, fuera del scope de estas specs de implementación.

### Estimación

- S (2-4h) si `dashboard.yaml` soporta una sección de docs/links custom out-of-the-box.
- M (4-8h) si hay que hacer template override o servir un `docs/index.html` embebido/linkeado aparte.

### Notas técnicas

- Confirmar en `orch dashboard --help` (o en el README del paquete orch) si existe convención para "custom links / docs panel". Si existe, usar eso — no reinventar.
- Fallback simple: `docs/index.html` estático servido bajo `docs/` con `<ul>` de links; el dashboard sólo agrega un link "Docs" que apunta ahí. Sin build step, sin dependencias.
- Auto-discovery de `docs/arch/diagrams/*.html` (glob) es preferible a hardcodear filenames — los diagramas se regeneran y renombran cuando el ARCH evoluciona.
- Chequear si `dashboard.yaml` ya tiene alguna clave tipo `links:`, `panels:`, `sidebar:` antes de proponer schema nuevo.
