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
  if (vigente.error) throw new Error(`enlaces.crearOReutilizar: ${vigente.error.message}`);

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
  if (ins.error) throw new Error(`enlaces.crearOReutilizar insert: ${ins.error.message}`);

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
  if (error) throw new Error(`enlaces.getBySlug: ${error.message}`);

  const row = (data?.[0] as EnlaceResultado | undefined) ?? null;
  if (!row) return null;
  if (new Date(row.expira_en).getTime() <= Date.now()) return null;
  return row;
}
