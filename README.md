# Rate Shield

[![npm version](https://img.shields.io/npm/v/rate-shield.svg)](https://www.npmjs.com/package/rate-shield)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Advanced rate limiting middleware for Express with multiple strategies, pluggable stores, custom key generators, and full `X-RateLimit-*` header support.

---

## Features

- **4 rate limiting strategies** -- Fixed Window, Sliding Window, Token Bucket, Leaky Bucket
- **Pluggable stores** -- In-memory (built-in) with TTL cleanup; interface for Redis, database, etc.
- **Custom key generators** -- Rate limit by IP, API key, user ID, or any request property
- **Standard headers** -- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
- **Whitelist support** -- Exempt trusted IPs or keys from rate limiting
- **Skip function** -- Dynamically bypass the limiter for specific requests
- **Fail-open design** -- If the limiter errors, requests pass through (no accidental downtime)
- **TypeScript-first** -- Full type definitions, generics, and IntelliSense support
- **Zero dependencies** -- Only requires Express as a peer dependency

---

## Installation

```bash
npm install rate-shield
```

---

## Quick Start

```typescript
import express from 'express';
import { rateLimit } from 'rate-shield';

const app = express();

// 100 requests per minute per IP (fixed window)
app.use(rateLimit({
  strategy: 'fixed-window',
  max: 100,
  windowMs: 60_000,
}));

app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello!' });
});

app.listen(3000);
```

---

## Strategies

### Fixed Window

Divides time into fixed intervals and counts requests per window. Simple and memory-efficient.

```typescript
rateLimit({
  strategy: 'fixed-window',
  max: 100,
  windowMs: 60_000,
})
```

### Sliding Window

Weights the previous window's count with the current window for a smoother approximation. Prevents boundary burst attacks.

```typescript
rateLimit({
  strategy: 'sliding-window',
  max: 100,
  windowMs: 60_000,
})
```

### Token Bucket

Maintains a bucket of tokens that refills at a steady rate. Allows short bursts up to the bucket capacity while enforcing a long-term average rate.

```typescript
rateLimit({
  strategy: 'token-bucket',
  max: 10,                   // burst capacity
  windowMs: 5 * 60_000,     // 5-minute window
  refillRate: 1,             // 1 token per refill interval
  refillIntervalMs: 30_000,  // refill every 30 seconds
})
```

### Leaky Bucket

Requests fill a bucket that drains at a constant rate. Produces perfectly smooth output regardless of input burstiness.

```typescript
rateLimit({
  strategy: 'leaky-bucket',
  max: 50,          // bucket capacity
  windowMs: 60_000,
  drainRate: 5,     // drain 5 requests per second
})
```

---

## Strategy Comparison

| Strategy | Burst Handling | Accuracy | Memory | Best For |
|---|---|---|---|---|
| **Fixed Window** | Allows 2x burst at boundary | Low | Very Low | Simple APIs, internal services |
| **Sliding Window** | Smooth, no boundary burst | Medium | Low | Public APIs, general use |
| **Token Bucket** | Controlled bursts allowed | High | Medium | APIs with bursty traffic patterns |
| **Leaky Bucket** | No burst tolerance | Very High | Medium | Strict rate enforcement, webhooks |

---

## API Reference

### `rateLimit(options)`

Creates an Express middleware function.

#### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `strategy` | `StrategyName` | `'fixed-window'` | Algorithm to use |
| `max` | `number` | `100` | Max requests per window |
| `windowMs` | `number` | `60000` | Window duration in milliseconds |
| `keyGenerator` | `(req) => string` | Client IP | Function to generate unique client key |
| `skip` | `(req) => boolean` | `undefined` | Return `true` to bypass rate limiting |
| `whitelist` | `string[]` | `[]` | Keys/IPs that are never rate limited |
| `message` | `string \| object` | `{ error: '...' }` | Response body when rate limited |
| `statusCode` | `number` | `429` | HTTP status when rate limited |
| `headers` | `boolean` | `true` | Include `X-RateLimit-*` headers |
| `store` | `Store` | `MemoryStore` | Backing store instance |
| `refillRate` | `number` | `max / 10` | Tokens per refill (token-bucket only) |
| `refillIntervalMs` | `number` | `windowMs / 10` | Refill interval ms (token-bucket only) |
| `drainRate` | `number` | auto | Requests/sec drain rate (leaky-bucket only) |

### Response Headers

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Maximum requests allowed in window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when window resets |
| `X-RateLimit-Policy` | Strategy name in use |
| `Retry-After` | Seconds to wait (only on 429 responses) |

---

## Advanced Usage

### Per-Route Limits

```typescript
import { rateLimit } from 'rate-shield';

// Strict limit for auth endpoints
const authLimiter = rateLimit({
  strategy: 'fixed-window',
  max: 5,
  windowMs: 15 * 60_000,
});

// Generous limit for read endpoints
const apiLimiter = rateLimit({
  strategy: 'sliding-window',
  max: 200,
  windowMs: 60_000,
});

app.post('/auth/login', authLimiter, loginHandler);
app.use('/api', apiLimiter);
```

### Custom Key Generator

```typescript
rateLimit({
  max: 100,
  windowMs: 60_000,
  keyGenerator: (req) => {
    // Rate limit by API key instead of IP
    return req.headers['x-api-key'] as string || req.ip || '127.0.0.1';
  },
})
```

### Whitelist

```typescript
rateLimit({
  max: 50,
  windowMs: 60_000,
  whitelist: ['127.0.0.1', '::1', '10.0.0.0'],
})
```

### Skip Function

```typescript
rateLimit({
  max: 50,
  windowMs: 60_000,
  skip: (req) => {
    // Skip rate limiting for admin users
    return req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
  },
})
```

### Custom Store

Implement the `Store` interface to use Redis, a database, or any other backing store:

```typescript
import { Store, StoreRecord } from 'rate-shield';

class RedisStore implements Store {
  async get(key: string): Promise<StoreRecord | null> { /* ... */ }
  async set(key: string, record: StoreRecord, ttlMs: number): Promise<void> { /* ... */ }
  async increment(key: string, amount?: number): Promise<number> { /* ... */ }
  async decrement(key: string, amount?: number): Promise<number> { /* ... */ }
  async reset(key: string): Promise<void> { /* ... */ }
}

rateLimit({
  max: 100,
  windowMs: 60_000,
  store: new RedisStore(),
})
```

---

## Utilities

### `parseWindowMs(value)`

Parse human-readable duration strings:

```typescript
import { parseWindowMs } from 'rate-shield';

parseWindowMs('10s');  // 10000
parseWindowMs('5m');   // 300000
parseWindowMs('1h');   // 3600000
parseWindowMs('1d');   // 86400000
parseWindowMs(60000);  // 60000
```

### `getClientIp(req)`

Extract client IP from Express request (supports `X-Forwarded-For`, `X-Real-IP`):

```typescript
import { getClientIp } from 'rate-shield';

app.use((req, res, next) => {
  console.log('Client IP:', getClientIp(req));
  next();
});
```

---

## Examples

See the [`examples/`](./examples) directory:

- **`basic.ts`** -- Global rate limiter with fixed window
- **`advanced.ts`** -- Per-route limits, custom keys, whitelist, all 4 strategies

```bash
npx ts-node examples/basic.ts
npx ts-node examples/advanced.ts
```

---

## License

MIT

---

## 🇫🇷 Documentation en français

### Description
`rate-shield` est un middleware Express avancé de limitation de débit (rate limiting) avec quatre stratégies (fenêtre fixe, fenêtre glissante, token bucket, leaky bucket), des stores enfichables, des générateurs de clés personnalisés et un support complet des en-têtes `X-RateLimit-*`. Zéro dépendances hormis Express.

### Installation
```bash
npm install rate-shield
```

### Utilisation
```typescript
import express from 'express';
import { rateLimit } from 'rate-shield';

const app = express();

// 100 requêtes par minute par IP (fenêtre fixe)
app.use(rateLimit({
  strategy: 'fixed-window',
  max: 100,
  windowMs: 60_000,
}));
```

Consultez la documentation anglaise ci-dessus pour la comparaison des stratégies, les options avancées et l'implémentation de stores personnalisés.