import { describe, it, expect, afterEach } from 'vitest';
import { MemoryStore } from '../src/stores/memoryStore';
import { FixedWindowStrategy } from '../src/strategies/fixedWindow';
import { SlidingWindowStrategy } from '../src/strategies/slidingWindow';
import { TokenBucketStrategy } from '../src/strategies/tokenBucket';
import { createKey, parseWindowMs } from '../src/utils/helpers';

describe('MemoryStore', () => {
  let store: MemoryStore;

  afterEach(() => {
    if (store) store.destroy();
  });

  it('should return null for non-existent keys', async () => {
    store = new MemoryStore();
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should set and get a record', async () => {
    store = new MemoryStore();
    await store.set('key1', { count: 5, resetTime: Date.now() + 60000 }, 60000);
    const record = await store.get('key1');
    expect(record).not.toBeNull();
    expect(record!.count).toBe(5);
  });

  it('should increment a record count', async () => {
    store = new MemoryStore();
    await store.set('key1', { count: 1, resetTime: Date.now() + 60000 }, 60000);
    const newCount = await store.increment('key1');
    expect(newCount).toBe(2);

    const newCount2 = await store.increment('key1', 3);
    expect(newCount2).toBe(5);
  });

  it('should decrement a record count to minimum 0', async () => {
    store = new MemoryStore();
    await store.set('key1', { count: 2, resetTime: Date.now() + 60000 }, 60000);
    const count = await store.decrement('key1');
    expect(count).toBe(1);

    const count2 = await store.decrement('key1', 5);
    expect(count2).toBe(0);
  });

  it('should reset (delete) a record', async () => {
    store = new MemoryStore();
    await store.set('key1', { count: 10, resetTime: Date.now() + 60000 }, 60000);
    await store.reset('key1');
    const record = await store.get('key1');
    expect(record).toBeNull();
  });

  it('should expire records based on TTL', async () => {
    store = new MemoryStore();
    await store.set('expire-key', { count: 1, resetTime: Date.now() + 50 }, 50);
    // Wait for expiration
    await new Promise((r) => setTimeout(r, 100));
    const record = await store.get('expire-key');
    expect(record).toBeNull();
  });

  it('should return 0 when incrementing expired/missing keys', async () => {
    store = new MemoryStore();
    const count = await store.increment('missing');
    expect(count).toBe(0);
  });

  it('should destroy and clear all entries', async () => {
    store = new MemoryStore();
    await store.set('a', { count: 1, resetTime: Date.now() + 60000 }, 60000);
    await store.set('b', { count: 2, resetTime: Date.now() + 60000 }, 60000);
    store.destroy();
    const a = await store.get('a');
    const b = await store.get('b');
    expect(a).toBeNull();
    expect(b).toBeNull();
  });
});

