# Spike S6: Exportación CSV/XLSX

## Decisión

**Confirmar ADR-09 con un matiz de librería.** v1 exporta **CSV** (un archivo
por listado) generado server-side en una **Convex action** que escribe a
**File Storage** y devuelve `storageId`; la UI descarga vía URL firmada.
**XLSX entra en Fase 2** reutilizando exactamente el mismo pipeline
(action → storage → URL firmada), con `exceljs` en lugar de SheetJS para la
escritura.

El matiz sobre ADR-09: para **escribir** CSV no hace falta `papaparse`
(es una librería de *parsing*). Se usa un serializador propio RFC 4180
(`packages/lib/csv.ts`, ~40 líneas, cero dependencias). `papaparse` queda
como opcional y sólo si en el futuro hay que *parsear* CSV, cosa que v1 no
necesita.

Se descarta la generación client-side (SheetJS en navegador) y el streaming
HTTP directo desde la action (Convex actions no streamean al cliente).

## Preguntas abiertas del PRD (§S6) — resueltas

| # | Pregunta | Resolución |
|---|----------|------------|
| 1 | **Formato final** (una hoja vs varias) | CSV = un archivo por listado (CSV no tiene hojas). XLSX (F2) = **una hoja por listado**. El workbook multi-hoja ("Exportar todo") es nice-to-have posterior, no v1. |
| 2 | **Scope** (todas vs subset elegible) | v1 = **todas las columnas** del listado, flatteneadas/denormalizadas. "Respetar filtros aplicados" del PRD es sobre **filas**, no columnas. Selección de columnas → Fase 2. |
| 3 | **Performance 500–10.000 rows** | Paginación interna con cursor (chunks de 1000), serialización incremental, 10k filas ≈ 2–5 MB en memoria (dentro de límites de una action). Cleanup cron borra `tag=export` > 7d. |
| 4 | **Convex action con SheetJS vs client-side** | **Convex action server-side** (confirma ADR-09). Client-side descartado: 10k rows saturan el navegador y duplican la PII en memoria del cliente. |

## Librerías comparadas (export path)

| Librería | Versión npm | Estado | Rol en export | Veredicto |
|----------|-------------|--------|----------------|-----------|
| **CSV manual (RFC 4180)** | — | propio | Escribir CSV | ✅ **Elegido** (v1) |
| `papaparse` | 5.6.0 (activa, ago-2026) | mantenida | Parsing (no escritura) | ⏸ Opcional futuro |
| `xlsx` (SheetJS) | 0.18.5 congelada en npm (mar-2022) | npm estancado; CVE-2023-30533 (prototype pollution) y CVE-2024-22363 (ReDoS) en el lado **parse** | Escribir XLSX | ❌ Descartado para exportar |
| `exceljs` | 4.4.0 (estable) | mantenida, streaming writer | Escribir XLSX (F2) | ✅ **Elegido** (F2) |

### Por qué no SheetJS para exportar

1. El paquete `xlsx` en npm está **congelado en 0.18.5 desde 2022**. SheetJS
   ahora distribuye por su propio CDN (`cdn.sheetjs.com`); la versión de npm
   no recibe fixes.
2. Los CVE conocidos (`CVE-2023-30533`, `CVE-2024-22363`) afectan el **parse**
   (lectura de archivos hostiles), no la escritura. Como el export es
   *write-only*, SheetJS "serviría", pero seguir arrastrando un paquete npm
   estancado por una tarea de escritura no se justifica cuando `exceljs` la
   cubre con streaming y está mantenido.
3. El riesgo "xlsx tiene CVE" del PRD/ARCH es real pero es un riesgo de
   **F4 Import** (parse de Excel del cliente), no de F10. Eso se resuelve en
   F4, no acá (ver "Nota para F4").

## Scope: columnas por listado (v1)

El export denormaliza cada listado a filas planas. Una fila = una entidad del
listado. Los detalles (líneas de examen) se aplanan a columnas separadas por
`; ` (CSV-friendly) en v1; un export "detalle" fila-por-línea queda como
follow-up Fase 2 si el contador lo pide.

### Pacientes
`cedula, nombre, apellido, fecha_nacimiento, sexo, telefono, email, direccion, created_at`

### Presupuestos
`created_at, paciente, cedula, estado, descuento_pct, ganancia_pct, tasa_bs, total_usd, total_bs, examenes`
- `paciente` = `nombre + apellido` si `paciente_id`, o `paciente_nombre_libre`.
- `examenes` = `nombre_snap x precio_snap` unidos por `; `.
- `ganancia_pct` es interno (no va al PDF) pero **sí** va al export de costos
  para el contador (es el margen).

### Resultados
`fecha_muestra, fecha_resultado, paciente, cedula, medico_solicitante, estado, examenes, observaciones`
- `examenes` = `nombre_snap: valor unidad` unidos por `; `.

### Costos (histórico de precios por examen)
`examen, titulo, precio_usd_actual, precio_snap, fecha, fuente`
- **No existe tabla `costos`**. El histórico se **deriva de los snapshots**
  (`precio_snap`) de `resultados_examenes` y `presupuestos_examenes`, con la
  `fecha` tomada del documento padre (`fecha_muestra` / `created_at`) y
  `fuente` = `resultado` | `presupuesto`.
- `precio_usd_actual` sale de `examenes.precio_usd` para contrastar contra el
  precio transaccionado.

## Pipeline de export (dataflow)

