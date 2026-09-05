import "server-only";

import { readObject, resolveObjectPath } from "@labo/lib/storage-local";

import { pdfAssetCache } from "@/lib/asset-cache";

/**
 * Resolución de logo/firma/sello (bucket `assets`) para los PDF.
 *
 * Los assets se embeben como data URI para que `@react-pdf/renderer` no tenga
 * que resolver URLs en tiempo de render. Si un archivo no se puede leer, el
 * PDF se emite igual sin ese asset: se devuelve un PNG transparente que las
 * plantillas reconocen como "sin imagen" (`assetOrNull` en `@labo/pdf/theme`).
 *
 * Ojo en staging: la fila `laboratorio_config` es compartida entre entornos,
 * pero el storage es local a cada servidor. Si el key apunta a un archivo que
 * sólo existe en producción, acá se loguea la ruta que se intentó leer.
 */

export const ASSET_BUCKET = "assets";

export const EMBEDDED_TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const MAX_ASSET_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function mimeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "image/png";
}

async function readAssetDataUri(objectKey: string): Promise<string> {
  return pdfAssetCache.getOrSet(objectKey, async () => {
    const buf = await readObject(ASSET_BUCKET, objectKey);
    if (buf.byteLength > MAX_ASSET_BYTES) {
      throw new Error(`El asset supera ${MAX_ASSET_BYTES} bytes`);
    }
    return `data:${mimeForKey(objectKey)};base64,${buf.toString("base64")}`;
  });
}

/** Contrato `AssetUrlResolver` de `@labo/db/repos/ordenes`: nunca lanza. */
export async function resolvePdfAsset(objectKey: string): Promise<string> {
  try {
    return await readAssetDataUri(objectKey);
  } catch (error) {
    let ruta = objectKey;
    try {
      ruta = resolveObjectPath(ASSET_BUCKET, objectKey);
    } catch {
      /* la ruta no se pudo resolver: se loguea el key tal cual */
    }
    console.error(
      `[pdf-assets] no se pudo embeber "${objectKey}" (ruta: ${ruta}). El PDF sale sin ese asset.`,
      error instanceof Error ? error.message : error,
    );
    return EMBEDDED_TRANSPARENT_PNG;
  }
}

export async function resolvePdfAssetOrNull(objectKey: string | null): Promise<string | null> {
  if (!objectKey) return null;
  return resolvePdfAsset(objectKey);
}
