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

## Estructura del monorepo

La topología de paquetes está fijada en ARCH ADR-08:

- `apps/web` puede importar de `packages/*`.
- `packages/pdf`, `packages/ui` y `packages/convex` pueden importar de `packages/lib`.
- `packages/lib` no importa de nadie (leaf package).

El enforcement de fronteras se configura en F0.setup.T04 (ESLint `no-restricted-paths`).
