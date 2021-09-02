/**
 * rate-shield — Basic Usage Example
 *
 * Demonstrates how to apply a global rate limiter to an Express application
 * using the default fixed-window strategy.
 *
 * Run:  npx ts-node examples/basic.ts
 * Test: curl -i http://localhost:3000/api/data  (repeat rapidly to trigger limit)
 */

import express from 'express';
import { rateLimit } from '../src';

const app = express();

// ─── Global rate limiter ────────────────────────────────────────────
// Allow 20 requests per 1-minute window per IP address.
const limiter = rateLimit({
  strategy: 'fixed-window',
  max: 20,
  windowMs: 60_000, // 1 minute
  message: {
    error: 'Too Many Requests',
    message: 'You have exceeded the limit of 20 requests per minute.',
  },
});

app.use(limiter);

// ─── Routes ─────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Welcome to the API' });
});

app.get('/api/data', (_req, res) => {
  res.json({
    data: [
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Bravo' },
      { id: 3, name: 'Charlie' },
    ],
  });
});

// ─── Start server ───────────────────────────────────────────────────
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`[rate-shield] Basic example running on http://localhost:${PORT}`);
  console.log(`[rate-shield] Strategy: fixed-window | Max: 20 req/min`);
  console.log(`[rate-shield] Try: curl -i http://localhost:${PORT}/api/data`);
});
