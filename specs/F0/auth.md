---
type: spec
phase: F0
package: auth
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - S5.convex-auth-prod
blocks:
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
generated_by: orch-spec
generated_at: 2026-08-23
title: "F0.auth — Convex Auth + RBAC (Admin/Operador)"
---

# F0 · Auth y RBAC

Auth fundacional con Convex Auth (Password provider) + roles Admin/Operador + middleware Next.js + audit log de login. Todo el resto de packages depende de que las mutations tengan `requireRole` disponible.

## Referencias

- **PRD**: §4 F9 (auth y roles), §5 (stack: Convex Auth).
- **ARCH**: ADR-03 (Convex Auth nativo con Plan B Clerk), §5.1 (contratos), §7.2 (RBAC).
- **Spike**: S5.convex-auth-prod (debe estar resuelto — decisión Convex Auth vs Clerk).

**Nota:** Este spec asume decisión de S5 = "Convex Auth". Si S5 concluye "Clerk", este spec se reescribe reemplazando ADR-03.

---

## F0.auth.T01 — Instalar Convex Auth con Password provider

### Objetivo

Wiring inicial de Convex Auth con provider Password, configuración de sesión 8h, integración con Next.js App Router.

### Contexto

ARCH ADR-03. S5 confirma que Convex Auth cubre el caso. Sesión duración 8h (config `session.durationMs`).

### Alcance

Sí hace:
- Instalar `@convex-dev/auth`.
- `packages/convex/auth.ts` con provider `Password`, `session.durationMs: 8 * 60 * 60 * 1000`.
- `packages/convex/auth.config.ts` con providers registrados.
- Schema Convex: agregar tablas de Convex Auth (`authAccounts`, `authSessions`, `authRateLimits` — auto declaradas por `authTables`).
- `apps/web/app/providers.tsx` con `ConvexAuthNextjsProvider`.
- Env vars documentadas.

No hace:
- UI de login (T02).
- Rol/RBAC (T04).
- Password reset (T06).
- Invitaciones (T07).

### Criterios de aceptación

- [ ] `npx convex dev` regenera types incluyendo `api.auth.*`.
- [ ] Auth tables presentes en Convex dashboard.
- [ ] `useAuthActions()` disponible en cliente.
- [ ] Session cookie httpOnly + secure + sameSite=lax verificada en devtools.

### Archivos afectados

- `packages/convex/auth.ts`
- `packages/convex/auth.config.ts`
- `packages/convex/schema.ts` (extender con `authTables`)
- `apps/web/app/providers.tsx`
- `.env.example`

### Dependencias

- F0.setup.T03
- S5.convex-auth-prod (resuelto)

### Estimación

M (4h)

### Notas técnicas

`@convex-dev/auth` exporta `authTables` helper; se hace spread en el schema.

---

## F0.auth.T02 — UI login (email + password)

### Objetivo

Página `/login` con form email + password conectado a Convex Auth `signIn`.

### Contexto

PRD §4 F9. Ruta `apps/web/app/(auth)/login/page.tsx` (existente stub de F0.setup.T02).

### Alcance

Sí hace:
- Form shadcn con email + password + botón "Entrar".
- Validación cliente (email format, password no vacío).
- `useAuthActions().signIn("password", { email, password, flow: "signIn" })`.
- Redirección a `/dashboard` post-login exitoso.
- Manejo de error: credenciales inválidas → toast rojo.
- Loading state en botón.

No hace:
- Signup público (Admin crea usuarios vía invitación — T07).
- "Recordarme" (usar duración de sesión fija).
- OAuth (fuera de v1).

### Criterios de aceptación

- [ ] Login con credenciales válidas redirige a `/dashboard`.
- [ ] Login con credenciales inválidas muestra error visible.
- [ ] Botón deshabilitado durante request.
- [ ] Enter en input dispara submit.

### Archivos afectados

- `apps/web/app/(auth)/login/page.tsx`
- `apps/web/app/(auth)/login/LoginForm.tsx` (client)
- `apps/web/app/(auth)/layout.tsx`

### Dependencias

- F0.auth.T01

### Estimación

S (3h)

### Notas técnicas

`use client` en form. Server component en `page.tsx`.

---

## F0.auth.T03 — Middleware Next.js (auth guard + role guard)

### Objetivo

