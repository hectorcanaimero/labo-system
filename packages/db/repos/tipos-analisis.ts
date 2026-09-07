import { crearRepoCatalogo, type ItemCatalogo } from "./catalogo";

/**
 * Catálogo de tipos de análisis (migración 0019).
 *
 * Antes el vocabulario era un enum fijo en `packages/lib/schemas/examen.ts`
 * (`TIPO_ANALISIS_VALUES`): ampliarlo requería tocar código y desplegar. Ahora
 * lo administra el admin desde Config, igual que los métodos.
 *
 * `examenes.tipo_analisis` sigue siendo texto y guarda el NOMBRE elegido, no
 * una FK, para no romper `ordenes_examenes.tipo_analisis_snap`.
 */

export const TIPO_DUPLICADO = "TIPO_DUPLICADO";
export const TIPO_NO_ENCONTRADO = "TIPO_NO_ENCONTRADO";
export const TIPOS_TABLA_FALTANTE = "TIPOS_TABLA_FALTANTE";

export type TipoAnalisisItem = ItemCatalogo;

const repo = crearRepoCatalogo("tipos_analisis", "tipos_analisis_nombre_unique", {
  duplicado: TIPO_DUPLICADO,
  noEncontrado: TIPO_NO_ENCONTRADO,
  tablaFaltante: TIPOS_TABLA_FALTANTE,
});

export const list = repo.list;
export const create = repo.create;
export const update = repo.update;
