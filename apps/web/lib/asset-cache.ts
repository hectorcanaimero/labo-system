import "server-only";

const DEFAULT_TTL_MS = 5 * 60 * 1_000;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class MemoryTtlCache<T> {
  private readonly ttlMs: number;
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const cached = this.store.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return cached.value;
  }

  set(key: string, value: T): T {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
    return value;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  async getOrSet(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) return cached;
    const loaded = await load();
    return this.set(key, loaded);
  }
}

export const pdfAssetCache = new MemoryTtlCache<string>(DEFAULT_TTL_MS);
