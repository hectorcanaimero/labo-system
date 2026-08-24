# Spike S4: Reestructuración de grupos de exámenes

## Decisión

**Conservar los 6 grupos actuales (fallback).** El rediseño se posterga a
post-cutover. El schema ya lo permite: `examenes_titulos` no tiene IDs hardcoded,
así que el cliente puede renombrar, fusionar o crear títulos después del go-live
sin migración destructiva.

La reunión con el cliente (Rosa) está pendiente al cierre de este spike. Mientras
tanto Fase 1 NO se bloquea: se aplica el fallback documentado y se comunica
explícitamente al cliente para evitar sorpresas (SPIKE S4 · Notas técnicas).

El rediseño eventual NO requiere tocar el schema: es data-only (editar
`examenes_titulos` + reasignar `examenes.titulo_id` desde el CRUD de F4).

## Documento pre-reunión (agenda + marco de decisión)

Input para la reunión con el cliente. La decisión es binaria y la prepara la
mesa de trabajo:

1. **Confirmar los 6 grupos actuales** (nombre + orden + count de exámenes).
2. **Decidir**: `conservar` (mantener 6 tal cual) o `rediseñar` (nueva lista).
3. Si rediseña, acordar reglas de merge/split (ej. "Hematología A" + "Hematología
   B" → "Hematología").
4. **Veterinaria**: confirmar que es un `título` más (sin tratamiento especial).

Datos conocidos hoy (fuente PRD §1 + auditoría):

- 6 grupos / 250+ exámenes en total.
- Duplicados detectados en auditoría: `CULTIVO Y ANTIBIOGRAMA` ×2, `Estradiol` ×2
  (la validación de nombre único por `titulo_id` en F4 resuelve esto a futuro).
- Nombres y counts individuales por grupo: **pendientes del dump MySQL** (input de
  S2, ver sección "Pendientes").

> No se fabrica la lista de nombres: el dump `rv_titulos` es la única fuente de
> verdad. Igual que S3 registró métricas de Vercel como *pending*, acá se registra
> la lista como *pending* hasta tener el dump.

## Fallback aplicado

| # | Decisión | Detalle |
|---|----------|---------|
| 1 | Conservar 6 grupos | Sin merge/split en la migración. Import 1:1 desde `rv_titulos`. |
| 2 | Rediseño post-cutover | Vía CRUD de F4, sin migración destructiva. |
| 3 | Veterinaria | Un `título` más (confirmado por PRD §4.1 F4: "Soporte de veterinaria como un Título más (sin tratamiento especial)"). |
| 4 | Comunicación | Informar a Rosa del fallback ANTES de importar el Excel / correr F1.migracion. |

## Lista definitiva `examenes_titulos` (seed post-migración)

Estructura objetivo (ARCH §6):

```ts
// packages/convex/schema.ts — examen_titulos
examenes_titulos: defineTable({
  nombre: v.string(),      // único
  orden: v.number(),       // orden de aparición en PDF/catálogo
  created_at: v.number(),
})
```

La lista concreta `{ nombre, orden }` se genera **en tiempo de migración** desde
`rv_titulos` (no es un seed estático hardcodeado). El script `scripts/migrate-wp/`
es la fuente: lee `rv_titulos`, preserva el orden de origen, e inserta en
`examenes_titulos`. Esto es coherente con el ADR "sin IDs hardcoded".

Los 6 nombres concretos quedan como follow-up de F1.migracion (ver Pendientes).

## Mapping WP → Convex (grupo por examen)

Contrato para `F1.migracion.T*`:

| MySQL (`rv_*`) | Convex | Transform |
|----------------|--------|-----------|
| `rv_titulos.id` | `examenes_titulos._id` | ID nuevo generado por Convex; mapeado en `_migration_map` |
| `rv_titulos.nombre` | `examenes_titulos.nombre` | 1:1, trim |
| `rv_titulos.orden` (o posición de lectura) | `examenes_titulos.orden` | preservar orden de origen |
| `rv_examenes.titulo_id` | `examenes.titulo_id` → `v.id("examenes_titulos")` | resolver vía `_migration_map` |

Orden de migración obligatorio (dependencias): `examenes_titulos` → `examenes` →
`paquetes` → `pacientes` → `resultados` → `presupuestos`.

## Veterinaria

Confirmado como un `título` más. Sin ramas de código ni campos especiales. Los
exámenes veterinarios viven bajo un `examenes_titulos` con `nombre` del grupo
veterinario; el resto del sistema (resultados, PDF, presupuestos) los trata igual
que cualquier examen humano.

## Reglas de merge/split

Bajo el fallback "conservar", **no aplican** para la migración. Para el rediseño
post-cutover (si el cliente lo pide), las reglas son:

- **Merge** (`A` + `B` → `C`): crear `C`, reasignar `examenes.titulo_id` de los
  exámenes de `A` y `B` a `C`, soft-delete `A` y `B`. Los `resultados`/`presupuestos`
  no se tocan porque guardan `snapshotNombre`/`snapshotPrecio` por línea.
- **Split** (`C` → `A`, `B`): crear `A` y `B`, reasignar por examen, soft-delete `C`.
- **Rename**: mutación simple sobre `nombre` (no afecta histórico por snapshot).

## Pendientes (follow-up para F1.migracion)

- [ ] Obtener dump MySQL de `rv_titulos` y extraer los **6 nombres + count** por
      grupo (input que S2 debió entregar pero dejó como "nombres tentativos").
- [ ] Confirmación explícita del cliente sobre **veterinaria** y sobre los 6
      grupos en la reunión (fallback comunicado mientras tanto).
- [ ] Si la reunión decide `rediseñar`, ejecutar las reglas de merge/split
      documentadas arriba vía CRUD de F4 (post-cutover).

## Gotchas y hallazgos

1. **Discrepancia de nombre de colección**: S2 (`docs/spikes/S2-migracion-wp-convex.md`)
   mapea `rv_titulos → titulos`, pero ARCH §6 y el ERD usan `examenes_titulos`.
   La colección canónica es **`examenes_titulos`**. F1.migracion debe usar ese
   nombre; corregir la tabla de mapping de S2 si se reutiliza.
2. El `orden` de `examenes_titulos` debe preservar el orden de aparición en el
   plugin actual para que el catálogo y el PDF migrado se vean consistentes.
3. No crear seed estático de títulos: la fuente de verdad es el dump. Cualquier
   seed hardcodeado contradiría el ADR "sin IDs hardcoded".

## Validación realizada

- Lectura de PRD §1, §4.1, §10 y ARCH §6, §12 (referencias verificadas).
- No se ejecutó build ni migración (fuera del alcance del spike y sin dump).
- No se fabricaron nombres de grupos; los datos concretos se derivan del dump.
