import {
  create,
  list,
  update,
  METODO_DUPLICADO,
  METODO_NO_ENCONTRADO,
  METODOS_TABLA_FALTANTE,
} from "@labo/db/repos/metodos";
import { crearRutaCatalogo } from "@/lib/catalogo-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET/POST/PATCH /api/examenes/metodos` — catálogo de métodos (0017). */
const handlers = crearRutaCatalogo(
  { list, create, update },
  {
    duplicado: METODO_DUPLICADO,
    noEncontrado: METODO_NO_ENCONTRADO,
    tablaFaltante: METODOS_TABLA_FALTANTE,
  },
  "metodos",
);

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
