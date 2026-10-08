import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createRateLimiter, getClientIp } from '../shared/rate-limit';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cached: { data: unknown; timestamp: number } | null = null;

const rateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
});

export async function msftQuote(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const ip = getClientIp(req);
  const limit = rateLimiter.check(ip);
  if (!limit.allowed) {
    return {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSec) },
      jsonBody: { error: 'Too many requests. Please retry later.' },
    };
  }

  // Serve from cache if fresh
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { status: 200, jsonBody: { ...cached.data as Record<string, unknown>, _cachedAt: cached.timestamp } };
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    context.error('FINNHUB_API_KEY is not configured');
    // 503: service unavailable (less exploitable than 500 which suggests a bug)
    return { status: 503, jsonBody: { error: 'Service temporarily unavailable' } };
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=MSFT&token=${encodeURIComponent(apiKey)}`
    );

    if (!res.ok) {
      return { status: res.status, jsonBody: { error: 'Finnhub API error' } };
    }

    const data = await res.json();
    cached = { data, timestamp: Date.now() };
    return { status: 200, jsonBody: { ...data, _cachedAt: cached.timestamp } };
  } catch (err) {
    context.error('Failed to fetch Finnhub quote:', err);
    return { status: 502, jsonBody: { error: 'Failed to reach Finnhub API' } };
  }
}

app.http('msft-quote', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: msftQuote,
});
