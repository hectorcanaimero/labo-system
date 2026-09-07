import {
  create,
  list,
  update,
  TIPO_DUPLICADO,
  TIPO_NO_ENCONTRADO,
  TIPOS_TABLA_FALTANTE,
} from "@labo/db/repos/tipos-analisis";
import { crearRutaCatalogo } from "@/lib/catalogo-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET/POST/PATCH /api/examenes/tipos-analisis` — catálogo de tipos (0019). */
const handlers = crearRutaCatalogo(
  { list, create, update },
  {
    duplicado: TIPO_DUPLICADO,
    noEncontrado: TIPO_NO_ENCONTRADO,
    tablaFaltante: TIPOS_TABLA_FALTANTE,
  },
  "tipos-analisis",
);

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
