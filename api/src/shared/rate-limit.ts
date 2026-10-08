import type { HttpRequest } from '@azure/functions';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  maxEntries?: number;
  now?: () => number;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const DEFAULT_MAX_ENTRIES = 5000;

/**
 * Resolve the client address supplied by the trusted Azure reverse proxy.
 * Deliberately ignore x-client-ip because callers can set it themselves.
 */
export function getClientIp(req: Pick<HttpRequest, 'headers'>): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const {
    windowMs,
    maxRequests,
    maxEntries = DEFAULT_MAX_ENTRIES,
    now = Date.now,
  } = options;
  const buckets = new Map<string, RateBucket>();

  return {
    check(key: string): RateLimitResult {
      const currentTime = now();
      const entry = buckets.get(key);

      if (!entry || entry.resetAt <= currentTime) {
        if (buckets.size >= maxEntries) {
          for (const [bucketKey, bucket] of buckets) {
            if (bucket.resetAt <= currentTime) buckets.delete(bucketKey);
          }
          if (buckets.size >= maxEntries) {
            const oldestKey = buckets.keys().next().value;
            if (oldestKey) buckets.delete(oldestKey);
          }
        }
        buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
        return { allowed: true, retryAfterSec: 0 };
      }

      if (entry.count >= maxRequests) {
        return {
          allowed: false,
          retryAfterSec: Math.ceil((entry.resetAt - currentTime) / 1000),
        };
      }

      entry.count++;
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}
