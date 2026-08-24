---
type: spec
phase: F1
package: config
project_id: labo-system
version: 0.1
depends_on:
  - F0.setup
  - F0.auth
blocks:
  - F2.resultados
  - F2.presupuestos
  - F3.dashboard
generated_by: orch-spec
generated_at: 2026-08-23
title: "F1.config — Configuración de Empresa (Admin)"
---

# F1 · Config Empresa

Módulo Admin-only para gestionar identidad del laboratorio: nombre, RIF, dirección, contacto, assets (logo, firma, sello) y default de tasa BCV manual. El nombre es requerido y BLOQUEA la generación de PDFs si está vacío (bug crítico de la auditoría).

## Referencias

- **PRD**: §4 F2 (Config Empresa), §9 (success criteria PDF con nombre).
- **ARCH**: ADR-01 (Convex file storage), §6 (tabla `laboratorio_config`), §3 (F2 componente).

---

## F1.config.T01 — Query + mutation base `laboratorio_config`

### Objetivo

Query `config.get()` (singleton) y mutation `config.update()` (Admin only) que persisten los campos escalares (nombre, dirección, teléfono, email, RIF, mensaje pie PDF).

### Contexto

`laboratorio_config` es singleton — un solo documento en la tabla.

### Alcance

Sí hace:
- `packages/convex/config.ts`:
  - `get`: retorna el único doc o `null`.
  - `update`: acepta partial `{ nombre, direccion, telefono?, email?, rif?, pdf_pie_pagina? }`.
- Validación: `nombre` requerido y no vacío al guardar (schema Zod compartido en `packages/lib/schemas/config.ts`).
- Validación RIF formato `J-XXXXXXXX-X` (regex, opcional).
- `requireRole(ctx, "admin")` en mutation.
- Registro en `audit_log` (accion `"config.update"`).
- Actualiza `updated_at` + `updated_by`.

No hace:
- Upload de assets (T02).
- Tasa BCV manual (T03).
- UI (T04).

### Criterios de aceptación

- [ ] `config.get()` retorna doc o null (primer arranque).
- [ ] `config.update({ nombre: "" })` rechaza con error `NOMBRE_REQUERIDO`.
- [ ] `config.update({ rif: "abc" })` rechaza con `RIF_INVALIDO`.
- [ ] Operador rechazado con `UNAUTHORIZED`.
- [ ] audit_log registra el evento.
- [ ] Si no existe doc, `update` crea; si existe, actualiza (upsert).

### Archivos afectados

- `packages/convex/config.ts`
- `packages/lib/schemas/config.ts`
- `packages/convex/helpers/auth.ts` (reuse)

### Dependencias

- F0.setup.T03
- F0.auth.T04

### Estimación

S (3h)

### Notas técnicas

Singleton pattern: query `db.query("laboratorio_config").unique()` o `.first()`. Mutation hace upsert.

---

## F1.config.T02 — Upload de assets (logo, firma, sello) a File Storage

### Objetivo

Endpoint que permite Admin subir 3 imágenes (logo, firma, sello) a Convex File Storage y guardar los `storage_id` en `laboratorio_config`.

### Contexto

ARCH ADR-01 (storage), ADR-02 (PDFs leen assets vía URL firmada). Assets: PNG/JPG ≤ 2 MB (PRD §7 dependencias).

### Alcance

