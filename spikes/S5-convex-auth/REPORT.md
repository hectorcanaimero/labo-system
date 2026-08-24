# S5 · Convex Auth vs Clerk (Trade-offs & Decisión)

## Resumen Ejecutivo

Hemos evaluado **Convex Auth** (provider `Password`) contra los requisitos de producción especificados en el PRD. La conclusión es **muy favorable para Convex Auth**: casi todos los supuestos "gaps" están resueltos de forma **nativa** por la librería y no requieren desarrollo custom complejo.

**Recomendación:** Mantener **Convex Auth** como la solución de autenticación principal (ADR-03). No es necesario pagar el costo mensual ni la complejidad arquitectónica de integrar Clerk.

## Análisis de los 5 "Gaps" (Diseño y Estimación)

### 1. Password Reset (Recuperación de contraseña)
- **Supuesto Gap:** Necesidad de endpoints custom, tabla `password_reset_tokens` y envío de emails.
- **Realidad (Convex Auth Nativo):** La librería soporta nativamente el flujo `"reset"` y `"reset-verification"`. Al invocar `signIn("password", { email, flow: "reset" })`, Convex Auth genera un código seguro, lo guarda en su tabla interna `authVerificationCodes` y llama a la configuración `reset` del provider para enviar el email (ej. usando Resend).
- **Diseño Técnico:** 
  1. Instalar `@auth/core` y usar el provider de `Resend`.
  2. Configurar `Password({ reset: Resend({ apiKey: ... }) })`.
  3. UI de reset invoca a `signIn` con `flow: "reset"` y luego `flow: "reset-verification"`.
- **Estimación:** 2h (principalmente armar la UI y el template de email).

### 2. Invitación de usuarios nuevos por Admin
- **Supuesto Gap:** Flujo custom de invitación (Admin genera token, usuario elige password).
- **Diseño Técnico:** Como Convex Auth gestiona las identidades en la tabla `users` y asocia cuentas en `authAccounts`, el flujo más limpio es:
  1. Admin crea el registro del usuario (mutación custom).
  2. El sistema dispara automáticamente un flujo de "Password Reset" para ese email (usando una acción interna o llamando a la misma API que el reset).
  3. El usuario recibe un email con un link mágico / código OTP.
  4. El usuario ingresa a la app, establece su contraseña mediante `flow: "reset-verification"`.
- **Estimación:** 4h (mutación del admin + email de bienvenida que incluye el OTP de reset).

### 3. Rate limiting en login
- **Supuesto Gap:** Prevenir ataques de fuerza bruta (5 intentos / 15 min), requiriendo tabla `login_attempts`.
- **Realidad (Convex Auth Nativo):** Tiene rate limiting *built-in* usando la tabla `authRateLimits`.
- **Diseño Técnico:** 
  1. Configurar `signIn: { maxFailedAttempsPerHour: 20 }` en `convex/auth.ts`. (20 por hora equivale de forma móvil a ~5 por cada 15 min).
- **Estimación:** 0.5h (solo configuración y testeo del bloqueo).

### 4. Expiración de Sesión (8h)
- **Supuesto Gap:** Manejo custom de expiración/refresh de sesión.
- **Realidad (Convex Auth Nativo):** La librería soporta configuración directa de la duración de sesión y maneja el refresh automáticamente.
- **Diseño Técnico:**
  1. Configurar en `convex/auth.ts`: 
     ```ts
     session: { 
       totalDurationMs: 8 * 60 * 60 * 1000, 
       inactiveDurationMs: 8 * 60 * 60 * 1000 
     }
     ```
- **Estimación:** 0.5h (configuración y testeo manual).

### 5. Auditoría de accesos (Audit log)
- **Supuesto Gap:** Registrar login/logout en una tabla `audit_logs`.
- **Diseño Técnico:** 
  - **Login:** Usar el callback nativo `beforeSessionCreation` en `convexAuth` para escribir en la tabla `audit_logs` (vía mutación interna o directo si el contexto lo permite).
  - **Logout:** El cliente invoca un `action` custom llamado `signOutWithAudit` que:
    1. Obtiene el usuario actual (`ctx.auth.getUserIdentity()`).
    2. Ejecuta una mutación interna para escribir `accion: "auth.logout"`.
    3. Invoca la mutación interna original de Convex Auth (`api.auth.store`, `{ type: "signOut" }`) para invalidar la sesión.
- **Estimación:** 3h (creación de tabla `audit_logs` y callbacks de auth).

## Comparativa: Convex Auth vs Clerk

| Criterio | Convex Auth | Clerk |
| :--- | :--- | :--- |
| **Costo** | $0 (Open Source, integrado en el backend) | Pago por MAU (Monthly Active Users). A partir de cierto volumen, el pricing sube rápido. |
| **Complejidad Arquitectónica** | Baja. Todo vive en la misma base de datos (relaciones síncronas y ACID con `users`). | Alta. Requiere sincronizar webhooks hacia Convex, manejar un Gateway/Bridge de JWT. |
| **Gaps a cubrir** | ~10 horas de desarrollo (UI de reset, mutación de invitación, tablas de auditoría). | Menos horas (la UI de Clerk ya incluye reset y rate limits visuales), pero requiere configurar Webhooks y JWT templates. |
| **UX** | 100% white-label y personalizable (UI propia). | Componentes prearmados (rápidos pero menos personalizables sin esfuerzo extra). |
| **Rendimiento** | Latencia nula (auth y DB en el mismo edge). | Round-trip al servidor de Clerk para validación de sesión o keys. |

## Decisión Firmada
✅ **Convex Auth + custom gaps**

El costo de desarrollar los "gaps" (que en realidad son mayormente UI sobre funciones nativas de Convex Auth) es de apenas ~10 horas. Es una inversión de una sola vez que nos salva del vendor lock-in, simplifica la arquitectura (sin webhooks de sync) y reduce costos operativos a 0.

---

## Lista de Tareas para F0.auth (Actualizada)

Al momento de ejecutar `F0.auth`, estas son las tareas a implementar:

- [ ] **T1. Setup Base Convex Auth:** Instalar `@convex-dev/auth`, configurar `Password` provider y tabla `users` extendida (roles Admin/Operador).
- [ ] **T2. Rate Limits y Sesión:** Configurar `maxFailedAttempsPerHour: 20` y `session.totalDurationMs: 28800000` (8 horas) en `auth.ts`.
- [ ] **T3. Integración Email (Resend):** Configurar el provider `Resend` dentro del provider `Password({ reset: Resend(...) })` para soportar envío de códigos OTP / Magic Links de reset.
- [ ] **T4. UI - Login y Reset:** Implementar las pantallas de Login (`/login`) y Recuperación de Contraseña (`/reset`), consumiendo el método `signIn("password", ...)` con flujos `"signIn"`, `"reset"`, y `"reset-verification"`.
- [ ] **T5. Flujo de Invitación Admin:** Crear la mutación para que un Admin dé de alta a un usuario (`db.insert("users", ...)`), y posteriormente dispare el envío de correo de "Bienvenida/Setear Contraseña" aprovechando la lógica del flujo de reset.
- [ ] **T6. Audit Logs:** Crear tabla `audit_logs`. Implementar el callback `beforeSessionCreation` en `auth.ts` para registrar los logins. Crear un action custom `signOutAndAudit` para registrar los logouts.
