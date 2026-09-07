/**
 * Lógica de columnas del tablero, sin React.
 *
 * Vive aparte del componente porque es lo único del tablero que se puede
 * probar sin montar nada: qué columnas hay, en qué orden, cuáles se colapsan
 * y a dónde puede ir una tarjeta. El resto es layout.
 */

/** Definición de una columna, tal como la declara cada dominio. */
export interface PipelineColumnDef<E extends string> {
  estado: E;
  /** Texto del encabezado. Por defecto, el propio estado. */
  label?: string;
  /**
   * Clase de color del punto del encabezado y del borde de la tarjeta. La
   * declara el dominio: el tablero no conoce los colores de ningún flujo.
   */
  accentClassName: string;
  /**
   * Terminal negativo (Rechazado, Cancelado, Anulada). Va al final y arranca
   * colapsado: son estados en los que las tarjetas se estacionan, no etapas
   * por las que pasan.
   */
  terminal?: boolean;
}

export interface PipelineColumn<E extends string, C> extends PipelineColumnDef<E> {
  cards: C[];
  count: number;
}

/**
 * Reparte las tarjetas en sus columnas, dejando las terminales al final.
 *
 * El orden de las activas es el que declara el dominio —es el orden del
 * proceso y de eso depende que el tablero se lea como un flujo—, así que no
 * se reordena por conteo ni por nada.
 */
export function buildColumns<E extends string, C extends { estado: E }>(
  defs: readonly PipelineColumnDef<E>[],
  cards: readonly C[],
): PipelineColumn<E, C>[] {
  const byEstado = new Map<E, C[]>();
  for (const def of defs) byEstado.set(def.estado, []);
  for (const card of cards) {
    // Una tarjeta con un estado que no es columna no se pierde en silencio:
    // se ignora acá y el dominio decide si eso puede pasar.
    byEstado.get(card.estado)?.push(card);
  }

  const activas = defs.filter((def) => !def.terminal);
  const terminales = defs.filter((def) => def.terminal);

  return [...activas, ...terminales].map((def) => {
    const cardsDeColumna = byEstado.get(def.estado) ?? [];
    return { ...def, cards: cardsDeColumna, count: cardsDeColumna.length };
  });
}

/**
 * Estados a los que se puede mover una tarjeta, en el orden de las columnas.
 *
 * Se cruza con las columnas declaradas a propósito: una transición hacia un
 * estado que el tablero no muestra haría desaparecer la tarjeta.
 */
export function moveTargets<E extends string>(
  defs: readonly PipelineColumnDef<E>[],
  estadoActual: E,
  transiciones: Readonly<Record<E, readonly E[]>>,
): E[] {
  const permitidos = new Set(transiciones[estadoActual] ?? []);
  return defs
    .map((def) => def.estado)
    .filter((estado) => estado !== estadoActual && permitidos.has(estado));
}

/**
 * Estado inicial de colapso: las terminales arrancan cerradas.
 *
 * Se calcula desde las definiciones y no se guarda, así una columna terminal
 * nueva aparece colapsada sin que haya que tocar nada.
 */
export function initialCollapsed<E extends string>(
  defs: readonly PipelineColumnDef<E>[],
): Set<E> {
  return new Set(defs.filter((def) => def.terminal).map((def) => def.estado));
}