describe('FixedWindowStrategy', () => {
  let store: MemoryStore;

  afterEach(() => {
    if (store) store.destroy();
  });

  it('should allow requests within the limit', async () => {
    store = new MemoryStore();
    const strategy = new FixedWindowStrategy(store, 5, 60000);

    const result = await strategy.consume('client-1');
    expect(result.exceeded).toBe(false);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
  });

  it('should track remaining requests correctly', async () => {
    store = new MemoryStore();
    const strategy = new FixedWindowStrategy(store, 3, 60000);

    await strategy.consume('client-1');
    await strategy.consume('client-1');
    const result = await strategy.consume('client-1');
    expect(result.remaining).toBe(0);
    expect(result.exceeded).toBe(false);
  });

  it('should exceed the limit after max requests', async () => {
    store = new MemoryStore();
    const strategy = new FixedWindowStrategy(store, 2, 60000);

    await strategy.consume('client-1');
    await strategy.consume('client-1');
    const result = await strategy.consume('client-1');
    expect(result.exceeded).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('should isolate different clients', async () => {
    store = new MemoryStore();
    const strategy = new FixedWindowStrategy(store, 2, 60000);

    await strategy.consume('client-1');
    await strategy.consume('client-1');
    const r1 = await strategy.consume('client-1');
    expect(r1.exceeded).toBe(true);

    const r2 = await strategy.consume('client-2');
    expect(r2.exceeded).toBe(false);
    expect(r2.remaining).toBe(1);
  });

  it('should reset a client key', async () => {
    store = new MemoryStore();
    const strategy = new FixedWindowStrategy(store, 2, 60000);

    await strategy.consume('client-1');
    await strategy.consume('client-1');
    await strategy.reset('client-1');
    const result = await strategy.consume('client-1');
    expect(result.exceeded).toBe(false);
    expect(result.remaining).toBe(4); // first request in new window
  });
});

describe('SlidingWindowStrategy', () => {
  let store: MemoryStore;

  afterEach(() => {
    if (store) store.destroy();
  });

  it('should allow requests within the limit', async () => {
    store = new MemoryStore();
    const strategy = new SlidingWindowStrategy(store, 10, 60000);

    const result = await strategy.consume('client-1');
    expect(result.exceeded).toBe(false);
    expect(result.limit).toBe(10);
  });

  it('should track requests with sliding window weighting', async () => {
    store = new MemoryStore();
    const strategy = new SlidingWindowStrategy(store, 5, 60000);

    for (let i = 0; i < 5; i++) {
      await strategy.consume('client-1');
    }
    const result = await strategy.consume('client-1');
    expect(result.exceeded).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('should isolate different clients', async () => {
    store = new MemoryStore();
    const strategy = new SlidingWindowStrategy(store, 3, 60000);

    for (let i = 0; i < 3; i++) {
      await strategy.consume('client-1');
    }
    const r1 = await strategy.consume('client-1');
    expect(r1.exceeded).toBe(true);

    const r2 = await strategy.consume('client-2');
    expect(r2.exceeded).toBe(false);
  });

  it('should reset client state', async () => {
    store = new MemoryStore();
    const strategy = new SlidingWindowStrategy(store, 3, 60000);

    for (let i = 0; i < 3; i++) {
      await strategy.consume('client-1');
    }
    await strategy.reset('client-1');
    const result = await strategy.consume('client-1');
    expect(result.exceeded).toBe(false);
  });
});

describe('TokenBucketStrategy', () => {
  let store: MemoryStore;

  afterEach(() => {
    if (store) store.destroy();
  });

  it('should allow requests when tokens are available', async () => {
    store = new MemoryStore();
    const strategy = new TokenBucketStrategy(store, 10, 60000);

    const result = await strategy.consume('client-1');
    expect(result.exceeded).toBe(false);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
  });

  it('should deplete tokens with successive requests', async () => {
    store = new MemoryStore();
    const strategy = new TokenBucketStrategy(store, 3, 60000);

    await strategy.consume('client-1'); // 2 remaining
    await strategy.consume('client-1'); // 1 remaining
    const r3 = await strategy.consume('client-1'); // 0 remaining
    expect(r3.remaining).toBe(0);
    expect(r3.exceeded).toBe(false);

    const r4 = await strategy.consume('client-1'); // exceeded
    expect(r4.exceeded).toBe(true);
  });

  it('should isolate different clients', async () => {
    store = new MemoryStore();
    const strategy = new TokenBucketStrategy(store, 2, 60000);

    await strategy.consume('client-1');
    await strategy.consume('client-1');
    const r1 = await strategy.consume('client-1');
    expect(r1.exceeded).toBe(true);

    const r2 = await strategy.consume('client-2');
    expect(r2.exceeded).toBe(false);
  });

  it('should reset a client bucket', async () => {
    store = new MemoryStore();
    const strategy = new TokenBucketStrategy(store, 2, 60000);

    await strategy.consume('client-1');
    await strategy.consume('client-1');
    await strategy.reset('client-1');

    const result = await strategy.consume('client-1');
    expect(result.exceeded).toBe(false);
    expect(result.remaining).toBe(1);
  });
});

describe('createKey', () => {
  it('should create a namespaced key', () => {
    expect(createKey('rate-shield', '192.168.1.1')).toBe('rate-shield:192.168.1.1');
  });

  it('should handle empty prefix', () => {
    expect(createKey('', 'user-123')).toBe(':user-123');
  });
});

describe('parseWindowMs', () => {
  it('should return number values as-is', () => {
    expect(parseWindowMs(5000)).toBe(5000);
  });

  it('should parse milliseconds', () => {
    expect(parseWindowMs('100ms')).toBe(100);
  });

  it('should parse seconds', () => {
    expect(parseWindowMs('10s')).toBe(10000);
  });

  it('should parse minutes', () => {
    expect(parseWindowMs('5m')).toBe(300000);
  });

  it('should parse hours', () => {
    expect(parseWindowMs('1h')).toBe(3600000);
  });

  it('should parse days', () => {
    expect(parseWindowMs('1d')).toBe(86400000);
  });

  it('should handle decimal values', () => {
    expect(parseWindowMs('1.5s')).toBe(1500);
  });

  it('should throw for invalid formats', () => {
    expect(() => parseWindowMs('abc')).toThrow('Invalid window format');
    expect(() => parseWindowMs('10x')).toThrow('Invalid window format');
  });
});
