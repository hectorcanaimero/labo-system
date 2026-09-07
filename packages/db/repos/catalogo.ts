import type { Db } from "../sdk";

/**
 * Catálogos simples de mantenimiento: `(id, nombre unique, activo, orden)`.
 *
 * Los métodos de análisis (0017) y los tipos de análisis (0019) son la misma
 * tabla con distinto nombre y las mismas reglas, así que comparten
 * implementación en vez de copiarla:
 *
 *   - `examenes.metodo` y `examenes.tipo_analisis` siguen siendo TEXTO y
 *     guardan el nombre elegido, no una FK. Eso deja intactos los snapshots de
 *     las órdenes (`metodo_snap`, `tipo_analisis_snap`), que son registro
 *     histórico y tienen que conservar lo que decían el día de la orden.
 *   - Desactivar no borra: el valor sale del selector pero se sigue leyendo en
 *     los exámenes que ya lo tenían.
 *   - Renombrar NO reescribe los exámenes existentes, por la misma razón.
 */

const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";

export interface ItemCatalogo {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
  created_at: string;
}

export interface CodigosCatalogo {
  duplicado: string;
  noEncontrado: string;
  tablaFaltante: string;
}

export interface RepoCatalogo {
  list(db: Db, opts?: { incluirInactivos?: boolean }): Promise<ItemCatalogo[]>;
  create(db: Db, input: { nombre: unknown; usuarioId: string }): Promise<ItemCatalogo>;
  update(
    db: Db,
    input: { id: unknown; nombre?: unknown; activo?: unknown; usuarioId: string },
  ): Promise<ItemCatalogo>;
}

const COLS = "id, nombre, activo, orden, created_at";

type PgErrorLike = { code?: string; message?: string; details?: string };

function isPgError(error: unknown): error is PgErrorLike {
  return typeof error === "object" && error !== null;
}

function validateNombre(nombre: unknown): string {
  if (typeof nombre !== "string") throw new Error(VALIDACION_FALLIDA);
  const limpio = nombre.trim();
  if (limpio.length === 0 || limpio.length > 120) throw new Error(VALIDACION_FALLIDA);
  return limpio;
}

/**
 * Construye el repo de un catálogo.
 *
 * @param tabla nombre de la tabla en Postgres
 * @param constraintUnique nombre del UNIQUE sobre `nombre`, para distinguir el
 *   duplicado de cualquier otro 23505
 * @param codigos códigos de dominio que devuelve este catálogo
 */
export function crearRepoCatalogo(
  tabla: string,
  constraintUnique: string,
  codigos: CodigosCatalogo,
): RepoCatalogo {
  function isUniqueViolation(err: unknown): boolean {
    if (!isPgError(err)) return false;
    if (err.code !== "23505") return false;
    return `${err.message ?? ""} ${err.details ?? ""}`.includes(constraintUnique);
  }

  /**
   * La tabla no existe todavía: falta aplicar la migración en ese entorno. Se
   * distingue del resto para que la UI diga qué hacer en vez de un 500 opaco.
   */
  function esTablaFaltante(err: unknown): boolean {
    if (!isPgError(err)) return false;
    if (err.code === "42P01" || err.code === "PGRST205") return true;
    const message = (err.message ?? "").toLowerCase();
    return (
      message.includes(tabla) &&
      (message.includes("does not exist") || message.includes("schema cache"))
    );
  }

  function fallar(scope: string, err: PgErrorLike): never {
    if (esTablaFaltante(err)) throw new Error(codigos.tablaFaltante);
    throw new Error(`${scope}: ${err.message ?? "error desconocido"}`);
  }

  async function auditBestEffort(
    db: Db,
    row: { usuarioId: string; accion: string; entityId: string; metadata: Record<string, unknown> },
  ): Promise<void> {
    const { error } = await db.from("audit_log").insert({
      usuario_id: row.usuarioId,
      accion: `${tabla}.${row.accion}`,
      entity_type: tabla,
      entity_id: row.entityId,
      metadata: row.metadata,
    });
    if (error) console.warn(`[audit ${tabla}.${row.accion}]`, error.message);
  }

  return {
    async list(db, opts = {}) {
      let query = db.from(tabla).select(COLS);
      if (!opts.incluirInactivos) query = query.eq("activo", true);

      const { data, error } = await query
        .order("orden", { ascending: true })
        .order("nombre", { ascending: true });
      if (error) fallar(`${tabla}.list`, error);
      return (data ?? []) as ItemCatalogo[];
    },

    async create(db, input) {
      const nombre = validateNombre(input.nombre);

      // Se agrega al final. `max(orden)` con la tabla vacía devuelve null → 0.
      const ultimoRes = await db
        .from(tabla)
        .select("orden")
        .order("orden", { ascending: false })
        .limit(1);
      if (ultimoRes.error) fallar(`${tabla}.create orden`, ultimoRes.error);
      const orden = ((ultimoRes.data?.[0] as { orden: number } | undefined)?.orden ?? 0) + 1;

      const { data, error } = await db
        .from(tabla)
        .insert({ nombre, orden })
        .select(COLS)
        .limit(1);
      if (error) {
        if (isUniqueViolation(error)) throw new Error(codigos.duplicado);
        fallar(`${tabla}.create`, error);
      }
      const item = data?.[0] as ItemCatalogo | undefined;
      if (!item) throw new Error(`${tabla}.create: sin fila retornada`);

      await auditBestEffort(db, {
        usuarioId: input.usuarioId,
        accion: "create",
        entityId: item.id,
        metadata: { nombre },
      });

      return item;
    },

    async update(db, input) {
      if (typeof input.id !== "string" || input.id.trim().length === 0) {
        throw new Error(VALIDACION_FALLIDA);
      }

      const patch: { nombre?: string; activo?: boolean } = {};
      if (input.nombre !== undefined) patch.nombre = validateNombre(input.nombre);
      if (input.activo !== undefined) {
        if (typeof input.activo !== "boolean") throw new Error(VALIDACION_FALLIDA);
        patch.activo = input.activo;
      }

      const anteriorRes = await db.from(tabla).select(COLS).eq("id", input.id).limit(1);
      if (anteriorRes.error) fallar(`${tabla}.update`, anteriorRes.error);
      const anterior = anteriorRes.data?.[0] as ItemCatalogo | undefined;
      if (!anterior) throw new Error(codigos.noEncontrado);

      if (Object.keys(patch).length === 0) return anterior;

      const { data, error } = await db
        .from(tabla)
        .update(patch)
        .eq("id", input.id)
        .select(COLS);
      if (error) {
        if (isUniqueViolation(error)) throw new Error(codigos.duplicado);
        fallar(`${tabla}.update`, error);
      }
      const item = data?.[0] as ItemCatalogo | undefined;
      if (!item) throw new Error(codigos.noEncontrado);

      await auditBestEffort(db, {
        usuarioId: input.usuarioId,
        accion: "update",
        entityId: item.id,
        metadata: {
          anterior: { nombre: anterior.nombre, activo: anterior.activo },
          nuevo: patch,
        },
      });

      return item;
    },
  };
}
