import { createClient } from "@insforge/sdk";

/**
 * Obtiene el cliente de InsForge configurado con la URL y clave correspondientes.
 */
export function getInsforgeClient(accessToken?: string) {
  const url = process.env.INSFORGE_URL || process.env.NEXT_PUBLIC_INSFORGE_URL;
  if (!url) {
    throw new Error("Missing INSFORGE_URL in environment");
  }

  const key = process.env.INSFORGE_ANON_KEY || "";
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  return createClient({
    baseUrl: url.replace(/\/+$/, ""),
    anonKey: key,
    headers,
  });
}

export interface UploadStrategyResponse {
  key: string;
  method: "presigned" | "direct";
  uploadUrl: string;
  confirmRequired: boolean;
  expiresAt?: string;
  fields?: Record<string, string>;
  confirmUrl?: string;
}

/**
 * Pide a InsForge la estrategia de subida (upload strategy).
 */
export async function getUploadStrategy(
  bucketName: string,
  path: string,
  contentType: string,
  size: number,
  accessToken?: string
): Promise<UploadStrategyResponse> {
  const url = process.env.INSFORGE_URL || process.env.NEXT_PUBLIC_INSFORGE_URL;
  if (!url) {
    throw new Error("Missing INSFORGE_URL in environment");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  } else {
    const key = process.env.INSFORGE_ANON_KEY || "";
    if (key) {
      headers["Authorization"] = `Bearer ${key}`;
    }
  }

  const cleanUrl = url.replace(/\/+$/, "");
  const res = await fetch(
    `${cleanUrl}/api/storage/buckets/${bucketName}/upload-strategy`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        filename: path,
        contentType,
        size,
      }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Failed to request upload strategy: ${res.statusText}. ${errText}`);
  }

  return res.json() as Promise<UploadStrategyResponse>;
}

/**
 * Genera una URL firmada de descarga (S3 pre-signed read URL) para un objeto de un bucket.
 */
export async function createSignedDownloadUrl(
  bucketName: string,
  path: string,
  expiresInSeconds: number = 3600,
  accessToken?: string
): Promise<string> {
  const client = getInsforgeClient(accessToken);
  const { data, error } = await client.storage
    .from(bucketName)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    throw new Error(`Error generating signed URL: ${error.message}`);
  }

  return data!.signedUrl;
}

/**
 * Elimina un objeto de un bucket de InsForge Storage.
 */
export async function deleteObject(
  bucketName: string,
  path: string,
  accessToken?: string
): Promise<void> {
  const client = getInsforgeClient(accessToken);
  const { error } = await client.storage.from(bucketName).remove(path);

  if (error) {
    throw new Error(`Error deleting object: ${error.message}`);
  }
}
