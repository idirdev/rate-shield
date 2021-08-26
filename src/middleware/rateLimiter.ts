import { Request, Response, NextFunction } from 'express';
import {
  RateLimitOptions,
  Strategy,
  StrategyName,
  Store,
} from '../types';
import { MemoryStore } from '../stores/memoryStore';
import { FixedWindowStrategy } from '../strategies/fixedWindow';
import { SlidingWindowStrategy } from '../strategies/slidingWindow';
import { TokenBucketStrategy } from '../strategies/tokenBucket';
import { LeakyBucketStrategy } from '../strategies/leakyBucket';
import { getClientIp, createKey } from '../utils/helpers';

/**
 * Default response message when a client exceeds the rate limit.
 */
const DEFAULT_MESSAGE = {
  error: 'Too Many Requests',
  message: 'You have exceeded the rate limit. Please try again later.',
};

/**
 * Resolve the concrete strategy instance from configuration.
 */
function resolveStrategy(
  name: StrategyName,
  store: Store,
  max: number,
  windowMs: number,
  options: RateLimitOptions
): Strategy {
  switch (name) {
    case 'fixed-window':
      return new FixedWindowStrategy(store, max, windowMs);
    case 'sliding-window':
      return new SlidingWindowStrategy(store, max, windowMs);
    case 'token-bucket':
      return new TokenBucketStrategy(
        store,
        max,
        windowMs,
        options.refillRate,
        options.refillIntervalMs
      );
    case 'leaky-bucket':
      return new LeakyBucketStrategy(store, max, windowMs, options.drainRate);
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown strategy: ${_exhaustive}`);
    }
  }
}

/**
 * Create an Express rate limiting middleware with the given options.
 *
 * @param options  Configuration for the rate limiter
 * @returns        Express middleware function
 */
export function createRateLimiter(options: RateLimitOptions = {}) {
  const {
    strategy: strategyName = 'fixed-window',
    max = 100,
    windowMs = 60_000,
    keyGenerator = (req: Request) => getClientIp(req),
    skip,
    whitelist = [],
    message = DEFAULT_MESSAGE,
    statusCode = 429,
    headers = true,
    store = new MemoryStore(),
  } = options;

  const whitelistSet = new Set(whitelist);
  const strategy = resolveStrategy(strategyName, store, max, windowMs, options);

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Check skip function
      if (skip) {
        const shouldSkip = await skip(req);
        if (shouldSkip) {
          next();
          return;
        }
      }

      // Generate key for this client
      const clientKey = keyGenerator(req);
      const storeKey = createKey('rate-shield', clientKey);

      // Check whitelist
      if (whitelistSet.has(clientKey)) {
        next();
        return;
      }

      // Consume one request from the strategy
      const info = await strategy.consume(storeKey);

      // Set rate limit headers
      if (headers) {
        res.setHeader('X-RateLimit-Limit', info.limit);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, info.remaining));
        res.setHeader('X-RateLimit-Reset', info.resetTime);
        res.setHeader('X-RateLimit-Policy', strategyName);
      }

      if (info.exceeded) {
        // Set Retry-After header (seconds until reset)
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(info.resetTime - Date.now() / 1000)
        );
        res.setHeader('Retry-After', retryAfterSeconds);

        if (typeof message === 'string') {
          res.status(statusCode).send(message);
        } else {
          res.status(statusCode).json(message);
        }
        return;
      }

      next();
    } catch (err) {
      // If rate limiting fails, let the request through (fail-open)
      // but log the error for observability
      console.error('[rate-shield] Error in rate limit middleware:', err);
      next();
    }
  };
}
