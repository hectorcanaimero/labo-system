import { NextResponse, type NextRequest } from "next/server";

import type { RepoCatalogo, CodigosCatalogo } from "@labo/db/repos/catalogo";
import { AuthError, getCurrentUser, requireRole } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

/**
 * Handlers `GET/POST/PATCH` de un catálogo de mantenimiento.
 *
 * Métodos (0017) y tipos de análisis (0019) exponen exactamente el mismo
 * contrato y los mismos roles, así que comparten los handlers en vez de
 * duplicarlos:
 *
 *   - `GET` sin flags: operador o admin. Devuelve sólo los activos, que es lo
 *     que necesita el selector del examen.
 *   - `GET ?incluirInactivos=1`: sólo admin. Es la vista de administración.
 *   - `POST` y `PATCH`: sólo admin.
 */
export function crearRutaCatalogo(repo: RepoCatalogo, codigos: CodigosCatalogo, scope: string) {
  function bad(status: number, error: string): Response {
    return NextResponse.json({ error }, { status });
  }

  async function requireOperadorMinimo(): Promise<void> {
    const user = await getCurrentUser();
    if (user.role !== "admin" && user.role !== "operador") {
      throw new AuthError("UNAUTHORIZED");
    }
  }

  function toStatus(error: unknown): { status: number; error: string } {
    if (error instanceof AuthError) {
      return { status: error.code === "UNAUTHENTICATED" ? 401 : 403, error: error.code };
    }

    const code = error instanceof Error ? error.message : "ERROR_GENERICO";
    switch (code) {
      case codigos.noEncontrado:
        return { status: 404, error: code };
      case codigos.duplicado:
        return { status: 409, error: code };
      case codigos.tablaFaltante:
        return { status: 503, error: code };
      case "VALIDACION_FALLIDA":
        return { status: 400, error: code };
      default:
        console.error(`${scope}:`, error);
        return { status: 500, error: "ERROR_GENERICO" };
    }
  }

  return {
    async GET(request: NextRequest): Promise<Response> {
      try {
        const incluirInactivos =
          request.nextUrl.searchParams.get("incluirInactivos") === "1";

        if (incluirInactivos) await requireRole("admin");
        else await requireOperadorMinimo();

        return NextResponse.json(await repo.list(getAdminDb(), { incluirInactivos }));
      } catch (error) {
        const { status, error: code } = toStatus(error);
        return bad(status, code);
      }
    },

    async POST(request: NextRequest): Promise<Response> {
      try {
        const user = await requireRole("admin");

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return bad(400, "VALIDACION_FALLIDA");

        const item = await repo.create(getAdminDb(), {
          nombre: body.nombre,
          usuarioId: user.userId,
        });
        return NextResponse.json(item, { status: 201 });
      } catch (error) {
        const { status, error: code } = toStatus(error);
        return bad(status, code);
      }
    },

    async PATCH(request: NextRequest): Promise<Response> {
      try {
        const user = await requireRole("admin");

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return bad(400, "VALIDACION_FALLIDA");

        const item = await repo.update(getAdminDb(), {
          id: body.id,
          nombre: body.nombre,
          activo: body.activo,
          usuarioId: user.userId,
        });
        return NextResponse.json(item);
      } catch (error) {
        const { status, error: code } = toStatus(error);
        return bad(status, code);
      }
    },
  };
}
