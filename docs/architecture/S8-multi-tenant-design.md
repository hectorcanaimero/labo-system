# S8: Diseño Multi-tenant (Fase 2)

**ESTE DOCUMENTO ES SÓLO DISEÑO DEFENSIVO. ESTO NO SE IMPLEMENTA EN V1.**

## 1. Objetivo y Contexto

El sistema v1 está confirmado como **mono-tenant**. Sin embargo, la Fase 2 contempla la necesidad de operar en un esquema **multi-tenant** (múltiples laboratorios usando la misma instancia). El objetivo de este análisis es evaluar si es necesario preparar el esquema v1 para esta futura fase y documentar la estrategia de transición.

Dado que usamos **Convex** como base de datos y backend, no contamos con *Row Level Security* (RLS) a nivel de base de datos como en Postgres. La seguridad multi-tenant debe manejarse a nivel aplicativo.

## 2. Aproximaciones para Fase 2

Se han evaluado dos enfoques principales para gestionar la separación por laboratorio (tenant).

### Aproximación 1: Schema-level (Campos opcionales en v1)
Consiste en agregar `laboratorio_id: v.optional(v.id("laboratorios"))` en TODAS las tablas de dominio (`pacientes`, `examenes_titulos`, `examenes`, `paquetes`, `resultados`, `presupuestos`) desde v1. En v1 queda en `undefined`, y en Fase 2 se realiza una migración one-shot para completarlo.

*   **Pros:**
    *   El esquema ya refleja (conceptualmente) la pertenencia a un tenant desde el inicio.
    *   Evita agregar los campos durante la transición a Fase 2 (aunque habría que cambiar de `v.optional` a requerido).
*   **Contras:**
    *   Genera "ruido" e incertidumbre en el código v1 sobre qué hacer con ese campo si no se usa.
    *   Involucra un rediseño prematuro que rompe la simplicidad del mono-tenant estricto.
    *   En Fase 2 igual se necesita una migración de datos, porque los registros existentes tendrán el campo vacío o en `undefined`.

### Aproximación 2: Application-level (Helpers lógicos en v1, esquema puro en v2)
En v1 no se toca el esquema y permanece 100% mono-tenant puro, sin campos `laboratorio_id`.
En Fase 2, se agregan los campos y se implementan helpers aplicacionales, por ejemplo, un `withTenant(ctx, query)` o convenciones en las mutation/queries para filtrar por `laboratorio_id` basado en el `ctx.auth`.

*   **Pros:**
    *   **Simplicidad total en v1:** El código actual no tiene overhead ni complejidad futura introducida artificialmente.
    *   Convex permite migraciones y re-indexaciones de manera no bloqueante. Agregar el campo en Fase 2 y poblarlo no será disruptivo.
*   **Contras:**
    *   La transición requerirá una migración completa de todos los datos en las colecciones relevantes.

### Recomendación Explícita

**En v1 no tocar nada.** No agregar `laboratorio_id` opcional. El sistema v1 debe permanecer 100% mono-tenant puro. El overhead de agregar campos inactivos ahora no justifica los beneficios, ya que igual Convex permite migraciones fáciles y re-indexaciones on-the-fly en background en Fase 2.

---

## 3. Checklist de Cambios para Fase 2 (Hoja de Ruta)

Cuando se implemente Fase 2, se deberá ejecutar el siguiente checklist:

### 3.1. Esquema e Índices (schema.ts)
- [ ] Crear tabla `laboratorios`.
- [ ] Modificar tabla `usuarios`: Agregar `laboratorio_id: v.id("laboratorios")`.
- [ ] Modificar `pacientes`: Agregar `laboratorio_id: v.id("laboratorios")`.
- [ ] Modificar `examenes_titulos` y `examenes`: Agregar `laboratorio_id`. (O determinar si algunos exámenes son globales/compartidos).
- [ ] Modificar `paquetes`: Agregar `laboratorio_id`.
- [ ] Modificar `presupuestos`: Agregar `laboratorio_id`.
- [ ] Modificar `resultados`: Agregar `laboratorio_id`.
- [ ] **Índices**: Convex requerirá índices compuestos. Para cada colección de dominio, reemplazar índices genéricos (ej. `by_dni`) por índices prefijados por tenant (`by_laboratorio_and_dni` usando `["laboratorio_id", "dni"]`).

### 3.2. Autorización (packages/convex/helpers/auth.ts)
El manejo aplicativo requerirá inyectar el tenant en cada operación:
- [ ] Actualizar el helper actual (`requireRole`, etc.) o agregar `requireTenant(ctx)` que extraiga el `laboratorio_id` del usuario autenticado.
- [ ] Modificar todas las Queries y Mutations para que filtren siempre por `laboratorio_id` (ej. `.withIndex("by_laboratorio", q => q.eq("laboratorio_id", user.laboratorio_id))`).

*Análisis hipotético:*
```typescript
// packages/convex/helpers/auth.ts (Hipotético en Fase 2)
export async function requireTenant(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("No autenticado");
  
  const user = await ctx.db.query("usuarios")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
    
  if (!user || !user.laboratorio_id) {
    throw new Error("Usuario sin laboratorio asignado");
  }
  
  return user.laboratorio_id;
}
```

### 3.3. File Storage
Actualmente los PDFs o membretes subirían a Convex Storage genérico.
- [ ] Para Fase 2, al almacenar o consultar archivos, la metadata (o una tabla intermedia de registro de archivos) debe incluir el `laboratorio_id` para garantizar que un tenant no pueda consultar o listar `_storageIds` de assets de otro tenant.
- [ ] Cada laboratorio podría requerir su propia parametrización de membrete/logos (nueva colección `configuracion_laboratorio`).

### 3.4. Scraper BCV
El tipo de cambio del BCV es un dato macroeconómico global (para Venezuela).
- [ ] El Cron Job (`v1/crons.ts` u otro) se mantiene como una operación **global** que corre una sola vez en el sistema, no por laboratorio.
- [ ] La tabla de cotizaciones (o configuraciones globales) queda exenta de la separación tenant.

## 4. Conclusión
Posponer multi-tenant implica que la Fase 2 requerirá una migración completa de datos (`v.id("laboratorios")` para cada registro existente, asignándolo a un "Tenant 0" por defecto) y reescribir todas las query/mutations para incluir filtros por índice. 
Gracias al modelo de Convex, este rediseño puede hacerse sin down-time mediante el uso de migraciones en background y type-safety estricta que guiará el refactor, por lo que **la decisión de mantener v1 puramente mono-tenant es correcta, segura, y de bajo riesgo.**
