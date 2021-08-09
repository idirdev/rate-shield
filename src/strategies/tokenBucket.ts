import { Strategy, RateLimitInfo, Store } from '../types';

/**
 * Token Bucket Rate Limiter
 *
 * Maintains a bucket of tokens that refills at a steady rate. Each request
 * consumes one token. If the bucket is empty, the request is rejected.
 * The bucket has a maximum capacity (burst size) which allows short bursts
 * of traffic while maintaining a long-term average rate.
 *
 * Pros: Allows controlled bursting, smooth long-term rate.
 * Cons: Slightly more complex state management.
 */
export class TokenBucketStrategy implements Strategy {
  private readonly bucketCapacity: number;
  private readonly refillRate: number;
  private readonly refillIntervalMs: number;

  /**
   * @param store         Backing store
   * @param max           Bucket capacity (max burst size)
   * @param windowMs      Conceptual window (used for reset time calculation)
   * @param refillRate    Number of tokens added per refill interval
   * @param refillIntervalMs  Milliseconds between each refill
   */
  constructor(
    private readonly store: Store,
    max: number,
    private readonly windowMs: number,
    refillRate?: number,
    refillIntervalMs?: number
  ) {
    this.bucketCapacity = max;
    // Defaults: refill enough tokens to fill the bucket over one window
    this.refillRate = refillRate ?? Math.max(1, Math.floor(max / 10));
    this.refillIntervalMs = refillIntervalMs ?? Math.floor(windowMs / 10);
  }

  async consume(key: string): Promise<RateLimitInfo> {
    const now = Date.now();
    const storeKey = `tb:${key}`;

    let record = await this.store.get(storeKey);

    if (!record) {
      // Initialize bucket: count represents available tokens (capacity - 1 since we consume one)
      record = {
        count: this.bucketCapacity - 1,
        resetTime: now + this.windowMs,
        meta: { lastRefill: now },
      };
      await this.store.set(storeKey, record, this.windowMs);

      return {
        limit: this.bucketCapacity,
        remaining: record.count,
        resetTime: Math.ceil(record.resetTime / 1000),
        exceeded: false,
      };
    }

    // Calculate tokens to add since last refill
    const lastRefill = record.meta?.lastRefill ?? now;
    const elapsed = now - lastRefill;
    const intervalsElapsed = Math.floor(elapsed / this.refillIntervalMs);
    const tokensToAdd = intervalsElapsed * this.refillRate;

    // Refill tokens (capped at bucket capacity)
    let currentTokens = Math.min(this.bucketCapacity, record.count + tokensToAdd);

    // Try to consume one token
    const exceeded = currentTokens < 1;
    if (!exceeded) {
      currentTokens -= 1;
    }

    // Update last refill time only for the intervals we accounted for
    const newLastRefill = intervalsElapsed > 0
      ? lastRefill + intervalsElapsed * this.refillIntervalMs
      : lastRefill;

    // Calculate when the next token will be available
    const resetTime = exceeded
      ? now + this.refillIntervalMs
      : now + this.windowMs;

    const updatedRecord = {
      count: currentTokens,
      resetTime,
      meta: { lastRefill: newLastRefill },
    };
    await this.store.set(storeKey, updatedRecord, this.windowMs);

    return {
      limit: this.bucketCapacity,
      remaining: Math.floor(currentTokens),
      resetTime: Math.ceil(resetTime / 1000),
      exceeded,
    };
  }

  async reset(key: string): Promise<void> {
    await this.store.reset(`tb:${key}`);
  }
}
