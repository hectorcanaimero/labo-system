# Spike S2: Migración WP → Convex

## 1. Objetivo
Definir la estrategia técnica, mapping de esquemas, manejo de IDs y resolución de conflictos para la migración one-shot desde la base de datos MySQL de WordPress (plugin custom) hacia Convex. Esta migración será ejecutada mediante un script Node.js standalone y debe ser idempotente.

## 2. Estrategia de Identificadores (IDs)

Dado que Convex utiliza identificadores generados internamente (`v.id("tabla")`) y no soporta forzar IDs custom (como el auto-incremental de MySQL), **no podemos preservar los `wp_id` directamente como `_id`**.

**Solución:** Tabla `_migration_map` en Convex.
*   **Schema**:
    ```typescript
    _migration_map: defineTable({
      wp_table: v.string(), // ej. "rv_pacientes"
      wp_id: v.number(),    // ej. 1543
      convex_id: v.string() // ej. "jh7a9f8b..."
    }).index("by_wp_id", ["wp_table", "wp_id"])
    ```
*   **Mecanismo**: 
    1. Antes de migrar un registro de `rv_pacientes` con ID `15`, el script consulta el índice `by_wp_id` para `("rv_pacientes", 15)`.
    2. Si existe, omite la inserción (haciendo el script **idempotente**).
    3. Si no existe, inserta el paciente en Convex y luego inserta el mapping en `_migration_map`.
    4. Para resolver relaciones (ej. `resultado` apunta a `paciente_id = 15`), el script busca en el `_migration_map` el `convex_id` correspondiente al paciente `15` para insertarlo como `v.id("pacientes")`.

## 3. Mapping de Tablas (MySQL → Convex)

Convex es documental. Esto nos permite consolidar tablas de detalle de MySQL en arrays dentro del documento padre en Convex, reduciendo consultas y joins manuales.

| MySQL (WordPress) | Convex (Tabla/Documento) | Estrategia de Migración / Consolidación |
| :--- | :--- | :--- |
| `rv_pacientes` | `pacientes` | Normalización de campos de contacto y limpieza de formato. |
| `rv_titulos` | `titulos` | Migración 1:1. |
| `rv_examenes` | `examenes` | Se convierte `titulo_id` a `v.id("titulos")`. |
| `rv_paquetes` | `paquetes` | Migración 1:1. |
| `rv_resultados` + `rv_resultados_detalle` | `resultados` | El detalle se consolida en un array `examenes` dentro del documento de resultado. Se resuelve `paciente_id`. |
| `rv_presupuestos` + `rv_presupuestos_detalle` | `presupuestos` | Similar a resultados. El detalle queda incrustado como array. |

### Snapshots de Precios y Nombres
Es crítico que al consolidar `resultados` y `presupuestos`, el nombre y precio del examen al momento de la transacción se conserven estáticos, previniendo que un cambio de precio actual afecte presupuestos históricos.
*   **Schema en Detalle**:
    ```typescript
    examenes: v.array(v.object({
      examenId: v.optional(v.id("examenes")), // Opcional por si el examen fue borrado en WP
      snapshotNombre: v.string(),
      snapshotPrecio: v.number(),
      // ... campos de resultados (valor, referencia, flag)
    }))
    ```

## 4. Normalización de Cédulas

Las cédulas en el sistema legacy pueden venir con caracteres, espacios o sin formato (ej. `V- 21.197.865`, `E-8123456`, `v21197865`, `21197865`). En Convex, la cédula será **única** e indexada.

**Algoritmo de Normalización:**
1. Transformar a mayúsculas y remover todos los espacios y puntos.
2. Extraer prefijo y números con Regex: `/^([VEJGP]?)[-\s\.]*(\d{5,9})$/`
3. Si el prefijo está ausente pero los dígitos encajan en el patrón típico de personas, asumir `V`.
4. Reconstruir al estándar estricto: `{Prefijo}-{Dígitos}` (ej. `V-21197865`).

**Manejo de Conflictos:**
Si durante la normalización, el script detecta que dos `wp_id` distintos normalizan a la misma cédula, debe:
*   En modo `dry-run`: Registrar un conflicto (Duplicate Identity) y exponer en el reporte.
*   En modo `ejecución`: Si choca contra el índice único de Convex, loggear el error para resolución manual y continuar (skip record) o realizar un merge automático si está autorizado. Por seguridad, recomendamos **skip y reporte**.

## 5. Script Standalone y Ejecución

*   **Ubicación**: `scripts/migrate-wp/index.ts`
*   **Conexiones**: Usará `mysql2` para conectar a la DB origen y `ConvexHttpClient` para conectarse a Convex mediante un token de Admin.
*   **Fases de Ejecución**:
    1. **Dry-Run (Por Defecto)**: Conecta a MySQL, extrae la data, aplica las transformaciones (limpieza de cédulas, consolidación), y reporta inconsistencias de integridad referencial o posibles conflictos de IDs, sin realizar mutaciones en Convex.
    2. **Cutover (Migración Real)**: Inserta secuencialmente. Orden obligatorio para respetar referencias:
       `titulos` → `examenes` → `paquetes` → `pacientes` → `presupuestos` → `resultados`.
*   **Paginación**: Se leerán los datos en chunks de 500 registros para no saturar memoria en Node ni exceder los límites de payload de mutations en Convex (que soporta transacciones limitadas en tamaño por request).
