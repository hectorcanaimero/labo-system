---
type: spec
phase: F6
package: core
project_id: labo-system
version: 0.1
depends_on:
  - F5.hardening
blocks:
  - F6.pipeline
generated_by: orch-spec
generated_at: 2026-08-25
title: "F6.core — UX Refinements, Auth Polish & Patient Clinical Rules"
---

# F6.1 · Core Refinements (Auth Polish & Pacientes Clinical Rules)

Refinamientos críticos de UX, autenticación y reglas clínicas de pacientes:
1. Mover la ruta de login a la raíz `/` con redirect permanente 308 desde `/login`.
2. Actualización de navegación cliente, handlers 401 y suite E2E de Playwright apuntando a `/`.
3. Password recovery hardening con InsForge Auth + Resend SMTP y soporte en mock local E2E.
4. Módulo Pacientes Core: constraint DDL de `sexo NOT NULL`, esquemas Zod con validación obligatoria y función unificada de edad con desglose pediátrico (años, meses, días y etapa clínica).
5. Módulo Pacientes UI: reactividad en tiempo real al ingresar la fecha de nacimiento (`watch("fecha_nacimiento")`), badge dinámico con desglose y etapa clínica pediátrica/adulta, y selector de sexo obligatorio.

---

## F6.1.T1 — Mover /login a la raíz / en Next.js App Router

### Objetivo

Mover la pantalla de autenticación a la ruta raíz `/` de Next.js App Router (`apps/web/app/(auth)/page.tsx`), eliminando la duplicación con `/login`, configurando un redirect permanente 308 de `/login` a `/`, y actualizando `middleware.ts` y server auth guards.

### Alcance

Sí hace:
- Mover `apps/web/app/(auth)/login/page.tsx` a `apps/web/app/(auth)/page.tsx`.
- Configurar redirect 308 permanente en `apps/web/next.config.mjs` para que solicitudes a `/login` redirijan inmediatamente a `/`.
- Actualizar `apps/web/middleware.ts` para que la ruta pública base de login sea `/` y redirigir usuarios no autenticados a `/`.
- Actualizar guards en `apps/web/app/(app)/layout.tsx` y Server Components para redirigir a `/` si no hay sesión válida.
- Si un usuario autenticado visita `/`, redirigir automáticamente a `/dashboard`.

No hace:
- Actualización de suite Playwright E2E (asignado a F6.1.T2).
- Password recovery email logic (asignado a F6.1.T3).

### Criterios de aceptación

- [ ] `GET /` renderiza directamente la interfaz de login cuando no existe sesión.
- [ ] `GET /login` responde con redirect permanente HTTP 308 hacia `/`.
- [ ] Acceso no autenticado a cualquier ruta protegida `/(app)/*` redirige a `/`.
- [ ] Usuario con sesión activa en `/` es redirigido a `/dashboard`.

### Archivos afectados

- `apps/web/app/(auth)/page.tsx`
- `apps/web/app/(auth)/login/page.tsx`
- `apps/web/next.config.mjs`
- `apps/web/middleware.ts`
- `apps/web/app/(app)/layout.tsx`

### Dependencias

- F5.1.T4

### Estimación

1.5h

---

## F6.1.T2 — Actualizar enlaces cliente, manejo 401 y suite E2E Playwright hacia /

### Objetivo

Actualizar todas las referencias de navegación cliente, manejo de errores 401 en `@labo/lib/error-messages`, componentes `Header` y `ExportButton`, y adaptar la suite de pruebas E2E de Playwright apuntando a la nueva ruta raíz `/`.

### Alcance

