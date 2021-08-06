import { Store, StoreRecord } from './types';

interface InternalEntry {
  record: StoreRecord;
  expiresAt: number;
}

/**
 * In-memory store backed by a Map with automatic TTL-based cleanup.
 *
 * Entries are lazily evicted on access and periodically swept via a
 * configurable cleanup interval to prevent unbounded memory growth.
 */
export class MemoryStore implements Store {
  private entries: Map<string, InternalEntry> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param cleanupIntervalMs How often (ms) to sweep expired entries. Default: 60000 (1 min).
   */
  constructor(cleanupIntervalMs: number = 60_000) {
    this.cleanupTimer = setInterval(() => this.sweep(), cleanupIntervalMs);

    // Allow the process to exit even if the timer is active
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  async get(key: string): Promise<StoreRecord | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }

    return entry.record;
  }

  async set(key: string, record: StoreRecord, ttlMs: number): Promise<void> {
    this.entries.set(key, {
      record: { ...record },
      expiresAt: Date.now() + ttlMs,
    });
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    const entry = this.entries.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      return 0;
    }
    entry.record.count += amount;
    return entry.record.count;
  }

  async decrement(key: string, amount: number = 1): Promise<number> {
    const entry = this.entries.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      return 0;
    }
    entry.record.count = Math.max(0, entry.record.count - amount);
    return entry.record.count;
  }

  async reset(key: string): Promise<void> {
    this.entries.delete(key);
  }

  /**
   * Remove all expired entries from the map.
   */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now > entry.expiresAt) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Stop the background cleanup timer and clear all entries.
   * Call this when shutting down to avoid leaks in tests.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.entries.clear();
  }
}
