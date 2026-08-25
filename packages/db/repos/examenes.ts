import { getSql, withTransaction } from "../client";

/**
 * Errores de dominio del catálogo de títulos (grupos) de exámenes.
 *
 * Se reutilizan en los Route Handlers `/api/examenes/titulos/*` para mapear a
 * códigos HTTP. Coinciden con `packages/convex/examenes.ts` (F1.2.T1 original)
 * y con `DOMAIN_ERROR_MESSAGES` en `@labo/lib/error-messages`.
 */
export const TITULO_DUPLICADO = "TITULO_DUPLICADO";
export const TITULO_NO_ENCONTRADO = "TITULO_NO_ENCONTRADO";
export const TITULO_TIENE_EXAMENES = "TITULO_TIENE_EXAMENES";

export const EXAMEN_DUPLICADO_EN_TITULO = "EXAMEN_DUPLICADO_EN_TITULO";
export const EXAMEN_NO_ENCONTRADO = "EXAMEN_NO_ENCONTRADO";

const NOMBRE_UNIQUE_CONSTRAINT = "examenes_titulos_nombre_unique";
const EXAMEN_UNIQUE_CONSTRAINT = "examenes_titulo_nombre_unique";
const ENTITY_TYPE = "examenes_titulos";
const EXAMEN_ENTITY_TYPE = "examenes";
const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";
const EXAMEN_SEARCH_LIMIT = 10;

type PgErrorLike = {
  code?: string;
  constraint?: string;
};

export interface Titulo {
  id: string;
  nombre: string;
  orden: number;
  created_at: Date;
}

export interface TituloCreateInput {
  nombre: string;
  orden: number;
  usuarioId: string;
}

export interface TituloUpdateInput {
  id: string;
  nombre?: string;
  orden?: number;
  usuarioId: string;
}

export interface TituloDeleteInput {
  id: string;
  usuarioId: string;
}

export interface TituloReorderInput {
  orderedIds: string[];
  usuarioId: string;
}

function isPgError(error: unknown): error is PgErrorLike {
  return typeof error === "object" && error !== null;
}

/**
 * ADR-11: uniqueness declarativa. El `UNIQUE (nombre)` de `examenes_titulos`
 * mapea la violación `23505` a `TITULO_DUPLICADO`.
 */
function mapUniqueNombreError(error: unknown): never {
  if (
    isPgError(error) &&
    error.code === "23505" &&
    error.constraint === NOMBRE_UNIQUE_CONSTRAINT
  ) {
    throw new Error(TITULO_DUPLICADO);
  }
  throw error;
}

/**
 * FK RESTRICT fallback: si el título tiene exámenes hijos (aunque estén
 * soft-deleted) el DELETE explota con `23503` — mapeamos a `TITULO_TIENE_EXAMENES`
 * para un mensaje accionable.
 */
function mapForeignKeyError(error: unknown): never {
  if (isPgError(error) && error.code === "23503") {
    throw new Error(TITULO_TIENE_EXAMENES);
  }
  throw error;
}

function validateNombre(nombre: unknown): string {
  if (typeof nombre !== "string" || nombre.trim().length === 0) {
    throw new Error(VALIDACION_FALLIDA);
  }
  return nombre.trim();
}

function validateOrden(orden: unknown): number {
  if (typeof orden !== "number" || !Number.isInteger(orden)) {
    throw new Error(VALIDACION_FALLIDA);
  }
  return orden;
}

/**
 * Lista todos los títulos ordenados por `orden` ascendente.
 *
 * Lectura pública para cualquier usuario autenticado (operador+); el guard de
 * rol se aplica en el Route Handler.
 */
export async function titulosList(): Promise<Titulo[]> {
  const sql = getSql();
  return sql<Titulo[]>`
    SELECT id, nombre, orden, created_at
    FROM examenes_titulos
    ORDER BY orden ASC, created_at ASC
  `;
}

/**
 * Crea un nuevo título (grupo) de exámenes.
 *
 * Solo administradores (guard en el Route Handler). Registra el evento en
 * `audit_log` de forma atómica con el INSERT.
 */
export async function titulosCreate(input: TituloCreateInput): Promise<Titulo> {
  const nombre = validateNombre(input.nombre);
  const orden = validateOrden(input.orden);

  try {
    return await withTransaction(async (tx) => {
      const rows = await tx<Titulo[]>`
        INSERT INTO examenes_titulos (nombre, orden)
        VALUES (${nombre}, ${orden})
        RETURNING id, nombre, orden, created_at
      `;
      const titulo = rows[0]!;

      await tx`
        INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
        VALUES (
          ${input.usuarioId},
          ${"examenes_titulos.create"},
          ${ENTITY_TYPE},
          ${titulo.id},
          ${tx.json({ nombre, orden })}
        )
      `;

      return titulo;
    });
  } catch (error) {
    mapUniqueNombreError(error);
  }
}

