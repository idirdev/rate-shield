import { Strategy, RateLimitInfo, Store } from '../types';

/**
 * Fixed Window Rate Limiter
 *
 * Divides time into fixed intervals (windows) and counts the number of
 * requests in each window. Once the count exceeds the maximum, subsequent
 * requests are rejected until the window resets.
 *
 * Pros: Simple, low memory overhead.
 * Cons: Burst traffic at window boundaries can allow up to 2x the limit.
 */
export class FixedWindowStrategy implements Strategy {
  constructor(
    private readonly store: Store,
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  async consume(key: string): Promise<RateLimitInfo> {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const windowEnd = windowStart + this.windowMs;
    const storeKey = `fw:${key}:${windowStart}`;

    let record = await this.store.get(storeKey);

    if (!record) {
      // First request in this window
      record = {
        count: 1,
        resetTime: windowEnd,
      };
      await this.store.set(storeKey, record, this.windowMs);
    } else {
      const newCount = await this.store.increment(storeKey);
      record.count = newCount;
    }

    const remaining = Math.max(0, this.max - record.count);
    const exceeded = record.count > this.max;

    return {
      limit: this.max,
      remaining,
      resetTime: Math.ceil(windowEnd / 1000),
      exceeded,
    };
  }

  async reset(key: string): Promise<void> {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const storeKey = `fw:${key}:${windowStart}`;
    await this.store.reset(storeKey);
  }
}
