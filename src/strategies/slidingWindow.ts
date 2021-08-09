import { Strategy, RateLimitInfo, Store } from '../types';

/**
 * Sliding Window Rate Limiter
 *
 * Combines the current fixed window count with a weighted portion of the
 * previous window's count, creating a smoother approximation of a true
 * sliding window without storing per-request timestamps.
 *
 * Formula: effectiveCount = previousCount * overlapRatio + currentCount
 *
 * Pros: Smoother than fixed window, prevents boundary burst.
 * Cons: Slightly more memory (two windows), approximate.
 */
export class SlidingWindowStrategy implements Strategy {
  constructor(
    private readonly store: Store,
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  async consume(key: string): Promise<RateLimitInfo> {
    const now = Date.now();
    const currentWindowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const previousWindowStart = currentWindowStart - this.windowMs;
    const currentWindowEnd = currentWindowStart + this.windowMs;

    const currentKey = `sw:${key}:${currentWindowStart}`;
    const previousKey = `sw:${key}:${previousWindowStart}`;

    // Get or create current window record
    let currentRecord = await this.store.get(currentKey);
    if (!currentRecord) {
      currentRecord = { count: 1, resetTime: currentWindowEnd };
      await this.store.set(currentKey, currentRecord, this.windowMs * 2);
    } else {
      const newCount = await this.store.increment(currentKey);
      currentRecord.count = newCount;
    }

    // Get previous window count (may be expired/null)
    const previousRecord = await this.store.get(previousKey);
    const previousCount = previousRecord ? previousRecord.count : 0;

    // Calculate how far we are into the current window (0.0 to 1.0)
    const elapsedRatio = (now - currentWindowStart) / this.windowMs;

    // Weight the previous window by the portion that still overlaps
    const overlapRatio = 1 - elapsedRatio;
    const weightedPrevious = Math.floor(previousCount * overlapRatio);
    const effectiveCount = weightedPrevious + currentRecord.count;

    const remaining = Math.max(0, this.max - effectiveCount);
    const exceeded = effectiveCount > this.max;

    return {
      limit: this.max,
      remaining,
      resetTime: Math.ceil(currentWindowEnd / 1000),
      exceeded,
    };
  }

  async reset(key: string): Promise<void> {
    const now = Date.now();
    const currentWindowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const previousWindowStart = currentWindowStart - this.windowMs;

    await Promise.all([
      this.store.reset(`sw:${key}:${currentWindowStart}`),
      this.store.reset(`sw:${key}:${previousWindowStart}`),
    ]);
  }
}