/**
 * Actualiza `nombre` y/o `orden` de un título.
 *
 * Solo administradores. Si cambia el nombre, la unicidad la garantiza el
 * constraint declarativo `UNIQUE (nombre)`.
 */
export async function titulosUpdate(input: TituloUpdateInput): Promise<Titulo> {
  const patch: { nombre?: string; orden?: number } = {};
  if (input.nombre !== undefined) patch.nombre = validateNombre(input.nombre);
  if (input.orden !== undefined) patch.orden = validateOrden(input.orden);

  if (Object.keys(patch).length === 0) {
    const sql = getSql();
    const rows = await sql<Titulo[]>`
      SELECT id, nombre, orden, created_at
      FROM examenes_titulos
      WHERE id = ${input.id}
      LIMIT 1
    `;
    const titulo = rows[0];
    if (!titulo) throw new Error(TITULO_NO_ENCONTRADO);
    return titulo;
  }

  try {
    return await withTransaction(async (tx) => {
      const existing = await tx<Titulo[]>`
        SELECT id, nombre, orden, created_at
        FROM examenes_titulos
        WHERE id = ${input.id}
        LIMIT 1
      `;
      const anterior = existing[0];
      if (!anterior) throw new Error(TITULO_NO_ENCONTRADO);

      const columns = Object.keys(patch) as Array<keyof typeof patch>;
      const rows = await tx<Titulo[]>`
        UPDATE examenes_titulos
        SET ${tx(patch, ...columns)}
        WHERE id = ${input.id}
        RETURNING id, nombre, orden, created_at
      `;
      const titulo = rows[0]!;

      await tx`
        INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
        VALUES (
          ${input.usuarioId},
          ${"examenes_titulos.update"},
          ${ENTITY_TYPE},
          ${titulo.id},
          ${tx.json({
            anterior: { nombre: anterior.nombre, orden: anterior.orden },
            nuevo: patch,
          })}
        )
      `;

      return titulo;
    });
  } catch (error) {
    mapUniqueNombreError(error);
  }
}

/**
 * Elimina un título.
 *
 * Solo administradores. Rechaza si tiene exámenes hijos activos (query
 * explícita para mensaje accionable); ante cualquier hijo restante (p.ej.
 * soft-deleted), el FK RESTRICT dispara `23503` que también mapea a
 * `TITULO_TIENE_EXAMENES`.
 */
