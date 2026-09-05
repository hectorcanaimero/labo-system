/**
 * Regla de entrega de una orden (resultado).
 *
 * Una orden sólo puede pasar a `Entregada` si TODAS sus líneas tienen valor.
 * Un informe con resultados en blanco no puede salir del laboratorio: la
 * regla se aplica en el servidor (`@labo/db/repos/ordenes`) y se anticipa en
 * el formulario para que el operador vea qué falta antes de guardar.
 */

/** Código de error de dominio: se intentó entregar con líneas sin valor. */
export const ENTREGA_REQUIERE_VALORES = "ENTREGA_REQUIERE_VALORES";

export interface LineaConValor {
  valor: string | null | undefined;
  /** Nombre para mostrar en el mensaje; opcional. */
  nombre_snap?: string | null;
}

/** `true` si el valor cuenta como cargado (no vacío ni sólo espacios). */
export function tieneValor(valor: string | null | undefined): boolean {
  return typeof valor === "string" && valor.trim().length > 0;
}

/** Índices de las líneas sin valor, en el orden recibido. */
export function indicesSinValor(lineas: ReadonlyArray<LineaConValor>): number[] {
  const out: number[] = [];
  lineas.forEach((linea, index) => {
    if (!tieneValor(linea.valor)) out.push(index);
  });
  return out;
}

/** Nombres de las líneas sin valor (o "Examen N" si no hay nombre). */
export function nombresSinValor(lineas: ReadonlyArray<LineaConValor>): string[] {
  return indicesSinValor(lineas).map(
    (i) => lineas[i]?.nombre_snap?.trim() || `Examen ${i + 1}`,
  );
}

/** Una orden sin líneas tampoco se puede entregar: no hay nada que informar. */
export function puedeEntregarse(lineas: ReadonlyArray<LineaConValor>): boolean {
  return lineas.length > 0 && indicesSinValor(lineas).length === 0;
}

/**
 * Lanza `ENTREGA_REQUIERE_VALORES` si la orden no puede entregarse. Pensado
 * para el repo: el caller ya decidió que el estado destino es `Entregada`.
 */
export function assertPuedeEntregarse(lineas: ReadonlyArray<LineaConValor>): void {
  if (!puedeEntregarse(lineas)) throw new Error(ENTREGA_REQUIERE_VALORES);
}

/** Mensaje para el operador, con los nombres de lo que falta. */
export function mensajeSinValor(lineas: ReadonlyArray<LineaConValor>): string {
  if (lineas.length === 0) return "La orden no tiene exámenes: no hay nada que entregar.";
  const nombres = nombresSinValor(lineas);
  if (nombres.length === 0) return "";
  const lista = nombres.length <= 3 ? nombres.join(", ") : `${nombres.slice(0, 3).join(", ")} y ${nombres.length - 3} más`;
  return nombres.length === 1
    ? `Falta el valor de ${lista}. No se puede entregar un resultado incompleto.`
    : `Faltan los valores de ${lista}. No se puede entregar un resultado incompleto.`;
}
