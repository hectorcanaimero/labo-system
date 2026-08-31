import type { InsForgeClient } from "@insforge/sdk";

/**
 * Tipo del cliente de datos InsForge (PostgREST vía SDK).
 *
 * Reemplaza al cliente `postgres.js`. Los repos reciben este objeto como
 * primer parámetro (en vez de usar `getSql()`), de modo que el Route Handler
 * controla con qué token se autentica (JWT del usuario → RLS, o admin).
 */
export type Db = InsForgeClient["database"];
