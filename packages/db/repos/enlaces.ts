import { generarSlug } from "@labo/lib/enlace-resultado";

import type { Db } from "../sdk";

/**
 * Enlaces cortos para compartir una orden con el paciente (GUR-18).
 *
 * Tabla `enlaces_resultado` (migración 0014). Todas estas funciones se llaman
 * desde Route Handlers con el cliente admin: el slug se resuelve para usuarios
 * anónimos, así que la lectura NO puede depender del JWT del paciente (no
 * tiene) ni exponerse por la anon key (RLS lo bloquea).
 */

export const ENLACE_NO_ENCONTRADO = "ENLACE_NO_ENCONTRADO";

/**
 * La tabla no existe todavía: falta aplicar la migración 0014 en ese entorno.
 * Se distingue del resto de errores para que el endpoint pueda decir QUÉ hacer
 * en vez de un 500 opaco.
 */
export const ENLACES_TABLA_FALTANTE = "ENLACES_TABLA_FALTANTE";

/** Ídem para `enlaces_verificacion` (migración 0016). */
export const VERIFICACION_TABLA_FALTANTE = "VERIFICACION_TABLA_FALTANTE";

/**
 * PostgREST reporta la tabla ausente de dos formas según si el error viene del
 * planner (`42P01 undefined_table`) o del schema cache (`PGRST205`, típico
 * cuando la migración corrió pero el cache no se recargó).
 */
function esTablaFaltante(
  error: { code?: string; message?: string },
  tabla = "enlaces_resultado",
): boolean {
  const code = error.code ?? "";
  if (code === "42P01" || code === "PGRST205") return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes(tabla) &&
    (message.includes("does not exist") || message.includes("schema cache"))
  );
}

function fallar(scope: string, error: { code?: string; message?: string }): never {
  if (esTablaFaltante(error)) throw new Error(ENLACES_TABLA_FALTANTE);
  throw new Error(`${scope}: ${error.message ?? "error desconocido"}`);
}

const ENLACE_COLS = "id, slug, orden_id, expira_en, created_at, created_by";

/** Vigencia por defecto del enlace. */
export const DIAS_VIGENCIA_DEFAULT = 30;

export interface EnlaceResultado {
  id: string;
  slug: string;
  orden_id: string;
  expira_en: string;
  created_at: string;
  created_by: string;
}

/**
 * Devuelve el enlace vigente de la orden o crea uno nuevo.
 *
 * Reutilizar evita que cada reenvío (paciente que pide el link de nuevo)
 * invalide el anterior y deje al paciente con una URL muerta en el chat.
 */
export async function crearOReutilizar(
  db: Db,
  ordenId: string,
  userId: string,
  diasVigencia: number = DIAS_VIGENCIA_DEFAULT,
): Promise<EnlaceResultado> {
  const ahora = new Date();

  const vigente = await db
    .from("enlaces_resultado")
    .select(ENLACE_COLS)
    .eq("orden_id", ordenId)
    .gt("expira_en", ahora.toISOString())
    .order("expira_en", { ascending: false })
    .limit(1);
  if (vigente.error) fallar("enlaces.crearOReutilizar", vigente.error);

  const existente = (vigente.data?.[0] as EnlaceResultado | undefined) ?? null;
  if (existente) return existente;

  const expira = new Date(ahora.getTime() + diasVigencia * 24 * 60 * 60 * 1000);
  const ins = await db
    .from("enlaces_resultado")
    .insert({
      slug: generarSlug(),
      orden_id: ordenId,
      expira_en: expira.toISOString(),
      created_by: userId,
    })
    .select(ENLACE_COLS)
    .limit(1);
  if (ins.error) fallar("enlaces.crearOReutilizar insert", ins.error);

  const creado = (ins.data?.[0] as EnlaceResultado | undefined) ?? null;
  if (!creado) throw new Error("enlaces.crearOReutilizar: insert sin retorno");
  return creado;
}

/**
 * Resuelve un slug público. Devuelve `null` si no existe o ya venció — la
 * página pública trata ambos casos como 404 para no filtrar qué enlaces
 * existieron.
 */
