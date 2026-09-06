/**
 * Capa única de acceso a `/api/*` desde el browser.
 *
 * Antes cada lista y cada diálogo repetía el mismo bloque: `fetch`, si 401
 * mandar a `/login`, si 403 mandar al dashboard, si no `ok` leer el error.
 * Estaba copiado en 11 lugares con pequeñas diferencias (algunos no
 * manejaban el 403, otros mandaban el 403 al login). Acá vive una sola vez.
 *
 * - `apiFetch`: `fetch` con `accept: application/json`, `content-type` cuando
 *   hay body, y el manejo de sesión vencida / sin permisos. Devuelve la
 *   `Response` para que el caller decida qué hacer con el resto.
 * - `apiJson`: `apiFetch` + lanza `ApiError` con el código de dominio si la
 *   respuesta no es `ok`, y devuelve el JSON tipado.
 * - `readApiError`: extrae el código de dominio de una respuesta fallida.
 *
 * Los errores lanzados llevan como `message` el código de dominio (por
 * ejemplo `PACIENTE_SIN_EMAIL`), que `toHumanError` traduce para mostrar.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ApiError";
    this.status = status;
  }
}

export const LOGIN_PATH = "/login";
export const SIN_PERMISOS_PATH = "/dashboard?reason=sin-permisos";

// Un solo redirect por carga de página: si varias llamadas en paralelo
// reciben 401 a la vez, no queremos disparar N navegaciones.
let redirigiendo = false;

function redirigirUnaVez(destino: string): void {
  if (typeof window === "undefined" || redirigiendo) return;
  redirigiendo = true;
  window.location.assign(destino);
}

export async function readApiError(response: Response): Promise<ApiError> {
  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as { error?: unknown } | null;
  const code =
    typeof payload?.error === "string" && payload.error.length > 0
      ? payload.error
      : `REQUEST_FAILED_${response.status}`;
  return new ApiError(code, response.status);
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body !== undefined && init.body !== null && typeof init.body === "string"
        ? { "content-type": "application/json" }
        : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401) {
    redirigirUnaVez(LOGIN_PATH);
    throw new ApiError("UNAUTHENTICATED", 401);
  }
  if (response.status === 403) {
    redirigirUnaVez(SIN_PERMISOS_PATH);
    throw new ApiError("UNAUTHORIZED", 403);
  }
  return response;
}

export async function apiJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await apiFetch(input, init);
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as T;
}
