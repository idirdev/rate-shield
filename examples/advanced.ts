/**
 * rate-shield — Advanced Usage Example
 *
 * Demonstrates:
 *  - Per-route rate limits with different strategies
 *  - Custom key generators (by API key, user ID)
 *  - IP whitelist
 *  - Token bucket for bursty endpoints
 *  - Leaky bucket for strict constant-rate endpoints
 *
 * Run:  npx ts-node examples/advanced.ts
 */

import express, { Request } from 'express';
import { rateLimit, MemoryStore } from '../src';

const app = express();
app.use(express.json());

// ─── Shared store (optional: strategies can share one store) ────────
const sharedStore = new MemoryStore(30_000); // cleanup every 30s

// ─── 1. Strict API rate limit (sliding window) ─────────────────────
//    Key by API key header instead of IP.
const apiLimiter = rateLimit({
  strategy: 'sliding-window',
  max: 100,
  windowMs: 15 * 60 * 1000, // 15 minutes
  store: sharedStore,
  keyGenerator: (req: Request): string => {
    return (req.headers['x-api-key'] as string) || req.ip || '127.0.0.1';
  },
  whitelist: ['127.0.0.1', '::1', 'trusted-internal-key'],
  message: {
    error: 'Rate Limit Exceeded',
    message: 'API limit: 100 requests per 15 minutes. Upgrade your plan for higher limits.',
    retryAfter: '15 minutes',
  },
});

// ─── 2. Auth endpoint: very strict (fixed window) ──────────────────
//    Prevent brute-force login attempts.
const authLimiter = rateLimit({
  strategy: 'fixed-window',
  max: 5,
  windowMs: 15 * 60 * 1000, // 5 attempts per 15 minutes
  store: sharedStore,
  message: {
    error: 'Too Many Login Attempts',
    message: 'Please wait 15 minutes before trying again.',
  },
});

// ─── 3. Upload endpoint: token bucket (allow short bursts) ─────────
//    Users can burst up to 10 uploads quickly, then limited to ~2/min.
const uploadLimiter = rateLimit({
  strategy: 'token-bucket',
  max: 10,                        // bucket capacity (burst size)
  windowMs: 5 * 60 * 1000,       // 5-minute conceptual window
  refillRate: 1,                  // 1 token per refill
  refillIntervalMs: 30_000,      // refill every 30s (~2/min sustained)
  store: sharedStore,
  keyGenerator: (req: Request): string => {
    // Key by authenticated user ID if available, otherwise IP
    const userId = req.headers['x-user-id'] as string;
    return userId || req.ip || '127.0.0.1';
  },
  message: {
    error: 'Upload Limit Reached',
    message: 'Upload capacity exhausted. Tokens refill at ~2 per minute.',
  },
});

// ─── 4. Webhook receiver: leaky bucket (constant drain) ────────────
//    Ensures downstream processing at a steady rate.
const webhookLimiter = rateLimit({
  strategy: 'leaky-bucket',
  max: 50,                    // bucket capacity
  windowMs: 60_000,          // 1-minute window
  drainRate: 5,              // process 5 requests per second
  store: sharedStore,
  skip: (req: Request): boolean => {
    // Allow internal webhook verification requests through
    return req.headers['x-webhook-verify'] === 'true';
  },
  message: {
    error: 'Webhook Rate Limited',
    message: 'Incoming webhooks are being processed. Please slow down.',
  },
});

// ─── Routes ─────────────────────────────────────────────────────────

// Public API routes with sliding window
app.use('/api', apiLimiter);

app.get('/api/users', (_req, res) => {
  res.json({ users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] });
});

app.get('/api/products', (_req, res) => {
  res.json({ products: [{ id: 1, name: 'Widget', price: 9.99 }] });
});

// Auth routes with strict fixed window
app.post('/auth/login', authLimiter, (req, res) => {
  const { email } = req.body as { email?: string };
  res.json({ message: `Login attempt for ${email || 'unknown'}`, success: true });
});

app.post('/auth/register', authLimiter, (req, res) => {
  const { email } = req.body as { email?: string };
  res.json({ message: `Registration for ${email || 'unknown'}`, success: true });
});

// Upload route with token bucket (burst-friendly)
app.post('/api/upload', uploadLimiter, (req, res) => {
  res.json({ message: 'File uploaded successfully', fileId: Date.now() });
});

// Webhook receiver with leaky bucket (constant rate)
app.post('/webhooks/incoming', webhookLimiter, (req, res) => {
  res.json({ received: true, processedAt: new Date().toISOString() });
});

// Health check (no rate limit)
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ─── Start server ───────────────────────────────────────────────────
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[rate-shield] Advanced example running on http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  /api/users          - Sliding window (100 req / 15 min, by API key)`);
  console.log(`  GET  /api/products       - Sliding window (same limiter)`);
  console.log(`  POST /auth/login         - Fixed window   (5 req / 15 min, by IP)`);
  console.log(`  POST /auth/register      - Fixed window   (5 req / 15 min, by IP)`);
  console.log(`  POST /api/upload         - Token bucket   (burst 10, refill ~2/min, by user)`);
  console.log(`  POST /webhooks/incoming  - Leaky bucket   (capacity 50, drain 5/sec)`);
  console.log(`  GET  /health             - No rate limit`);
  console.log('');
  console.log('Try:');
  console.log(`  curl -i http://localhost:${PORT}/api/users`);
  console.log(`  curl -i -X POST http://localhost:${PORT}/auth/login -H "Content-Type: application/json" -d '{"email":"test@example.com"}'`);
  console.log(`  curl -i -X POST http://localhost:${PORT}/api/upload -H "x-user-id: user_123"`);
});
