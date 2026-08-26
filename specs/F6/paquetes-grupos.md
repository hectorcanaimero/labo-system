---
type: spec
phase: F6
package: paquetes
project_id: labo-system
version: 0.1
depends_on:
  - F6.catalogo
blocks:
  - F6.presupuestos
generated_by: orch-spec
generated_at: 2026-08-25
title: "F6.paquetes — Paquetes: Armado por Grupos/Individual y Precio Base"
---

# F6.4 · Paquetes: Armado por Grupos/Individual y Precio Base

Mejora integral del módulo de paquetes para agilizar su construcción y definir precios promocionales:
1. Base de datos y repositorios: Migración `0006_paquetes_precio_base.sql` agregando `precio_base numeric(12,2) NOT NULL DEFAULT 0` a la tabla `paquetes`, esquemas Zod en `@labo/lib/schemas/paquete.ts` y persistencia en `packages/db/repos/paquetes.ts`.
2. Constructor UI de Paquetes (`PaqueteBuilder.tsx`): Armado mediante selección de grupos completos (acordeón con botón "Agregar grupo completo") o selección de exámenes individuales, junto con input de `precio_base` y cálculo de % y monto de ahorro en tiempo real vs la suma individual.

---

## F6.4.T1 — DB & Schemas de Paquetes: Migración precio_base y repositorios

### Objetivo

Crear la migración `0006_paquetes_precio_base.sql` agregando `precio_base numeric(12,2) NOT NULL DEFAULT 0` a la tabla `paquetes`, actualizar esquemas Zod en `@labo/lib/schemas/paquete.ts` y métodos en `packages/db/repos/paquetes.ts`.

### Alcance

Sí hace:
- Crear migración SQL `packages/db/migrations/0006_paquetes_precio_base.sql` con `ALTER TABLE paquetes ADD COLUMN precio_base numeric(12,2) NOT NULL DEFAULT 0;`.
- Actualizar `packages/db/schema.sql`.
- Actualizar esquemas Zod en `packages/lib/schemas/paquete.ts` validando `precio_base: z.number().min(0)`.
- Actualizar `paquetesRepo.create`, `paquetesRepo.update`, `paquetesRepo.getById`, `paquetesRepo.list` en `packages/db/repos/paquetes.ts` para soportar `precio_base`.
- Añadir tests unitarios en `packages/lib/schemas/paquete.test.ts`.

No hace:
- Constructor UI de paquetes (asignado a F6.4.T2).

### Criterios de aceptación

- [ ] Migración `0006_paquetes_precio_base.sql` aplica correctamente en PostgreSQL.
- [ ] Schema Zod valida `precio_base >= 0`.
- [ ] Repositorio de paquetes persiste y recupera `precio_base`.
- [ ] Tests unitarios en `@labo/lib` pasan en verde.

### Archivos afectados

- `packages/db/migrations/0006_paquetes_precio_base.sql`
- `packages/db/schema.sql`
- `packages/lib/schemas/paquete.ts`
- `packages/lib/schemas/paquete.test.ts`
- `packages/db/repos/paquetes.ts`

### Dependencias

- Ninguna

### Estimación

1.5h

---

## F6.4.T2 — Constructor UI de Paquetes: Armado por grupos completos o individual y cálculo de ahorro

### Objetivo

Actualizar `PaqueteBuilder.tsx` para permitir armar paquetes seleccionando grupos completos de exámenes (con acordeón y botón "Agregar grupo completo") o exámenes individuales, junto con el input de `precio_base` y cálculo de % de ahorro en tiempo real vs la suma individual de los exámenes incluidos.

### Alcance

Sí hace:
- Rediseñar el selector de exámenes en `PaqueteBuilder.tsx` para mostrar un acordeón de grupos/títulos con opción "Agregar grupo completo" que añade todos los exámenes activos del título que no estén ya en la lista.
- Permitir la búsqueda y adición de exámenes individuales dentro de cada grupo o mediante selector global.
- Agregar campo de entrada para `precio_base` (USD).
- Calcular y mostrar badge/card informativo en tiempo real: "Suma individual: $X.XX | Precio base paquete: $Y.YY | Ahorro: Z% ($W.WW)".
- Manejar advertencia visual si `precio_base > suma individual`.

No hace:
- Modificaciones a presupuestos o pricing dual-mode (F6.5).

### Criterios de aceptación

- [ ] Botón "Agregar grupo completo" añade todos los exámenes del título sin duplicados.
- [ ] Input de `precio_base` actualiza reactivamente el porcentaje y monto de ahorro vs la suma individual.
- [ ] Guardar paquete persiste la lista de exámenes y el `precio_base` ingresado.
- [ ] Validación visual clara cuando el precio base supera la suma de exámenes individuales.

### Archivos afectados

- `apps/web/app/(app)/paquetes/PaqueteBuilder.tsx`
- `apps/web/app/(app)/paquetes/page.tsx`

### Dependencias

- F6.4.T1

### Estimación

2.5h
