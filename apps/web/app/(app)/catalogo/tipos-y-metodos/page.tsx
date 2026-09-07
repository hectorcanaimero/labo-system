import { redirect } from "next/navigation";

/**
 * F7.6.T1 — el mantenimiento de tipos/métodos (F7.4.T3) se mudó a
 * Configuración para no tener el mismo catálogo administrable en dos
 * lugares distintos del sidebar. Esta ruta queda sólo como redirect para
 * no romper links/bookmarks viejos; el guard de admin y el resto del
 * render viven en /config (ConfigPage → ConfigForm).
 *
 * F7.4.T4 — la pestaña única se separó en "Tipos de análisis" y
 * "Métodos"; el redirect entra por la primera (`?tab=tipos`).
 */
export default function TiposYMetodosPage() {
  redirect("/config?tab=tipos");
}
