/**
 * rate-shield
 * Advanced rate limiting middleware for Express with multiple strategies.
 *
 * @packageDocumentation
 */

// ── Main middleware factory ──────────────────────────────────────────
export { createRateLimiter } from './middleware/rateLimiter';

/**
 * Convenience default export: createRateLimiter under the name `rateLimit`.
 */
export { createRateLimiter as rateLimit } from './middleware/rateLimiter';

// ── Strategies ───────────────────────────────────────────────────────
export { FixedWindowStrategy } from './strategies/fixedWindow';
export { SlidingWindowStrategy } from './strategies/slidingWindow';
export { TokenBucketStrategy } from './strategies/tokenBucket';
export { LeakyBucketStrategy } from './strategies/leakyBucket';

// ── Stores ───────────────────────────────────────────────────────────
export { MemoryStore } from './stores/memoryStore';

// ── Types ────────────────────────────────────────────────────────────
export type {
  RateLimitOptions,
  RateLimitInfo,
  Strategy,
  StrategyName,
  Store,
  StoreRecord,
} from './types';

// ── Utilities ────────────────────────────────────────────────────────
export { getClientIp, createKey, parseWindowMs } from './utils/helpers';
