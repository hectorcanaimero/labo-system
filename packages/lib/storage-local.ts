import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, type Dirent, type ReadStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type BucketName = "assets" | "exports";

export interface StoredObject {
  bucket: BucketName;
  key: string;
  size: number;
  mtimeMs: number;
}

export interface SignedUrlOptions {
  bucket: BucketName;
  key: string;
  expiresInSeconds?: number;
  baseUrl?: string;
}

function getRoot(): string {
  // ponytail: el default anterior era "/data/storage" — un path absoluto que
  // no existe ni es escribible en el container de Coolify (ni en dev local),
  // así que todo upload de logo/firma/sello moría con EACCES/ENOENT.
  // Ceiling: `.storage` vive dentro del build → se pierde en cada redeploy.
  // En prod montar un volumen persistente y apuntar STORAGE_ROOT ahí.
  return process.env.STORAGE_ROOT || path.join(process.cwd(), ".storage");
}

function getSecret(): string {
  const secret = process.env.STORAGE_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "STORAGE_SIGNING_SECRET no configurado o menor a 32 caracteres.",
    );
  }
  return secret;
}

function assertSafeKey(key: string): void {
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\")) {
    throw new Error(`Storage key inválida: ${key}`);
  }
}

function bucketDir(bucket: BucketName): string {
  return path.join(getRoot(), bucket);
}

export function resolveObjectPath(bucket: BucketName, key: string): string {
  assertSafeKey(key);
  const root = getRoot();
  const full = path.resolve(bucketDir(bucket), key);
  const bucketRoot = path.resolve(bucketDir(bucket));
  if (!full.startsWith(bucketRoot + path.sep) && full !== bucketRoot) {
    throw new Error("Path traversal detectado en storage.");
  }
  if (!full.startsWith(path.resolve(root))) {
    throw new Error("Path fuera de STORAGE_ROOT.");
  }
  return full;
}

export async function saveObject(
  bucket: BucketName,
  key: string,
  data: Buffer | Uint8Array,
): Promise<StoredObject> {
  const full = resolveObjectPath(bucket, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  const s = await stat(full);
  return { bucket, key, size: s.size, mtimeMs: s.mtimeMs };
}

export async function deleteObject(
  bucket: BucketName,
  key: string,
): Promise<void> {
  const full = resolveObjectPath(bucket, key);
  await rm(full, { force: true });
}

export async function objectExists(
  bucket: BucketName,
  key: string,
): Promise<StoredObject | null> {
  try {
    const full = resolveObjectPath(bucket, key);
    const s = await stat(full);
    if (!s.isFile()) return null;
    return { bucket, key, size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

export function openReadStream(bucket: BucketName, key: string): ReadStream {
  const full = resolveObjectPath(bucket, key);
  return createReadStream(full);
}

export async function readObject(
  bucket: BucketName,
  key: string,
): Promise<Buffer> {
  const full = resolveObjectPath(bucket, key);
  return readFile(full);
}

export async function listObjects(
  bucket: BucketName,
  prefix = "",
): Promise<StoredObject[]> {
  const root = bucketDir(bucket);
  const out: StoredObject[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
    } catch {
      return;
    }
    for (const e of entries) {
      const name = String(e.name);
      const abs = path.join(dir, name);
      if (e.isDirectory()) {
        await walk(abs);
      } else if (e.isFile()) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        if (!prefix || rel.startsWith(prefix)) {
          const s = await stat(abs);
          out.push({ bucket, key: rel, size: s.size, mtimeMs: s.mtimeMs });
        }
      }
    }
  }

  await walk(root);
  return out;
}

export async function cleanupOlderThan(
  bucket: BucketName,
  ageMs: number,
): Promise<string[]> {
  const cutoff = Date.now() - ageMs;
  const items = await listObjects(bucket);
  const deleted: string[] = [];
  for (const item of items) {
    if (item.mtimeMs < cutoff) {
      await deleteObject(bucket, item.key);
      deleted.push(item.key);
    }
  }
  return deleted;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload: string): string {
  const mac = createHmac("sha256", getSecret()).update(payload).digest();
  return b64url(mac);
}

export function signDownloadUrl(opts: SignedUrlOptions): string {
  const { bucket, key, expiresInSeconds = 3600, baseUrl = "" } = opts;
  assertSafeKey(key);
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const token = sign(`${bucket}\n${key}\n${exp}`);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const search = `exp=${exp}&token=${token}`;
  return `${baseUrl}/api/storage/${bucket}/${encodedKey}?${search}`;
}

export function verifyDownloadToken(
  bucket: BucketName,
  key: string,
  token: string,
  exp: number,
): boolean {
  if (!token || !Number.isFinite(exp)) return false;
  if (exp < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(`${bucket}\n${key}\n${exp}`);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