export async function getBySlug(db: Db, slug: string): Promise<EnlaceResultado | null> {
  const { data, error } = await db
    .from("enlaces_resultado")
    .select(ENLACE_COLS)
    .eq("slug", slug)
    .limit(1);
  if (error) fallar("enlaces.getBySlug", error);

  const row = (data?.[0] as EnlaceResultado | undefined) ?? null;
  if (!row) return null;
  if (new Date(row.expira_en).getTime() <= Date.now()) return null;
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enlaces de presupuesto (migración 0021, F7.2.T7)
//
// Espejo de crearOReutilizar/getBySlug de arriba, contra `presupuestos` en
// vez de `ordenes`. Vigencia 7 días por defecto: más larga que la de
// resultados porque el link se puede releer una semana aunque la cotización
// (24 h) ya haya vencido.
// ─────────────────────────────────────────────────────────────────────────────

export const ENLACES_PRESUPUESTO_TABLA_FALTANTE = "ENLACES_PRESUPUESTO_TABLA_FALTANTE";

function fallarPresupuesto(scope: string, error: { code?: string; message?: string }): never {
  if (esTablaFaltante(error, "enlaces_presupuesto")) {
    throw new Error(ENLACES_PRESUPUESTO_TABLA_FALTANTE);
  }
  throw new Error(`${scope}: ${error.message ?? "error desconocido"}`);
}

const ENLACE_PRESUPUESTO_COLS = "id, slug, presupuesto_id, expira_en, created_at, created_by";

/** Vigencia del enlace de presupuesto: 7 días (F7.2.T7). */
export const DIAS_VIGENCIA_PRESUPUESTO_DEFAULT = 7;

export interface EnlacePresupuesto {
  id: string;
  slug: string;
  presupuesto_id: string;
  expira_en: string;
  created_at: string;
  created_by: string;
}

/**
 * Devuelve el enlace vigente del presupuesto o crea uno nuevo. Reutilizar
 * evita que reenviar (o que el paciente pida el link de nuevo) invalide el
 * anterior.
 */
export async function crearOReutilizarPresupuesto(
  db: Db,
  presupuestoId: string,
  userId: string,
  diasVigencia: number = DIAS_VIGENCIA_PRESUPUESTO_DEFAULT,
): Promise<EnlacePresupuesto> {
  const ahora = new Date();

  const vigente = await db
    .from("enlaces_presupuesto")
    .select(ENLACE_PRESUPUESTO_COLS)
    .eq("presupuesto_id", presupuestoId)
    .gt("expira_en", ahora.toISOString())
    .order("expira_en", { ascending: false })
    .limit(1);
  if (vigente.error) fallarPresupuesto("enlaces.crearOReutilizarPresupuesto", vigente.error);

  const existente = (vigente.data?.[0] as EnlacePresupuesto | undefined) ?? null;
  if (existente) return existente;

  const expira = new Date(ahora.getTime() + diasVigencia * 24 * 60 * 60 * 1000);
  const ins = await db
    .from("enlaces_presupuesto")
    .insert({
      slug: generarSlug(),
      presupuesto_id: presupuestoId,
      expira_en: expira.toISOString(),
      created_by: userId,
    })
    .select(ENLACE_PRESUPUESTO_COLS)
    .limit(1);
  if (ins.error) fallarPresupuesto("enlaces.crearOReutilizarPresupuesto insert", ins.error);

  const creado = (ins.data?.[0] as EnlacePresupuesto | undefined) ?? null;
  if (!creado) throw new Error("enlaces.crearOReutilizarPresupuesto: insert sin retorno");
  return creado;
}

/**
 * Resuelve un slug público de presupuesto. `null` si no existe o ya venció —
 * la página pública trata ambos casos como 404.
 */
export async function getPresupuestoBySlug(
  db: Db,
  slug: string,
): Promise<EnlacePresupuesto | null> {
  const { data, error } = await db
    .from("enlaces_presupuesto")
    .select(ENLACE_PRESUPUESTO_COLS)
    .eq("slug", slug)
    .limit(1);
  if (error) fallarPresupuesto("enlaces.getPresupuestoBySlug", error);

  const row = (data?.[0] as EnlacePresupuesto | undefined) ?? null;
  if (!row) return null;
  if (new Date(row.expira_en).getTime() <= Date.now()) return null;
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enlaces de verificación (migración 0016)
//
// El QR del informe apunta acá. A diferencia del enlace del paciente, este NO
// vence: el papel con el QR se escanea meses después y un "enlace vencido"
// sobre un informe legítimo haría desconfiar de él. Tampoco da acceso al
// resultado: `/v/[slug]` sólo confirma que el informe existe.
// ─────────────────────────────────────────────────────────────────────────────

const VERIFICACION_COLS = "id, slug, orden_id, created_at, created_by";

export interface EnlaceVerificacion {
  id: string;
  slug: string;
  orden_id: string;
  created_at: string;
  created_by: string | null;
}

function fallarVerificacion(
  scope: string,
  error: { code?: string; message?: string },
): never {
  if (esTablaFaltante(error, "enlaces_verificacion")) {
    throw new Error(VERIFICACION_TABLA_FALTANTE);
  }
  throw new Error(`${scope}: ${error.message ?? "error desconocido"}`);
}

/**
 * Devuelve el enlace de verificación de la orden, o `null` si no tiene.
 *
 * No crea nada: sirve para los caminos que no deben escribir (por ejemplo,
 * decidir si el PDF lleva QR sin tocar la base cuando no hace falta).
 */
export async function getVerificacionPorOrden(
  db: Db,
  ordenId: string,
): Promise<EnlaceVerificacion | null> {
  const { data, error } = await db
    .from("enlaces_verificacion")
    .select(VERIFICACION_COLS)
    .eq("orden_id", ordenId)
    // `id` desempata: si una carrera dejó dos enlaces con el mismo
    // `created_at`, sin criterio estable el PDF regenerado podría tomar uno
    // distinto y el QR dejaría de coincidir con el de la copia impresa.
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);
  if (error) fallarVerificacion("enlaces.getVerificacionPorOrden", error);
  return (data?.[0] as EnlaceVerificacion | undefined) ?? null;
}

/**
 * Devuelve el enlace de verificación de la orden y lo crea si no existe.
 *
 * Reutilizar es lo que hace que un PDF regenerado conserve el mismo slug: si
 * cada emisión creara uno nuevo, el QR de una copia impresa dejaría de
 * coincidir con el de la copia digital.
 */
export async function crearOReutilizarVerificacion(
  db: Db,
  ordenId: string,
  userId: string | null = null,
): Promise<EnlaceVerificacion> {
  const existente = await getVerificacionPorOrden(db, ordenId);
  if (existente) return existente;

  const ins = await db
    .from("enlaces_verificacion")
    .insert({ slug: generarSlug(), orden_id: ordenId, created_by: userId })
    .select(VERIFICACION_COLS)
    .limit(1);

  if (ins.error) {
    // Carrera: dos emisiones simultáneas del mismo informe. El UNIQUE sobre
    // `slug` no la cubre (cada una genera el suyo), así que se resuelve
    // releyendo: gana el que insertó primero y ambos devuelven el mismo.
    const previo = await getVerificacionPorOrden(db, ordenId);
    if (previo) return previo;
    fallarVerificacion("enlaces.crearOReutilizarVerificacion", ins.error);
  }

  const creado = (ins.data?.[0] as EnlaceVerificacion | undefined) ?? null;
  if (!creado) throw new Error("enlaces.crearOReutilizarVerificacion: insert sin retorno");
  return creado;
}

/** Resuelve un slug de verificación. `null` si no existe. Nunca vence. */
export async function getVerificacionBySlug(
  db: Db,
  slug: string,
): Promise<EnlaceVerificacion | null> {
  const { data, error } = await db
    .from("enlaces_verificacion")
    .select(VERIFICACION_COLS)
    .eq("slug", slug)
    .limit(1);
  if (error) fallarVerificacion("enlaces.getVerificacionBySlug", error);
  return (data?.[0] as EnlaceVerificacion | undefined) ?? null;
}