Sí hace:
- Actualizar constantes y utilidades en `packages/lib/error-messages.ts` cambiando `/login` por `/`.
- Actualizar el flujo de logout en `packages/ui/nav/Header.tsx` para redirigir a `/`.
- Actualizar `ExportButton.tsx` y manejadores de respuestas 401 en fetchers cliente para redirigir a `/`.
- Actualizar helpers de pruebas E2E en `apps/web/e2e/helpers.ts` (`loginAs`, `gotoLogin`, etc.) y `apps/web/playwright.config.ts`.
- Actualizar specs de Playwright (`apps/web/e2e/auth.spec.ts`, `apps/web/e2e/paciente.spec.ts`, `apps/web/e2e/presupuesto.spec.ts`, `apps/web/e2e/resultado.spec.ts`).

No hace:
- Modificación del middleware o routing Next.js (F6.1.T1).

### Criterios de aceptación

- [ ] `Header.tsx` ejecuta logout y redirige limpiamente a `/`.
- [ ] Helpers E2E de Playwright apuntan a `/` y la suite `pnpm --filter @labo/web test:e2e` pasa en verde.
- [ ] Manejadores de error 401 cliente redirigen a `/` sin errores ni loops.
- [ ] No existen llamadas residuales que fuercen navegación a `/login`.

### Archivos afectados

- `packages/lib/error-messages.ts`
- `packages/ui/nav/Header.tsx`
- `packages/ui/exports/ExportButton.tsx`
- `apps/web/playwright.config.ts`
- `apps/web/e2e/helpers.ts`
- `apps/web/e2e/auth.spec.ts`

### Dependencias

- F6.1.T1

### Estimación

2.0h

---

## F6.1.T3 — Password recovery hardening (InsForge Auth + Resend SMTP + mock E2E)

### Objetivo

Asegurar la integración server-side de recuperación de contraseña con InsForge Auth y Resend SMTP, implementar soporte de reset en el mock local E2E (`apps/web/e2e/server/mock-insforge.cjs`), y añadir test E2E de recuperación de contraseña.

### Alcance

Sí hace:
- Endurecer `apps/web/app/api/auth/reset/route.ts` y `packages/lib/server/auth.ts` para solicitar y confirmar cambio de contraseña con tokens de un solo uso.
- Configurar integración de envío de correo vía Resend SMTP en `packages/lib/server/email.ts`.
- Implementar endpoints simulados en el servidor mock `apps/web/e2e/server/mock-insforge.cjs` para captura de solicitud de reset y validación de tokens.
- Añadir suite de prueba E2E en `apps/web/e2e/auth.spec.ts` que valide: click en "¿Olvidaste tu contraseña?" -> ingreso de email -> recepción simulada de token -> cambio exitoso de clave -> login con nueva clave.

No hace:
- Cambio de rutas raíz (F6.1.T1).

### Criterios de aceptación

- [ ] `POST /api/auth/reset` valida formato de correo, verifica existencia y emite token seguro.
- [ ] `mock-insforge.cjs` procesa endpoints de password reset permitiendo testing local determinístico sin internet.
- [ ] Test E2E de recuperación de contraseña pasa al 100% en Playwright.
- [ ] Respuestas de error claras ante tokens inválidos o expirados.

### Archivos afectados

- `apps/web/app/api/auth/reset/route.ts`
- `packages/lib/server/auth.ts`
- `apps/web/e2e/server/mock-insforge.cjs`
- `apps/web/e2e/auth.spec.ts`

### Dependencias

- F6.1.T1

### Estimación

2.0h

---

## F6.1.T4 — Módulo Pacientes Core: DDL sexo NOT NULL, Zod schemas y desglose pediátrico

### Objetivo

Hacer obligatorio el campo `sexo` a nivel de base de datos PostgreSQL (`NOT NULL`) y esquemas Zod con mensaje `SEXO_REQUERIDO`, e implementar la función unificada `@labo/lib/edad.ts` con desglose pediátrico (años, meses, días y etapa de desarrollo clínica) junto a sus tests unitarios.

### Alcance

