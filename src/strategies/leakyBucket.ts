import { Strategy, RateLimitInfo, Store } from '../types';

/**
 * Leaky Bucket Rate Limiter
 *
 * Models a bucket that leaks (drains) at a constant rate. Incoming requests
 * fill the bucket. If the bucket overflows (exceeds capacity), the request
 * is rejected. This produces a very smooth, constant output rate regardless
 * of input burstiness.
 *
 * Pros: Guarantees a smooth constant rate, no boundary issues.
 * Cons: No burst tolerance at all -- strict constant throughput.
 */
export class LeakyBucketStrategy implements Strategy {
  private readonly capacity: number;
  private readonly drainRate: number; // requests drained per second

  /**
   * @param store      Backing store
   * @param max        Bucket capacity (max queued requests)
   * @param windowMs   Conceptual window (used for default drain rate)
   * @param drainRate  Requests drained per second (default: max / (windowMs / 1000))
   */
  constructor(
    private readonly store: Store,
    max: number,
    private readonly windowMs: number,
    drainRate?: number
  ) {
    this.capacity = max;
    this.drainRate = drainRate ?? max / (windowMs / 1000);
  }

  async consume(key: string): Promise<RateLimitInfo> {
    const now = Date.now();
    const storeKey = `lb:${key}`;

    let record = await this.store.get(storeKey);

    if (!record) {
      // First request: bucket has 1 item (the current request)
      record = {
        count: 1,
        resetTime: now + this.windowMs,
        meta: { lastDrain: now },
      };
      await this.store.set(storeKey, record, this.windowMs);

      return {
        limit: this.capacity,
        remaining: this.capacity - 1,
        resetTime: Math.ceil(record.resetTime / 1000),
        exceeded: false,
      };
    }

    // Calculate how many requests have drained since last check
    const lastDrain = record.meta?.lastDrain ?? now;
    const elapsedSeconds = (now - lastDrain) / 1000;
    const drained = elapsedSeconds * this.drainRate;

    // Apply draining
    let currentLevel = Math.max(0, record.count - drained);

    // Try to add current request to the bucket
    const exceeded = currentLevel + 1 > this.capacity;
    if (!exceeded) {
      currentLevel += 1;
    }

    // Estimate when one slot will free up
    const timeToFreeOneSlot = (1 / this.drainRate) * 1000;
    const resetTime = exceeded
      ? now + timeToFreeOneSlot
      : now + this.windowMs;

    const updatedRecord = {
      count: currentLevel,
      resetTime,
      meta: { lastDrain: now },
    };
    await this.store.set(storeKey, updatedRecord, this.windowMs);

    return {
      limit: this.capacity,
      remaining: Math.max(0, Math.floor(this.capacity - currentLevel)),
      resetTime: Math.ceil(resetTime / 1000),
      exceeded,
    };
  }

  async reset(key: string): Promise<void> {
    await this.store.reset(`lb:${key}`);
  }
}
