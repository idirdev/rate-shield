import { Request } from 'express';

/**
 * Extract the client IP address from an Express request.
 * Supports common proxy headers (X-Forwarded-For, X-Real-IP) and
 * falls back to req.ip / socket remote address.
 */
export function getClientIp(req: Request): string {
  // X-Forwarded-For may contain a comma-separated list; take the first (original client)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0];
    return first.trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return (Array.isArray(realIp) ? realIp[0] : realIp).trim();
  }

  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Create a namespaced store key from a prefix and the client identifier.
 *
 * @param prefix  Namespace prefix (e.g., 'rate-shield')
 * @param id      Client identifier (IP, user ID, API key, etc.)
 * @returns       A deterministic store key string
 */
export function createKey(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

/**
 * Parse a human-readable window string into milliseconds.
 *
 * Supported formats:
 *   - number (already ms)
 *   - '10s'  -> 10000
 *   - '5m'   -> 300000
 *   - '1h'   -> 3600000
 *   - '1d'   -> 86400000
 *
 * @param value  Window duration as number (ms) or string
 * @returns      Duration in milliseconds
 */
export function parseWindowMs(value: number | string): number {
  if (typeof value === 'number') {
    return value;
  }

  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i);
  if (!match) {
    throw new Error(
      `Invalid window format "${value}". Expected a number (ms) or string like "10s", "5m", "1h", "1d".`
    );
  }

  const amount = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return Math.floor(amount * multipliers[unit]);
}
