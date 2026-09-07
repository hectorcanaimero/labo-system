import { redirect } from "next/navigation";

/**
 * F7.6.T1 — el mantenimiento de tipos/métodos (F7.4.T3) se mudó a la
 * pestaña "Tipos y métodos" de /config para no tener el mismo catálogo
 * administrable en dos lugares distintos del sidebar. Esta ruta queda sólo
 * como redirect para no romper links/bookmarks viejos; el guard de admin
 * y el resto del render viven en /config (ConfigPage → ConfigForm).
 */
export default function TiposYMetodosPage() {
  redirect("/config?tab=catalogo");
}