```
UI lista (con filtros) ──useAction──▶ exports.<entidad>CSV({ filters })
                                        │  1. query paginada (cursor 1000)
                                        │  2. flatten + serialize (csv.ts)
                                        │  3. ctx.storage.store(blob)
                                        │  4. return { storageId }
UI ◀──{ storageId }─────────────────────┘
UI ──useMutation──▶ exports.getSignedUrl({ storageId }) ──▶ URL firmada (~1h)
UI ──window.open(url)──▶ descarga
cron cleanupExports (semanal) ──▶ borra storage tag=export age>7d
```

Diagrama ya generado: `docs/architecture/001-labsystem-export.diagrams.html`.

## Contrato de actions (F10)

```ts
// packages/convex/exports.ts
export const pacientesCSV = action({
  args: { filters: { q?: string } },
  handler: async (ctx, args) => { /* paginado + csv.ts + storage */ }
});
// mismo patrón: presupuestosCSV, resultadosCSV, costosCSV
// + mutation getSignedUrl({ storageId }) y internalAction crons/cleanupExports
```

- **Auth**: `ctx.auth.getUserIdentity()` al inicio; `requireRole` Operador/Admin.
- **Filtros**: replican los del listado correspondiente (`estado`, `desde/hasta`,
  búsqueda de paciente). El export respeta lo que la UI ya filtra.
- **Runtime**: actions corren en Node por defecto; `csv.ts` no tiene
  dependencias de búfer/runtime específicos.
- **Límites**: 10k filas caben en una action; si el volumen crece, el paginado
  por 1000 ya está preparado y el único techo es memoria del worker (no se
  alcanza con los volúmenes actuales: 204 pacientes, 652 resultados, 545
  presupuestos).

## Gotchas y hallazgos

1. **Índice faltante para "Costos"**: `resultados_examenes` sólo tiene
   `by_resultado` y `presupuestos_examenes` sólo `by_presupuesto`. El export de
   Costos necesita agrupar por `examen_id`, que hoy obliga a un scan completo de
   ambas tablas. **Recomendado**: agregar `.index("by_examen", ["examen_id"])`
   a las dos tablas de detalle antes de F10. Costo: cero lógica, sólo schema.
2. **Sin tabla `costos`**: el "histórico de precios" es *transaccional* (precio
   que se cobró en cada resultado/presupuesto). No captura cambios de precio del
   catálogo entre transacciones. Si el cliente pide historial de precio de
   catálogo *independiente* de transacciones, se necesitaría una tabla
   `precio_historico` en F4 (escribir `{ examen_id, precio, from }` en cada
   edición). Decisión: **derivar de snapshots** (más barato, cubre el caso de
   uso "qué cobramos" que es lo que el contador pide); tabla dedicada sólo si se
   confirma la necesidad.
3. **Escape CSV**: `csv.ts` debe implementar RFC 4180 completo (comillas dobles,
   CRLF, BOM UTF-8 `\uFEFF` al inicio para que Excel abra acentos/tildes sin
   romper). Sin BOM, Excel interpreta UTF-8 como Latin-1 y rompe `ñ`/`á`.
4. **URL firmada expira (~1h)**: la UI no debe cachear la URL. `getSignedUrl` se
   invoca justo antes de `window.open`.
5. **Números**: `total_usd`/`total_bs` se serializan con `.` como separador
   decimal en CSV (estándar). Si el contador usa Excel con locale ES-VE (coma
   decimal), el BOM + apertura de CSV ya convierte; documentarlo como XLSX F2.
6. **Limpiar storage**: el tag `export` se setea en `store({ ... })`; el cron
   `cleanupExports` borra `age > 7d`. No olvidar el tag o el archivo queda
   huérfano y cuenta contra el storage.
7. **`ganancia_pct`/`descuento_pct` en Presupuestos** son columnas útiles para
   el contador; van en el export aunque no salgan en el PDF.

## Nota para F4 (import Excel) — fuera del alcance de este spike

El CVE de SheetJS es del lado **parse**. F4 importa `.xlsx` del cliente, así que
es F4 quien debe resolver la superficie CVE, no F10. Opciones (elegir en F4):

- Instalar SheetJS desde el **tarball oficial** (`cdn.sheetjs.com/xlsx-latest/…`)
  en vez del paquete npm congelado; o
- Migrar el parser de `xlsx-import.ts` a `exceljs` (que ya se adopta para el
  export F2) y así tener **una sola** librería XLSX en el repo.

## Pendientes (follow-up para F10)

- [ ] Confirmar con el contador si el export de Presupuestos debe ir
      *resumen* (una fila por presupuesto, v1) o *detalle* (fila por línea).
- [ ] Confirmar si "Costos" se entiende como histórico transaccional (snapshots,
      elegido) o como historial de cambios de precio de catálogo (tabla dedicada).
- [ ] Agregar índices `by_examen` a `resultados_examenes` y `presupuestos_examenes`
      antes de F10 (schema change).
- [ ] Fase 2 XLSX: `exceljs` streaming, una hoja por listado; evaluar workbook
      multi-hoja.

## Validación realizada

- Lectura de PRD §4.1 (F10), §5.1 (stack), tabla de spikes (§S6) y riesgos;
  ARCH ADR-09, §4.4, §5.1, §5.3, §9 y diagrama export.
- Verificado el `schema.ts` actual (no existe `costos`; detalle sin `by_examen`).
- Verificado en registry npm: `xlsx` 0.18.5 congelado (2022), `exceljs` 4.4.0,
  `papaparse` 5.6.0.
- No se ejecutó build ni se implementó código (spike de investigación).