Sí hace:
- Crear migración SQL `packages/db/migrations/0003_paciente_sexo_not_null.sql` actualizando filas nulas previas y seteando `ALTER COLUMN sexo SET NOT NULL`.
- Actualizar `packages/db/schema.sql` con el constraint `NOT NULL` en `pacientes.sexo`.
- Actualizar Zod schemas en `packages/lib/schemas/paciente.ts` requiriendo `sexo: z.enum(["M", "F"], { errorMap: () => ({ message: "SEXO_REQUERIDO" }) })`.
- Implementar función `calcularEdadDesglosada` en `packages/lib/edad.ts` que retorne desglose `{ anos, meses, dias, etapa, textoFormateado }` soportando etapas clínicas: Neonato (<28d), Lactante menor (1m-11m), Lactante mayor (12m-23m), Preescolar (2a-5a), Escolar (6a-11a), Adolescente (12a-17a), Adulto (18a-59a), Adulto mayor (60a+).
- Crear tests unitarios exhaustivos en `packages/lib/edad.test.ts` y `packages/lib/schemas/paciente.test.ts`.

No hace:
- Modificación de diálogos UI de pacientes (F6.1.T5).

### Criterios de aceptación

- [ ] Migración `0003_paciente_sexo_not_null.sql` aplica sin errores.
- [ ] Schema `pacienteCreate` rechaza payloads sin `sexo` con error `SEXO_REQUERIDO`.
- [ ] `calcularEdadDesglosada` clasifica correctamente neonatos, lactantes y adultos con precisión en días y meses.
- [ ] Tests unitarios `pnpm --filter @labo/lib test` pasan al 100% en verde.

### Archivos afectados

- `packages/db/migrations/0003_paciente_sexo_not_null.sql`
- `packages/db/schema.sql`
- `packages/lib/schemas/paciente.ts`
- `packages/lib/schemas/paciente.test.ts`
- `packages/lib/edad.ts`
- `packages/lib/edad.test.ts`

### Dependencias

- Ninguna

### Estimación

2.0h

---

## F6.1.T5 — Módulo Pacientes UI: reactividad de edad, badge pediátrico y select obligatorio

### Objetivo

Integrar en `PacienteFormDialog.tsx` el cálculo reactivo de edad en tiempo real al ingresar la fecha de nacimiento (mostrando badge interactivo con desglose y etapa clínica), requerir explícitamente el selector de sexo en la UI y sincronizar listas y tests E2E.

### Alcance

Sí hace:
- Modificar `apps/web/app/(app)/pacientes/PacienteFormDialog.tsx` utilizando `useWatch` o `watch("fecha_nacimiento")` para calcular reactivamente la edad en vivo.
- Mostrar badge visual dinámico con la edad calculada y la etapa clínica pediátrica/adulta debajo del input de fecha de nacimiento.
- Actualizar el selector de sexo en el formulario para ser campo requerido sin valor por defecto ambiguo, mostrando error si no se selecciona.
- Mostrar badge pediátrico informativo en `PacientesList.tsx` y `FichaTabs.tsx` cuando aplique.
- Actualizar la suite de pruebas E2E en `apps/web/e2e/paciente.spec.ts` verificando el comportamiento reactivo y la obligatoriedad del sexo.

No hace:
- Funciones matemáticas de cálculo de edad (F6.1.T4).

### Criterios de aceptación

- [ ] Al seleccionar o escribir una fecha de nacimiento en el diálogo, el badge de edad y etapa se actualiza en tiempo real sin recargar.
- [ ] El formulario bloquea el envío y muestra mensaje de error si no se selecciona sexo 'M' o 'F'.
- [ ] Las vistas de listado y ficha de paciente reflejan el formato de edad desglosada para pacientes pediátricos.
- [ ] Tests E2E de pacientes pasan 100% en verde en Playwright.

### Archivos afectados

- `apps/web/app/(app)/pacientes/PacienteFormDialog.tsx`
- `apps/web/app/(app)/pacientes/PacientesList.tsx`
- `apps/web/app/(app)/pacientes/[id]/FichaTabs.tsx`
- `apps/web/e2e/paciente.spec.ts`

### Dependencias

- F6.1.T4

### Estimación

2.5h
