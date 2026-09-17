/**
 * Formateo de fechas en la zona del laboratorio.
 *
 * El servidor corre en UTC. Formatear una fecha en UTC y presentarla como
 * local corre el día: un informe emitido 21:30 en Caracas sale fechado al día
 * siguiente. Por eso la zona va explícita y en un solo lugar, compartido por
 * el PDF y las páginas públicas.
 */

/** Zona horaria del laboratorio. Venezuela no aplica horario de verano. */
export const LAB_TIMEZONE = "America/Caracas";

function partes(
  value: Date | string | null | undefined,
  opciones: Intl.DateTimeFormatOptions,
): Record<string, string> | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const salida: Record<string, string> = {};
  for (const parte of new Intl.DateTimeFormat("en-GB", {
    timeZone: LAB_TIMEZONE,
    ...opciones,
  }).formatToParts(d)) {
    salida[parte.type] = parte.value;
  }
  return salida;
}

/** `dd/mm/aaaa` en la zona del laboratorio. */
export function formatFechaLab(value: Date | string | null | undefined): string {
  const p = partes(value, { year: "numeric", month: "2-digit", day: "2-digit" });
  if (!p) return "—";
  return `${p.day}/${p.month}/${p.year}`;
}

/** `dd/mm/aaaa hh:mm` en la zona del laboratorio, reloj de 24 horas. */
export function formatFechaHoraLab(value: Date | string | null | undefined): string {
  const p = partes(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (!p) return "—";
  // `hour12: false` devuelve "24" para medianoche en algunos runtimes.
  const hora = p.hour === "24" ? "00" : p.hour;
  return `${p.day}/${p.month}/${p.year} ${hora}:${p.minute}`;
}

/** `yyyy-mm-dd` en la zona del laboratorio, para el `value` de un `<input type="date">`. */
export function fechaInputLab(value: Date | string | null | undefined): string {
  const p = partes(value, { year: "numeric", month: "2-digit", day: "2-digit" });
  if (!p) return "";
  return `${p.year}-${p.month}-${p.day}`;
}

/** Fecha de hoy en la zona del laboratorio, como `yyyy-mm-dd`. */
export function hoyLabInput(): string {
  return fechaInputLab(new Date());
}

/**
 * Límites en UTC de un día calendario `yyyy-mm-dd` de la zona del laboratorio.
 * `hasta` es exclusivo (medianoche del día siguiente), para usar con `< hasta`.
 *
 * Venezuela no aplica horario de verano, así que el offset `-04:00` es fijo.
 */
export function limitesDiaLabUTC(fechaYMD: string): { desde: Date; hasta: Date } {
  const desde = new Date(`${fechaYMD}T00:00:00.000-04:00`);
  const hasta = new Date(desde);
  hasta.setUTCDate(hasta.getUTCDate() + 1);
  return { desde, hasta };
}
