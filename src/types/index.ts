import { Request } from 'express';

/**
 * Supported rate limiting strategy names.
 */
export type StrategyName =
  | 'fixed-window'
  | 'sliding-window'
  | 'token-bucket'
  | 'leaky-bucket';

/**
 * Information about the current rate limit state for a given client.
 */
export interface RateLimitInfo {
  /** Total number of requests allowed in the window */
  limit: number;
  /** Number of requests remaining before being rate limited */
  remaining: number;
  /** Timestamp (in seconds since epoch) when the rate limit window resets */
  resetTime: number;
  /** Whether the client has exceeded the rate limit */
  exceeded: boolean;
}

/**
 * Core strategy interface. Each algorithm must implement this contract.
 */
export interface Strategy {
  /**
   * Consume one unit from the rate limiter for the given key.
   * Returns the current state after consumption.
   */
  consume(key: string): Promise<RateLimitInfo>;

  /**
   * Reset the rate limit state for a given key.
   */
  reset(key: string): Promise<void>;
}

/**
 * Configuration options for the rate limiter middleware.
 */
export interface RateLimitOptions {
  /** Rate limiting strategy to use (default: 'fixed-window') */
  strategy?: StrategyName;

  /** Maximum number of requests allowed in the window (default: 100) */
  max?: number;

  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;

  /**
   * Function to generate a unique key for each client.
   * Defaults to using the client IP address.
   */
  keyGenerator?: (req: Request) => string;

  /**
   * Function called when a request is rate limited.
   * Return true to skip rate limiting for this request (whitelist).
   */
  skip?: (req: Request) => boolean | Promise<boolean>;

  /**
   * List of IP addresses or keys to whitelist (never rate limited).
   */
  whitelist?: string[];

  /**
   * Custom message returned when rate limit is exceeded.
   * Can be a string or an object (will be sent as JSON).
   */
  message?: string | Record<string, unknown>;

  /** HTTP status code when rate limited (default: 429) */
  statusCode?: number;

  /** Whether to include X-RateLimit-* headers in responses (default: true) */
  headers?: boolean;

  /** Custom store instance (default: MemoryStore) */
  store?: Store;

  // --- Token Bucket specific ---

  /** Tokens added per interval for token-bucket strategy (default: max / 10) */
  refillRate?: number;

  /** Interval in ms at which tokens are refilled (default: windowMs / 10) */
  refillIntervalMs?: number;

  // --- Leaky Bucket specific ---

  /** Requests drained per second for leaky-bucket strategy (default: max / (windowMs / 1000)) */
  drainRate?: number;
}

/**
 * A record stored in the backing store for a single key.
 */
export interface StoreRecord {
  /** Number of hits / tokens / queue size depending on strategy */
  count: number;
  /** Timestamp (ms) when this record was created or last reset */
  resetTime: number;
  /** Optional extra data strategies may need */
  meta?: Record<string, number>;
}

/**
 * Interface for pluggable backing stores (memory, Redis, etc.).
 */
export interface Store {
  /** Get the record for a key, or null if not found / expired */
  get(key: string): Promise<StoreRecord | null>;

  /** Set the record for a key */
  set(key: string, record: StoreRecord, ttlMs: number): Promise<void>;

  /** Atomically increment the count for a key. Returns new count. */
  increment(key: string, amount?: number): Promise<number>;

  /** Atomically decrement the count for a key. Returns new count (min 0). */
  decrement(key: string, amount?: number): Promise<number>;

  /** Delete the record for a key */
  reset(key: string): Promise<void>;
}
