/**
 * `pacientes.ubicacion_url` acepta dos formatos, tal como el operador los
 * pega desde WhatsApp (F7.4.T2):
 *   - un enlace de mapa (`https://maps.app.goo.gl/...`, `https://www.google.com/maps/...`)
 *   - un par de coordenadas sueltas (`10.49,-66.88`)
 *
 * No hay mapa embebido (fuera de alcance): esto sólo valida el formato y
 * resuelve un enlace abrible en una pestaña nueva.
 */

const COORDENADAS_RE = /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/;

export function esCoordenadas(raw: string): boolean {
  return COORDENADAS_RE.test(raw.trim());
}

function esUrlHttp(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Vacío es válido: el campo es opcional. */
export function esUbicacionValida(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0) return true;
  return esCoordenadas(value) || esUrlHttp(value);
}

/**
 * Resuelve `raw` a una URL de Google Maps abrible, o `null` si está vacío o
 * no matchea ninguno de los dos formatos.
 */
export function resolverUbicacionMaps(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (esCoordenadas(value)) {
    return `https://www.google.com/maps?q=${encodeURIComponent(value.replace(/\s+/g, ""))}`;
  }
  if (esUrlHttp(value)) return value;
  return null;
}
