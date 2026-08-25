---
type: spec
phase: F5
package: hardening
project_id: labo-system
version: 0.1
depends_on:
  - F4.hardening
  - F4.cutover
generated_by: orch-spec
generated_at: 2026-08-25
title: "F5.hardening — Post-Migration Cleanup & Hardening"
---

# F5 · Post-Migration Cleanup & Hardening

Refinamiento quirúrgico post-migración: normalización de cédulas venezolanas de 9 dígitos, purga total de residuos Convex, corrección de errores de Typecheck en monorepo, y conexión de sesión real InsForge `/api/me` en AppLayout y Header.

---

## F5.hardening.T01 — Fix regex de cédula venezolana (soporte 9 dígitos)

### Objetivo

Corregir la expresión regular `CEDULA_RE` en `packages/lib/cedula.ts` para aceptar cédulas de 5 a 9 dígitos numéricos. Actualmente la regex utiliza `\d{5,8}`, lo cual hace fallar las validaciones y normalizaciones de cédulas venezolanas legítimas de 9 dígitos (como `V-123456789`).

### Alcance

Sí hace:
- Actualizar `CEDULA_RE` en `packages/lib/cedula.ts` a `/^([VEJGP]?)[-\s.]*(\d{5,9})$/i`.
- Verificar y ejecutar la suite `packages/lib/cedula.test.ts` con Vitest.
- Asegurar que `normalizeCedula("V-123456789")` devuelva `"V-123456789"`.
- Asegurar que cédulas de más de 9 dígitos (ej. 10 dígitos `V-1234567890`) sigan retornando `null`.

### Criterios de aceptación

- [ ] `CEDULA_RE` en `packages/lib/cedula.ts` acepta entre 5 y 9 dígitos.
- [ ] `normalizeCedula("V-123456789")` devuelve `"V-123456789"`.
- [ ] `normalizeCedula("V-1234567890")` devuelve `null`.
- [ ] Suite de tests `pnpm --filter @labo/lib test` pasa 100% en verde.

### Archivos afectados

- `packages/lib/cedula.ts`
- `packages/lib/cedula.test.ts`

### Dependencias

- Ninguna

### Estimación

0.5h

---

## F5.hardening.T02 — Purga total de residuos Convex en configs y workspace

### Objetivo

Eliminar completamente todas las dependencias, archivos remanentes y referencias a Convex tras la migración arquitectural a InsForge y PostgreSQL (ADR-11).

### Alcance

Sí hace:
- Remover `@convex-dev/auth` y `convex` de `apps/web/package.json`.
- Remover `"@labo/convex"` de `transpilePackages` en `apps/web/next.config.mjs`.
- Remover alias `@labo/convex` y `@labo/convex/*` de `tsconfig.base.json`.
- Limpiar `apps/web/playwright.config.ts` eliminando la variable dummy y comentarios sobre `NEXT_PUBLIC_CONVEX_URL`.
- Eliminar o desvincular el paquete legado `packages/convex/` y `packages/pdf/src/convexServerClient.ts`.
- Limpiar el endpoint legacy `apps/web/app/api/pdf/route.ts` (spike S3) para no importar `convex/server` ni `@labo/pdf/convexServerClient`.
- Refactorizar `apps/web/components/providers.tsx` para no importar `ConvexProvider` ni `ConvexReactClient` (passthrough limpio de providers o cliente InsForge).
- Ejecutar `pnpm install` para sincronizar `pnpm-lock.yaml`.

### Criterios de aceptación

- [ ] `apps/web/package.json` no contiene `convex` ni `@convex-dev/auth`.
- [ ] `apps/web/next.config.mjs` no contiene `@labo/convex`.
- [ ] `tsconfig.base.json` no contiene referencias a `@labo/convex`.
- [ ] `apps/web/components/providers.tsx` renderiza sin requerir `NEXT_PUBLIC_CONVEX_URL`.
- [ ] No quedan imports de `convex` en el runtime de `apps/web` ni `packages/pdf`.
- [ ] `pnpm install` ejecuta limpiamente.

