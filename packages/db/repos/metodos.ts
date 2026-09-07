import type { Db } from "../sdk";

/**
 * Catálogo de métodos de análisis (migración 0017).
 *
 * Es la fuente del selector de método en el examen. `examenes.metodo` sigue
 * siendo texto y guarda el NOMBRE elegido, no una FK: así el snapshot
 * `ordenes_examenes.metodo_snap` conserva lo que decía el día de la orden
 * aunque después el método se renombre o se desactive.
 *
 * Desactivar no borra: el método sale del selector pero se sigue leyendo en
 * los exámenes que ya lo tenían.
 */

export const METODO_DUPLICADO = "METODO_DUPLICADO";
export const METODO_NO_ENCONTRADO = "METODO_NO_ENCONTRADO";
export const METODOS_TABLA_FALTANTE = "METODOS_TABLA_FALTANTE";

const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";
const NOMBRE_UNIQUE_CONSTRAINT = "metodos_analisis_nombre_unique";
const ENTITY_TYPE = "metodos_analisis";
const METODO_COLS = "id, nombre, activo, orden, created_at";

export interface MetodoAnalisis {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
  created_at: string;
}

type PgErrorLike = { code?: string; message?: string; details?: string };

function isPgError(error: unknown): error is PgErrorLike {
  return typeof error === "object" && error !== null;
}

function isUniqueViolation(err: unknown): boolean {
  if (!isPgError(err)) return false;
  if (err.code !== "23505") return false;
  return `${err.message ?? ""} ${err.details ?? ""}`.includes(NOMBRE_UNIQUE_CONSTRAINT);
}

/**
 * La tabla no existe todavía: falta aplicar la 0017 en ese entorno. Se
 * distingue del resto para que la UI pueda decir qué hacer en vez de un 500
 * opaco, igual que `enlaces_resultado`.
 */
function esTablaFaltante(err: unknown): boolean {
  if (!isPgError(err)) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const message = (err.message ?? "").toLowerCase();
  return (
    message.includes("metodos_analisis") &&
    (message.includes("does not exist") || message.includes("schema cache"))
  );
}

function fallar(scope: string, err: PgErrorLike): never {
  if (esTablaFaltante(err)) throw new Error(METODOS_TABLA_FALTANTE);
  throw new Error(`${scope}: ${err.message ?? "error desconocido"}`);
}

function validateNombre(nombre: unknown): string {
  if (typeof nombre !== "string") throw new Error(VALIDACION_FALLIDA);
  const limpio = nombre.trim();
  if (limpio.length === 0 || limpio.length > 120) throw new Error(VALIDACION_FALLIDA);
  return limpio;
}

async function auditBestEffort(
  db: Db,
  row: { usuarioId: string; accion: string; entityId: string; metadata: Record<string, unknown> },
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    usuario_id: row.usuarioId,
    accion: row.accion,
    entity_type: ENTITY_TYPE,
    entity_id: row.entityId,
    metadata: row.metadata,
  });
  if (error) console.warn(`[audit ${row.accion}]`, error.message);
}

/**
 * Lista los métodos. Por defecto sólo los activos (lo que necesita el
 * selector); `incluirInactivos` es para la pantalla de administración.
 */
export async function list(
  db: Db,
  opts: { incluirInactivos?: boolean } = {},
): Promise<MetodoAnalisis[]> {
  let query = db.from("metodos_analisis").select(METODO_COLS);
  if (!opts.incluirInactivos) query = query.eq("activo", true);

  const { data, error } = await query
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) fallar("metodos.list", error);
  return (data ?? []) as MetodoAnalisis[];
}

export async function create(
  db: Db,
  input: { nombre: unknown; usuarioId: string },
): Promise<MetodoAnalisis> {
  const nombre = validateNombre(input.nombre);

  // Se agrega al final. `max(orden)` con la tabla vacía devuelve null → 0.
  const ultimoRes = await db
    .from("metodos_analisis")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1);
  if (ultimoRes.error) fallar("metodos.create orden", ultimoRes.error);
  const orden = ((ultimoRes.data?.[0] as { orden: number } | undefined)?.orden ?? 0) + 1;

  const { data, error } = await db
    .from("metodos_analisis")
    .insert({ nombre, orden })
    .select(METODO_COLS)
    .limit(1);
  if (error) {
    if (isUniqueViolation(error)) throw new Error(METODO_DUPLICADO);
    fallar("metodos.create", error);
  }
  const metodo = data?.[0] as MetodoAnalisis | undefined;
  if (!metodo) throw new Error("metodos.create: sin fila retornada");

  await auditBestEffort(db, {
    usuarioId: input.usuarioId,
    accion: "metodos_analisis.create",
    entityId: metodo.id,
    metadata: { nombre },
  });

  return metodo;
}

/**
 * Renombra o activa/desactiva un método.
 *
 * Renombrar NO reescribe `examenes.metodo` ni `ordenes_examenes.metodo_snap`:
 * los exámenes existentes conservan el texto que tenían. Es deliberado — el
 * snapshot de la orden es un registro histórico — pero significa que después
 * de renombrar hay exámenes apuntando a un nombre que ya no está en la lista.
 */
export async function update(
  db: Db,
  input: { id: unknown; nombre?: unknown; activo?: unknown; usuarioId: string },
): Promise<MetodoAnalisis> {
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    throw new Error(VALIDACION_FALLIDA);
  }

  const patch: { nombre?: string; activo?: boolean } = {};
  if (input.nombre !== undefined) patch.nombre = validateNombre(input.nombre);
  if (input.activo !== undefined) {
    if (typeof input.activo !== "boolean") throw new Error(VALIDACION_FALLIDA);
    patch.activo = input.activo;
  }

  const anteriorRes = await db
    .from("metodos_analisis")
    .select(METODO_COLS)
    .eq("id", input.id)
    .limit(1);
  if (anteriorRes.error) fallar("metodos.update", anteriorRes.error);
  const anterior = anteriorRes.data?.[0] as MetodoAnalisis | undefined;
  if (!anterior) throw new Error(METODO_NO_ENCONTRADO);

  if (Object.keys(patch).length === 0) return anterior;

  const { data, error } = await db
    .from("metodos_analisis")
    .update(patch)
    .eq("id", input.id)
    .select(METODO_COLS)
    .limit(1);
  if (error) {
    if (isUniqueViolation(error)) throw new Error(METODO_DUPLICADO);
    fallar("metodos.update", error);
  }
  const metodo = data?.[0] as MetodoAnalisis | undefined;
  if (!metodo) throw new Error(METODO_NO_ENCONTRADO);

  await auditBestEffort(db, {
    usuarioId: input.usuarioId,
    accion: "metodos_analisis.update",
    entityId: metodo.id,
    metadata: {
      anterior: { nombre: anterior.nombre, activo: anterior.activo },
      nuevo: patch,
    },
  });

  return metodo;
}
