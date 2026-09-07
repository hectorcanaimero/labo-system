import { crearRepoCatalogo, type ItemCatalogo } from "./catalogo";

/**
 * Catálogo de métodos de análisis (migración 0017).
 *
 * Es la fuente del selector de método en el examen. `examenes.metodo` sigue
 * siendo texto y guarda el NOMBRE elegido, no una FK: así el snapshot
 * `ordenes_examenes.metodo_snap` conserva lo que decía el día de la orden
 * aunque después el método se renombre o se desactive.
 *
 * La implementación vive en `catalogo.ts`, compartida con los tipos de
 * análisis (0019), que tienen exactamente las mismas reglas.
 */

export const METODO_DUPLICADO = "METODO_DUPLICADO";
export const METODO_NO_ENCONTRADO = "METODO_NO_ENCONTRADO";
export const METODOS_TABLA_FALTANTE = "METODOS_TABLA_FALTANTE";

export type MetodoAnalisis = ItemCatalogo;

const repo = crearRepoCatalogo("metodos_analisis", "metodos_analisis_nombre_unique", {
  duplicado: METODO_DUPLICADO,
  noEncontrado: METODO_NO_ENCONTRADO,
  tablaFaltante: METODOS_TABLA_FALTANTE,
});

export const list = repo.list;
export const create = repo.create;
export const update = repo.update;