export async function titulosDelete(input: TituloDeleteInput): Promise<Titulo> {
  try {
    return await withTransaction(async (tx) => {
      const existing = await tx<Titulo[]>`
        SELECT id, nombre, orden, created_at
        FROM examenes_titulos
        WHERE id = ${input.id}
        LIMIT 1
      `;
      const titulo = existing[0];
      if (!titulo) throw new Error(TITULO_NO_ENCONTRADO);

      const hijos = await tx<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM examenes
        WHERE titulo_id = ${input.id} AND activo = true
      `;
      const hijosActivos = Number(hijos[0]?.count ?? 0);
      if (hijosActivos > 0) throw new Error(TITULO_TIENE_EXAMENES);

      await tx`
        DELETE FROM examenes_titulos
        WHERE id = ${input.id}
      `;

      await tx`
        INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
        VALUES (
          ${input.usuarioId},
          ${"examenes_titulos.delete"},
          ${ENTITY_TYPE},
          ${titulo.id},
          ${tx.json({ nombre: titulo.nombre, orden: titulo.orden })}
        )
      `;

      return titulo;
    });
  } catch (error) {
    mapForeignKeyError(error);
  }
}

/**
 * Reordena los títulos asignando `orden = índice + 1` a cada ID recibido.
 *
 * Solo administradores. UPDATE batch en una única transacción; cualquier ID
 * inexistente aborta con `TITULO_NO_ENCONTRADO` (rollback completo).
 */
export async function titulosReorder(
  input: TituloReorderInput,
): Promise<string[]> {
  const ids = input.orderedIds;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.some((id) => typeof id !== "string" || id.length === 0)
  ) {
    throw new Error(VALIDACION_FALLIDA);
  }

  await withTransaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      const rows = await tx<{ id: string }[]>`
        UPDATE examenes_titulos
        SET orden = ${i + 1}
        WHERE id = ${ids[i]}
        RETURNING id
      `;
      if (!rows[0]) {
        throw new Error(TITULO_NO_ENCONTRADO);
      }
    }

    await tx`
      INSERT INTO audit_log (usuario_id, accion, entity_type, metadata)
      VALUES (
        ${input.usuarioId},
        ${"examenes_titulos.reorder"},
        ${ENTITY_TYPE},
        ${tx.json({ orderedIds: ids })}
      )
    `;
  });

  return ids;
}

// =============================================================================
// Exámenes (catálogo dentro de un título)
// =============================================================================

/**
 * Filas crudas de `examenes`. `precio_usd` es `numeric(12,2)` y postgres.js lo
 * devuelve como string, así que se normaliza a número en `toExamen`.
 */
interface ExamenRow {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: string | number;
  unidad: string | null;
  valores_referencia: string | null;
  activo: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Examen {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  valores_referencia: string | null;
  activo: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ExamenSearchItem {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  activo: boolean;
}

export interface ExamenCreateInput {
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad?: string;
  valores_referencia?: string;
  usuarioId: string;
}

export interface ExamenUpdateInput {
  id: string;
  nombre?: string;
  precio_usd?: number;
  unidad?: string;
  valores_referencia?: string;
  usuarioId: string;
}

function toExamen(row: ExamenRow): Examen {
  return {
    ...row,
    precio_usd:
      typeof row.precio_usd === "number" ? row.precio_usd : Number(row.precio_usd),
  };
}

function toExamenSearchItem(row: ExamenRow): ExamenSearchItem {
  return {
    id: row.id,
    titulo_id: row.titulo_id,
    nombre: row.nombre,
    precio_usd:
      typeof row.precio_usd === "number" ? row.precio_usd : Number(row.precio_usd),
    unidad: row.unidad,
    activo: row.activo,
  };
}

/**
 * ADR-11: `UNIQUE (titulo_id, nombre)` de `examenes` mapea el `23505` a
 * `EXAMEN_DUPLICADO_EN_TITULO`. El mismo nombre es válido en OTRO título.
 */
function mapUniqueExamenError(error: unknown): never {
  if (
    isPgError(error) &&
    error.code === "23505" &&
    error.constraint === EXAMEN_UNIQUE_CONSTRAINT
  ) {
    throw new Error(EXAMEN_DUPLICADO_EN_TITULO);
  }
  throw error;
}

/**
 * Mapeo combinado para `examenesCreate`: duplicado (23505) → `EXAMEN_DUPLICADO_EN_TITULO`,
 * FK inexistente (23503) → `TITULO_NO_ENCONTRADO` (red adicional al check explícito previo).
 */
function mapExamenCreateError(error: unknown): never {
  if (isPgError(error)) {
    if (error.code === "23505" && error.constraint === EXAMEN_UNIQUE_CONSTRAINT) {
      throw new Error(EXAMEN_DUPLICADO_EN_TITULO);
    }
    if (error.code === "23503") {
      throw new Error(TITULO_NO_ENCONTRADO);
    }
  }
  throw error;
}

function validateTituloId(tituloId: unknown): string {
  if (typeof tituloId !== "string" || tituloId.trim().length === 0) {
    throw new Error(VALIDACION_FALLIDA);
  }
  return tituloId;
}

function validatePrecioUsd(precio: unknown): number {
  if (typeof precio !== "number" || !Number.isFinite(precio) || precio < 0) {
    throw new Error(VALIDACION_FALLIDA);
  }
  return precio;
}

function trimOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function escapeLikePrefixTerm(raw: string): string {
  return raw.replace(/[\\%_]/g, "\\$&");
}

/**
 * Lista los exámenes ACTIVOS de un título, ordenados por nombre.
 *
 * Lectura pública para cualquier usuario autenticado (operador+); el guard de
 * rol se aplica en el Route Handler. Los soft-deleted (`activo = false`) quedan
 * fuera del listado default.
 */
export async function examenesListByTitulo(input: {
  titulo_id: string;
}): Promise<Examen[]> {
  const tituloId = validateTituloId(input.titulo_id);
  const sql = getSql();
  const rows = await sql<ExamenRow[]>`
    SELECT id, titulo_id, nombre, precio_usd, unidad, valores_referencia,
           activo, created_at, updated_at
    FROM examenes
    WHERE titulo_id = ${tituloId} AND activo = true
    ORDER BY nombre ASC, created_at ASC
  `;
  return rows.map(toExamen);
}

/**
 * Búsqueda prefix (`ILIKE term || '%'`) sobre `nombre`, top 10, solo activos.
 *
 * El índice B-tree `examenes_by_nombre_search` alcanza para 250+ exámenes;
 * pg_trgm queda como upgrade documentado si se necesita substring search.
 */
export async function examenesSearch(input: {
  term: string;
}): Promise<ExamenSearchItem[]> {
  const term = typeof input.term === "string" ? input.term.trim() : "";
  if (term.length === 0) {
    return [];
  }

  const pattern = `${escapeLikePrefixTerm(term)}%`;
  const sql = getSql();
  const rows = await sql<ExamenRow[]>`
    SELECT id, titulo_id, nombre, precio_usd, unidad, activo
    FROM examenes
    WHERE activo = true AND nombre ILIKE ${pattern} ESCAPE '\\'
    ORDER BY nombre ASC
    LIMIT ${EXAMEN_SEARCH_LIMIT}
  `;
  return rows.map(toExamenSearchItem);
}

/**
 * Retorna un examen por ID (incluye inactivos — necesario para reactivar).
 * Devuelve `null` si no existe; el handler lo mapea a 404.
 */
export async function examenesGetById(input: {
  id: string;
}): Promise<Examen | null> {
  const sql = getSql();
  const rows = await sql<ExamenRow[]>`
    SELECT id, titulo_id, nombre, precio_usd, unidad, valores_referencia,
           activo, created_at, updated_at
    FROM examenes
    WHERE id = ${input.id}
    LIMIT 1
  `;
  return rows[0] ? toExamen(rows[0]) : null;
}

/**
 * Crea un examen dentro de un título.
 *
 * Solo administradores. Valida que el `titulo_id` exista (`TITULO_NO_ENCONTRADO`)
 * y deja que el constraint `UNIQUE (titulo_id, nombre)` rechace duplicados
 * (`EXAMEN_DUPLICADO_EN_TITULO`). Registra el evento en `audit_log` de forma
 * atómica con el INSERT.
 */
export async function examenesCreate(input: ExamenCreateInput): Promise<Examen> {
  const tituloId = validateTituloId(input.titulo_id);
  const nombre = validateNombre(input.nombre);
  const precioUsd = validatePrecioUsd(input.precio_usd);
  const unidad = trimOrNull(input.unidad);
  const valoresReferencia = trimOrNull(input.valores_referencia);

  try {
    return await withTransaction(async (tx) => {
      const tituloRows = await tx<{ id: string }[]>`
        SELECT id FROM examenes_titulos WHERE id = ${tituloId} LIMIT 1
      `;
      if (!tituloRows[0]) throw new Error(TITULO_NO_ENCONTRADO);

      const rows = await tx<ExamenRow[]>`
        INSERT INTO examenes (titulo_id, nombre, precio_usd, unidad, valores_referencia)
        VALUES (${tituloId}, ${nombre}, ${precioUsd}, ${unidad}, ${valoresReferencia})
        RETURNING id, titulo_id, nombre, precio_usd, unidad, valores_referencia,
                  activo, created_at, updated_at
      `;
      const examen = toExamen(rows[0]!);

      await tx`
        INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
        VALUES (
          ${input.usuarioId},
          ${"examenes.create"},
          ${EXAMEN_ENTITY_TYPE},
          ${examen.id},
          ${tx.json({
            titulo_id: tituloId,
            nombre,
            precio_usd: precioUsd,
            unidad,
            valores_referencia: valoresReferencia,
          })}
        )
      `;

      return examen;
    });
  } catch (error) {
    mapExamenCreateError(error);
  }
}

/**
 * Actualiza `nombre`, `precio_usd`, `unidad` y/o `valores_referencia` de un
 * examen.
 *
 * Solo administradores. ADR-04: el UPDATE sólo toca `examenes` — nunca los
 * snapshots (`resultados_examenes` / `presupuestos_examenes`), que conservan su
 * propia copia de nombre/precio del momento.
 */
export async function examenesUpdate(input: ExamenUpdateInput): Promise<Examen> {
  const patch: {
    nombre?: string;
    precio_usd?: number;
    unidad?: string | null;
    valores_referencia?: string | null;
  } = {};
  if (input.nombre !== undefined) patch.nombre = validateNombre(input.nombre);
  if (input.precio_usd !== undefined) {
    patch.precio_usd = validatePrecioUsd(input.precio_usd);
  }
  if (input.unidad !== undefined) patch.unidad = trimOrNull(input.unidad);
  if (input.valores_referencia !== undefined) {
    patch.valores_referencia = trimOrNull(input.valores_referencia);
  }

  if (Object.keys(patch).length === 0) {
    const existing = await examenesGetById({ id: input.id });
    if (!existing) throw new Error(EXAMEN_NO_ENCONTRADO);
    return existing;
  }

  try {
    return await withTransaction(async (tx) => {
      const existing = await tx<ExamenRow[]>`
        SELECT id, titulo_id, nombre, precio_usd, unidad, valores_referencia,
               activo, created_at, updated_at
        FROM examenes
        WHERE id = ${input.id}
        LIMIT 1
      `;
      const anterior = existing[0];
      if (!anterior) throw new Error(EXAMEN_NO_ENCONTRADO);

      const columns = Object.keys(patch) as Array<keyof typeof patch>;
      const rows = await tx<ExamenRow[]>`
        UPDATE examenes
        SET ${tx(patch, ...columns)}, updated_at = now()
        WHERE id = ${input.id}
        RETURNING id, titulo_id, nombre, precio_usd, unidad, valores_referencia,
                  activo, created_at, updated_at
      `;
      const examen = toExamen(rows[0]!);

      await tx`
        INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
        VALUES (
          ${input.usuarioId},
          ${"examenes.update"},
          ${EXAMEN_ENTITY_TYPE},
          ${examen.id},
          ${tx.json({
            anterior: {
              nombre: anterior.nombre,
              precio_usd: toExamen(anterior).precio_usd,
              unidad: anterior.unidad,
              valores_referencia: anterior.valores_referencia,
            },
            nuevo: patch,
          })}
        )
      `;

      return examen;
    });
  } catch (error) {
    mapUniqueExamenError(error);
  }
}

/**
 * Soft-delete: marca `activo = false`.
 *
 * Solo administradores. Nunca borra la fila (ADR-04: snapshots dependen del FK).
 */
export async function examenesDeactivate(input: {
  id: string;
  usuarioId: string;
}): Promise<Examen> {
  return withTransaction(async (tx) => {
    const existing = await tx<ExamenRow[]>`
      SELECT id, titulo_id, nombre, precio_usd, unidad, valores_referencia,
             activo, created_at, updated_at
      FROM examenes
      WHERE id = ${input.id}
      LIMIT 1
    `;
    const anterior = existing[0];
    if (!anterior) throw new Error(EXAMEN_NO_ENCONTRADO);

    const rows = await tx<ExamenRow[]>`
      UPDATE examenes
      SET activo = false, updated_at = now()
      WHERE id = ${input.id}
      RETURNING id, titulo_id, nombre, precio_usd, unidad, valores_referencia,
                activo, created_at, updated_at
    `;
    const examen = toExamen(rows[0]!);

    await tx`
      INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
      VALUES (
        ${input.usuarioId},
        ${"examenes.deactivate"},
        ${EXAMEN_ENTITY_TYPE},
        ${examen.id},
        ${tx.json({ nombre: anterior.nombre, titulo_id: anterior.titulo_id })}
      )
    `;

    return examen;
  });
}

/**
 * Reactiva un examen previamente soft-deleted (`activo = true`).
 *
 * Solo administradores.
 */
export async function examenesActivate(input: {
  id: string;
  usuarioId: string;
}): Promise<Examen> {
  return withTransaction(async (tx) => {
    const existing = await tx<ExamenRow[]>`
      SELECT id, titulo_id, nombre, precio_usd, unidad, valores_referencia,
             activo, created_at, updated_at
      FROM examenes
      WHERE id = ${input.id}
      LIMIT 1
    `;
    const anterior = existing[0];
    if (!anterior) throw new Error(EXAMEN_NO_ENCONTRADO);

    const rows = await tx<ExamenRow[]>`
      UPDATE examenes
      SET activo = true, updated_at = now()
      WHERE id = ${input.id}
      RETURNING id, titulo_id, nombre, precio_usd, unidad, valores_referencia,
                activo, created_at, updated_at
    `;
    const examen = toExamen(rows[0]!);

    await tx`
      INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
      VALUES (
        ${input.usuarioId},
        ${"examenes.activate"},
        ${EXAMEN_ENTITY_TYPE},
        ${examen.id},
        ${tx.json({ nombre: anterior.nombre, titulo_id: anterior.titulo_id })}
      )
    `;

    return examen;
  });
}

export interface ImportBatchResult {
  titulos_creados: number;
  examenes_creados: number;
  examenes_actualizados: number;
  duplicados_ignorados: number; // No aplica si hacemos upsert ON CONFLICT DO UPDATE, pero podemos devolver 0 o contarlos
}

export interface ImportBatchInputRow {
  titulo: string;
  nombre: string;
  precio_usd: number;
  unidad?: string;
  valores_referencia?: string;
}

export async function examenesImportBatch(
  rows: ImportBatchInputRow[],
  usuarioId: string
): Promise<ImportBatchResult> {
  if (rows.length === 0) {
    return {
      titulos_creados: 0,
      examenes_creados: 0,
      examenes_actualizados: 0,
      duplicados_ignorados: 0,
    };
  }

  return withTransaction(async (tx) => {
    let titulosCreados = 0;
    let examenesCreados = 0;
    let examenesActualizados = 0;

    // Primero resolvemos todos los títulos para tener sus IDs
    const titulosMap = new Map<string, string>(); // nombre -> id

    // Obtener los títulos existentes
    const titulosExistentes = await tx<Titulo[]>`
      SELECT id, nombre FROM examenes_titulos
    `;
    for (const t of titulosExistentes) {
      titulosMap.set(t.nombre.toLowerCase().trim(), t.id);
    }

    let nextOrdenResult = await tx<{max_orden: number}[]>`
      SELECT COALESCE(MAX(orden), 0) as max_orden FROM examenes_titulos
    `;
    let nextOrden = Number(nextOrdenResult[0]?.max_orden ?? 0) + 1;

    // Crear los títulos que falten
    for (const row of rows) {
      const nomTitulo = row.titulo.trim();
      const lowerNom = nomTitulo.toLowerCase();
      if (!titulosMap.has(lowerNom)) {
        const newTitulo = await tx<Titulo[]>`
          INSERT INTO examenes_titulos (nombre, orden)
          VALUES (${nomTitulo}, ${nextOrden++})
          RETURNING id, nombre
        `;
        titulosMap.set(lowerNom, newTitulo[0]!.id);
        titulosCreados++;
        
        await tx`
          INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
          VALUES (
            ${usuarioId},
            ${"examenes_titulos.import_create"},
            ${ENTITY_TYPE},
            ${newTitulo[0]!.id},
            ${tx.json({ nombre: nomTitulo })}
          )
        `;
      }
    }

    // Insertar o actualizar exámenes
    // Postgres upsert: ON CONFLICT (titulo_id, nombre) DO UPDATE
    for (const row of rows) {
      const tituloId = titulosMap.get(row.titulo.trim().toLowerCase())!;
      const result = await tx<ExamenRow[]>`
        INSERT INTO examenes (titulo_id, nombre, precio_usd, unidad, valores_referencia, activo)
        VALUES (
          ${tituloId}, 
          ${row.nombre.trim()}, 
          ${row.precio_usd}, 
          ${row.unidad ?? null}, 
          ${row.valores_referencia ?? null},
          true
        )
        ON CONFLICT ON CONSTRAINT examenes_titulo_nombre_unique DO UPDATE SET
          precio_usd = EXCLUDED.precio_usd,
          unidad = EXCLUDED.unidad,
          valores_referencia = EXCLUDED.valores_referencia,
          activo = true,
          updated_at = now()
        RETURNING id, created_at, updated_at
      `;

      const ex = result[0]!;
      // Si created_at == updated_at, fue insert. Si no, fue update. 
      // (postgres.js devuelve Dates, we can compare timestamps roughly, or just check if updated_at > created_at by some margin. 
      // Actually, un insert fresh tiene created_at === updated_at o cercano).
      const isUpdate = ex.updated_at.getTime() > ex.created_at.getTime() + 1000;
      if (isUpdate) {
        examenesActualizados++;
      } else {
        examenesCreados++;
      }
    }
    
    await tx`
      INSERT INTO audit_log (usuario_id, accion, entity_type, metadata)
      VALUES (
        ${usuarioId},
        ${"examenes.import_batch"},
        ${EXAMEN_ENTITY_TYPE},
        ${tx.json({ 
          titulos_creados: titulosCreados, 
          examenes_creados: examenesCreados, 
          examenes_actualizados: examenesActualizados 
        })}
      )
    `;

    return {
      titulos_creados: titulosCreados,
      examenes_creados: examenesCreados,
      examenes_actualizados: examenesActualizados,
      duplicados_ignorados: 0,
    };
  });
}

