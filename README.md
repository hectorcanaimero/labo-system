# LabSystem

![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)

Monorepo de administración de laboratorio clínico.

## Stack

- **Node:** 20 LTS
- **Package manager:** pnpm 9.x
- **Monorepo:** Turborepo 2.x
- **Frontend:** Next.js 14 App Router (`apps/web`)
- **Backend:** Convex (`packages/convex`)
- **UI:** shadcn/ui + Tailwind (`packages/ui`)
- **Shared:** utilidades, schemas y helpers (`packages/lib`)
- **PDF:** templates con `@react-pdf/renderer` (`packages/pdf`)

## Workspaces

```
apps/
  web/                 → Next.js 14 App Router
packages/
  convex/              → schema, queries, mutations, actions
  ui/                  → componentes compartidos
  lib/                 → utilidades, schemas Zod, helpers (leaf)
  pdf/                 → templates PDF
```

## Comandos base

```bash
# Instalar dependencias
pnpm install

# Levantar entorno de desarrollo
pnpm dev

# Build de producción
pnpm build

# Lint
pnpm lint

# Typecheck
pnpm typecheck

# Tests
pnpm test
```

## Flujo de deployment (Staging → Production)

El repositorio usa un flujo de dos ambientes con branch protection:

### Branch Strategy

- **`staged`** (default branch) → ambiente de staging
- **`main`** → ambiente de producción

### Workflow

1. **Desarrollo:** Crear feature branch desde `staged`
   ```bash
   git checkout staged
   git pull
   git checkout -b feature/nueva-funcionalidad
   ```

2. **PR a Staging:** Abrir PR hacia `staged` (default)
   - CI/E2E corren automáticamente
   - Merge cuando esté listo

3. **Deploy a Staging:** Al hacer merge a `staged`
   - Deploy automático a ambiente de staging vía Coolify
   - Testing y validación en staging

4. **Promoción a Producción:** Cuando staging está validado
   ```bash
   # Abrir PR de staged → main
   gh pr create --base main --head staged --title "Release: [descripción]"
   ```
   - Branch protection en `main` requiere:
     - ✅ CI checks (lint, typecheck, test, build)
     - ✅ Solo PRs desde `staged`
   - Merge a `main` → deploy automático a producción

### Configuración de Coolify

**Staging Environment:**
- Branch: `staged`
- Environment: `staging`
- URL: [configurar en Coolify]

**Production Environment:**
- Branch: `main`
- Environment: `production`
- URL: [configurar en Coolify]

Ver `.coolify` para configuración actual.

## Estructura del monorepo

La topología de paquetes está fijada en ARCH ADR-08:

- `apps/web` puede importar de `packages/*`.
- `packages/pdf`, `packages/ui` y `packages/convex` pueden importar de `packages/lib`.
- `packages/lib` no importa de nadie (leaf package).

El enforcement de fronteras se configura en F0.setup.T04 (ESLint `no-restricted-paths`).
