import { saveObject, signDownloadUrl } from "./storage-local";

export function writeCsv(
  rows: Array<Record<string, unknown>>,
  columns: Array<{ key: string; header: string; format?: (val: unknown) => string }>,
): string {
  const BOM = "﻿";

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

export async function uploadCsv(csv: string, filename: string): Promise<string> {
  const buffer = Buffer.from(csv, "utf-8");
  const stored = await saveObject("exports", filename, buffer);
  return stored.key;
}

export function getSignedDownloadUrl(
  objectKey: string,
  expiresInSeconds = 3600,
): string {
  return signDownloadUrl({
    bucket: "exports",
    key: objectKey,
    expiresInSeconds,
  });
}
