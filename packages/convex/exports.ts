import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./helpers/auth.js";

/**
 * Error lanzado cuando el `storageId` no corresponde a un archivo existente.
 */
export const STORAGE_NO_ENCONTRADO = "STORAGE_NO_ENCONTRADO";

/**
 * Retorna una URL firmada (descargable) para un archivo de File Storage.
 *
 * La URL firmada de Convex expira ~1h, tiempo suficiente para que el
 * cliente dispare la descarga con `window.open`. El header `Content-Type`
 * se sirve según el MIME con el que se subió el Blob en
 * `helpers/csv-export.ts`; el Cache-Control lo gestiona el CDN de Convex
 * Storage (los archivos son content-addressed y se sirven cacheados).
 *
 * Requiere usuario autenticado: las exportaciones están detrás del login
 * y exponen datos del laboratorio.
 */
export const getSignedUrl = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await getCurrentUser(ctx);

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error(STORAGE_NO_ENCONTRADO);
    }

    return url;
  },
});