### Archivos afectados

- `apps/web/package.json`
- `apps/web/next.config.mjs`
- `tsconfig.base.json`
- `apps/web/playwright.config.ts`
- `packages/pdf/src/convexServerClient.ts`
- `apps/web/app/api/pdf/route.ts`
- `apps/web/components/providers.tsx`

### Dependencias

- Ninguna

### Estimación

1.5h

---

## F5.hardening.T03 — Arreglo de Typecheck en monorepo

### Objetivo

Resolver todos los errores de TypeScript en monorepo (`tsc --noEmit`), garantizando tipado estricto y limpio en `@labo/db`, `@labo/web` y packages asociados.

### Alcance

Sí hace:
- Corregir el tipado de `CustomTooltip` en `apps/web/app/(app)/dashboard/ResultadosChart.tsx` compatible con Recharts.
- Corregir el tipado del retorno de `renderToStream` en `apps/web/app/api/pdf/presupuesto/[id]/route.ts` y `apps/web/app/api/pdf/resultado/[id]/route.ts`.
- Resolver la incompatibilidad de tipos `Record<string, unknown>` vs `JSONValue` en el metadata de audit log en `packages/db/repos/presupuestos.ts`.
- Limpiar variables no usadas (`sql` en `packages/db/repos/dashboard.integration.test.ts`, `email` en `apps/web/app/api/usuarios/invite/route.ts`).
- Asegurar que `packages/pdf` resuelva correctamente los tipos de `@react-pdf/renderer`.

### Criterios de aceptación

- [ ] `pnpm --filter @labo/db typecheck` pasa en verde (0 errores).
- [ ] `pnpm --filter @labo/web typecheck` pasa en verde (0 errores).
- [ ] `pnpm run typecheck` en la raíz pasa exitosamente para todos los workspaces.

### Archivos afectados

- `apps/web/app/(app)/dashboard/ResultadosChart.tsx`
- `apps/web/app/api/pdf/presupuesto/[id]/route.ts`
- `apps/web/app/api/pdf/resultado/[id]/route.ts`
- `packages/db/repos/presupuestos.ts`
- `packages/db/repos/dashboard.integration.test.ts`
- `apps/web/app/api/usuarios/invite/route.ts`

### Dependencias

- F5.1.T1
- F5.1.T2

### Estimación

1.5h

---

## F5.hardening.T04 — Conectar sesión real (/api/me) y logout en Header y AppLayout

### Objetivo

Conectar `apps/web/app/(app)/layout.tsx` y el componente `Header` a la sesión de usuario real autenticado mediante `/api/me` con flujo de logout funcional.

### Alcance

Sí hace:
- Reemplazar `PLACEHOLDER_USER` ("Dr. Placeholder") en `apps/web/app/(app)/layout.tsx` con la información del usuario autenticado obtenido desde `GET /api/me`.
- Mostrar iniciales, nombre y email del usuario real en el `Header`.
- Implementar `handleLogout` real invocando `DELETE /api/me` y redirigiendo al usuario a `/login` al completar.
- Manejar estados de carga (skeleton / loading indicator en Header) y redirección a `/login` si `/api/me` responde 401.

### Criterios de aceptación

- [ ] `AppLayout` consume los datos reales del usuario logueado vía `/api/me`.
- [ ] El `Header` muestra el nombre, email e inicial correctos del usuario autenticado.
- [ ] El botón "Cerrar sesión" en el Header ejecuta `DELETE /api/me`, limpia sesión y redirige a `/login`.
- [ ] Si la sesión expira o es inválida, se redirige inmediatamente a `/login`.

### Archivos afectados

- `apps/web/app/(app)/layout.tsx`
- `apps/web/app/api/me/route.ts`
- `packages/ui/nav/Header.tsx`

### Dependencias

- F5.1.T2
- F5.1.T3

### Estimación

2h