Sí hace:
- Mutation `config.generateUploadUrl()` (Admin only) que retorna URL de upload de Convex.
- Mutation `config.setAsset({ type: "logo"|"firma"|"sello", storageId })` que actualiza el campo correspondiente.
- Validación cliente: tipo MIME image/*, tamaño ≤ 2 MB.
- Al reemplazar asset: borrar el anterior de storage (`convex.storage.delete`).
- Query `config.getAssetUrl({ type })` retorna URL firmada (TTL ~1h).

No hace:
- Recorte/redimensionado.
- Preview (UI en T04).

### Criterios de aceptación

- [ ] Upload de PNG 500KB funciona; retorna `storageId`.
- [ ] Upload de archivo > 2 MB rechaza cliente + rechaza mutation (defense in depth).
- [ ] Upload de PDF (mime incorrecto) rechaza.
- [ ] `getAssetUrl` retorna URL válida por 1h.
- [ ] Reemplazar logo borra el archivo anterior.
- [ ] Operador rechazado.

### Archivos afectados

- `packages/convex/config.ts` (extender)
- `packages/lib/schemas/config.ts` (extender)

### Dependencias

- F1.config.T01

### Estimación

M (4h)

### Notas técnicas

Convex `storage.generateUploadUrl()`; cliente hace `fetch(url, { method: "POST", body: file })` y recibe `storageId`.

---

## F1.config.T03 — Default de tasa BCV manual

### Objetivo

Campo global "última tasa BCV usada" en Config Empresa que sirve como default para pre-rellenar presupuestos (fallback si el cron BCV no está disponible aún).

### Contexto

PRD §4 F2 (bullet "campo global de última tasa BCV"). F3.bcv agrega la tasa automática; este task sólo hace el manual.

### Alcance

Sí hace:
- Reutilizar mutation `tasa.setManual({ tasa, motivo })` (definida en F2.presupuestos porque también se usa allí) — este task NO la implementa, sólo agrega el input en UI de `/config`.
- Query `tasa.getLatest()` retorna el último registro de `tasa_cambio_bcv` con flag `stale`.
- Task marca como dependencia: T04 puede usar estas queries/mutations.

No hace:
- Scraper BCV (F3.bcv).
- UI presupuestos (F2.presupuestos).

### Criterios de aceptación

- [ ] Query `tasa.getLatest()` funciona (retorna null si tabla vacía).
- [ ] Reserva el uso de la mutation `tasa.setManual` para T04.

### Archivos afectados

- `packages/convex/tasa.ts` (query `getLatest`)

### Dependencias

- F0.setup.T03
- F0.auth.T04

### Estimación

S (2h)

### Notas técnicas

`tasa.setManual` completo se implementa en F2.presupuestos.T01 (schema de dinero) o F3.bcv.T02 (allí también hace override manual). Este task sólo asegura que `getLatest` está listo para T04.

---

## F1.config.T04 — UI `/config` (form Admin)

### Objetivo

Página `/config` con form completo: nombre, dirección, contacto, RIF, upload de assets con preview, tasa BCV manual override, mensaje pie PDF.

### Contexto

PRD §4 F2; ARCH §3 componente F2.

### Alcance

Sí hace:
- `apps/web/app/(app)/config/page.tsx` (Server component con preload).
- `apps/web/app/(app)/config/ConfigForm.tsx` (Client component con `useMutation`).
- Secciones: Identidad, Contacto, Assets (logo/firma/sello con preview), Tasa BCV manual, PDF pie de página.
- Validaciones cliente (RHF + zodResolver reusando `packages/lib/schemas/config.ts`).
- Loading + success/error toasts.
- Preview de assets tras upload.
- Panel "Invitar usuario" si F0.auth.T07 está implementado.

No hace:
- Multi-tenant (S8).
- Edición de tabla `usuarios` completa (fuera de scope v1).

### Criterios de aceptación

- [ ] Admin puede editar todos los campos y guardar.
- [ ] Operador que llega vía URL directa es redirigido (middleware F0.auth.T03).
- [ ] Upload de logo muestra preview inmediato.
- [ ] Nombre vacío bloquea guardar con error visible.
- [ ] Tasa manual actualiza la última tasa (verificado en presupuestos post-implementación).
- [ ] Mensaje toast en éxito/error.

### Archivos afectados

- `apps/web/app/(app)/config/page.tsx`
- `apps/web/app/(app)/config/ConfigForm.tsx`
- `apps/web/app/(app)/config/AssetUploader.tsx`
- `apps/web/app/(app)/config/InviteUserDialog.tsx` (si F0.auth.T07 listo)

### Dependencias

- F0.setup.T06
- F0.auth.T03
- F1.config.T01
- F1.config.T02
- F1.config.T03

### Estimación

L (8h)

### Notas técnicas

Usar `react-hook-form` + `@hookform/resolvers/zod`. Preview de imágenes con `<img src={url}>` de la URL firmada.