`middleware.ts` que protege `/((app))` con guard de sesión y `/config` + `/examenes` con guard de rol Admin.

### Contexto

ARCH ADR-03 y §7.2. Middleware es coarse-grained; fine-grained se hace en mutations con `requireRole`.

### Alcance

Sí hace:
- `apps/web/middleware.ts` usando `@convex-dev/auth/nextjs/server`.
- Redirige a `/login` si no hay sesión y ruta bajo `(app)`.
- Bloquea acceso a `/config/*` y `/examenes/*` si `role !== "admin"` (redirect a `/dashboard` con toast "sin permisos").
- Redirige a `/dashboard` si usuario autenticado accede a `/login`.
- Config `matcher` correcto (excluye `/api/pdf/*` que valida internamente).

No hace:
- Validar rol dentro de cada mutation (eso hace F0.auth.T04 `requireRole`).

### Criterios de aceptación

- [ ] Sin sesión, acceso a `/dashboard` redirige a `/login`.
- [ ] Con sesión Operador, acceso a `/config` redirige a `/dashboard`.
- [ ] Con sesión Operador, acceso a `/examenes` redirige a `/dashboard`.
- [ ] Con sesión Admin, acceso a `/config` funciona.
- [ ] Con sesión activa, acceso a `/login` redirige a `/dashboard`.

### Archivos afectados

- `apps/web/middleware.ts`

### Dependencias

- F0.auth.T01
- F0.auth.T04 (para leer rol; puede coordinarse)

### Estimación

S (3h)

### Notas técnicas

El rol se lee de la tabla `usuarios` — el middleware debe llamar una query de Convex server-side (`fetchQuery`) o usar un claim en el token. Definir en implementación cuál es más limpio.

---

## F0.auth.T04 — Tabla `usuarios` + helper `requireRole`

### Objetivo

Tabla `usuarios` (perfil de dominio con `role`) sincronizada con Convex Auth. Helper `requireRole(ctx, "admin" | "operador")` que valida en queries/mutations.

### Contexto

ARCH §6 (tabla `usuarios`), ARCH §7.2 (RBAC).

### Alcance

Sí hace:
- Trigger/hook post-signup que crea/actualiza fila en `usuarios` con `role` default `"operador"`.
- Helper `packages/convex/helpers/auth.ts`:
  - `getCurrentUser(ctx)`: retorna `{ _id, email, role }` o lanza `UNAUTHENTICATED`.
  - `requireRole(ctx, role)`: valida y lanza `UNAUTHORIZED` si no matchea.
- Query `usuarios.me()` para el frontend (header user).
- Query `usuarios.list()` (Admin only) para gestión.
- Mutation `usuarios.updateRole({ userId, role })` (Admin only).

No hace:
- UI de gestión de usuarios (fuera de scope v1 — se manejará desde Convex dashboard o script one-shot).
- Invitaciones (T07).

### Criterios de aceptación

- [ ] Al crear usuario, aparece fila en `usuarios` con role default.
- [ ] Query `usuarios.me()` retorna user actual con `role`.
- [ ] `requireRole(ctx, "admin")` lanza error si user es operador.
- [ ] Index `by_email` funcional.

### Archivos afectados

- `packages/convex/usuarios.ts`
- `packages/convex/helpers/auth.ts`
- `packages/convex/auth.ts` (hook post-signup)

### Dependencias

- F0.auth.T01

### Estimación

M (4h)

### Notas técnicas

Convex Auth expone `afterUserCreatedOrUpdated` hook (o equivalente según versión). Usar para poblar `usuarios`.

---

## F0.auth.T05 — Audit log de auth (login, logout, fail)

### Objetivo

Registrar eventos de auth en la tabla `audit_log` (ARCH §6, §7.3).

### Contexto

PRD §4 NFR seguridad; ARCH observabilidad.

### Alcance

Sí hace:
- Hook post-signin exitoso → insert `audit_log` con `accion: "auth.login"`, `usuario_id`, `metadata: { ip?, user_agent? }`.
- Hook post-signout → `auth.logout`.
- Registro de fallos de login → `auth.login_failed` con `metadata: { email_intent }`.
- Rate limit lógico: si un email tiene > 5 `login_failed` en 15min, bloquear con error genérico ("credenciales inválidas").

No hace:
- Dashboard de audit log (fase posterior).
- Alertas por email en abusos.

