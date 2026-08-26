import { createClient } from "@insforge/sdk";

export function writeCsv(
  rows: Array<Record<string, unknown>>,
  columns: Array<{ key: string; header: string; format?: (val: unknown) => string }>,
): string {
  const BOM = "\uFEFF";

  const headers = columns.map((c) => escapeCsvValue(c.header)).join(",");

  const lines = rows.map((row) => {
    return columns
      .map((col) => {
        let val = row[col.key];
        if (col.format) {
          val = col.format(val);
        }
        return escapeCsvValue(val);
      })
      .join(",");
  });

  return BOM + [headers, ...lines].join("\n");
}

function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) {
    return "";
  }
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getInsforgeClient(accessToken?: string) {
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

export async function uploadCsv(
  csv: string,
  filename: string,
  accessToken?: string,
): Promise<string> {
  const client = getInsforgeClient(accessToken);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

  const { data, error } = await client.storage
    .from("exports")
    .upload(filename, blob);

  if (error) {
    throw new Error(`Error uploading CSV: ${error.message}`);
  }

  return data!.key;
}

export async function getSignedDownloadUrl(
  objectKey: string,
  accessToken?: string,
): Promise<string> {
  const client = getInsforgeClient(accessToken);
  const { data, error } = await client.storage
    .from("exports")
    .createSignedUrl(objectKey, 3600);

  if (error) {
    throw new Error(`Error generating signed URL: ${error.message}`);
  }

  return data!.signedUrl;
}