### Criterios de aceptación

- [ ] Login exitoso genera fila `audit_log`.
- [ ] Login fallido genera fila `audit_log`.
- [ ] 6to intento fallido en 15min es bloqueado.
- [ ] Bloqueo se resetea después de 15min.

### Archivos afectados

- `packages/convex/auth.ts` (hooks)
- `packages/convex/audit.ts` (helper `logAudit`)

### Dependencias

- F0.auth.T01
- F0.auth.T04

### Estimación

S (3h)

### Notas técnicas

Rate limit se puede implementar con la tabla `authRateLimits` de Convex Auth (built-in) o con `login_attempts` custom. Preferir built-in si está disponible.

---

## F0.auth.T06 — Password reset (endpoint + email + form)

### Objetivo

Flujo de recuperación de contraseña: request → email con token → form nuevo password.

### Contexto

S5 detecta que Convex Auth no lo trae out-of-the-box; hay que implementarlo. ADR-03.

### Alcance

Sí hace:
- Tabla `password_reset_tokens` (`{ user_id, token_hash, expires_at, used }`) — agregar a schema.
- Convex action `auth.requestPasswordReset({ email })` que genera token, guarda hash, envía email.
- Página `/forgot-password` con form email.
- Página `/reset-password?token=...` con form nuevo password.
- Mutation `auth.completePasswordReset({ token, newPassword })` que valida token, cambia password vía Convex Auth API, marca token como usado.
- TTL token: 1h.

No hace:
- Servicio de email real integrado (usar Resend/SendGrid o stub console.log — decidir en implementación).
- MFA/2FA.

### Criterios de aceptación

- [ ] Request de reset con email válido envía email (o loguea en console en dev).
- [ ] Token expirado (>1h) rechaza reset.
- [ ] Token ya usado rechaza reset.
- [ ] Nuevo password permite login.
- [ ] Email inexistente no revela información (responde OK igual — anti enumeración).

### Archivos afectados

- `packages/convex/schema.ts` (tabla `password_reset_tokens`)
- `packages/convex/auth.ts` (action + mutation)
- `apps/web/app/(auth)/forgot-password/page.tsx`
- `apps/web/app/(auth)/reset-password/page.tsx`

### Dependencias

- F0.auth.T01
- F0.auth.T04

### Estimación

M (6h)

### Notas técnicas

Email provider: definir en implementación (Resend recomendado por integración simple). En dev, stub `console.log(link)` es aceptable.

---

## F0.auth.T07 — Invitación de usuarios (Admin only)

### Objetivo

Admin puede invitar nuevos usuarios (Admin u Operador) por email con token; el invitado elige su password.

### Contexto

S5 gap. ARCH ADR-03. La creación pública está deshabilitada; sólo por invitación.

### Alcance

Sí hace:
- Tabla `user_invitations` (`{ email, role, token_hash, invited_by, expires_at, accepted }`).
- Mutation `usuarios.invite({ email, role })` (Admin only) → genera token → envía email.
- Página `/accept-invite?token=...` con form (password + confirm).
- Mutation `usuarios.acceptInvite({ token, password })` que crea el usuario Convex Auth + fila `usuarios` con role, marca invite aceptado.
- UI mínima en `/config` (o `/usuarios`) con lista de pendientes + botón "Invitar".
- TTL invite: 7 días.

No hace:
- Gestión avanzada (revocar, re-invitar, cambiar rol post-alta) — se maneja desde Convex dashboard v1 si es necesario.

### Criterios de aceptación

- [ ] Admin puede invitar; Operador no ve el botón.
- [ ] Email de invitación se envía (o loguea en dev).
- [ ] Aceptar invite crea user con rol correcto.
- [ ] Token expirado rechaza.

### Archivos afectados

- `packages/convex/schema.ts` (tabla `user_invitations`)
- `packages/convex/usuarios.ts` (invite + accept)
- `apps/web/app/(auth)/accept-invite/page.tsx`
- `apps/web/app/(app)/config/InviteUserDialog.tsx` (UI Admin)

### Dependencias

- F0.auth.T04
- F0.auth.T06 (email infra reusable)

### Estimación

M (6h)

### Notas técnicas

Reusar helper de email de T06. La UI de invitación puede vivir dentro de F1.config para no crear un módulo `/usuarios` separado en v1.
