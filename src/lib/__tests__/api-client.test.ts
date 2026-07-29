// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchWithTimeout,
  httpErrorMessage,
  parseRetryAfter,
  apiErrorMessage,
  isAbortError,
} from '../api-client';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchWithTimeout', () => {
  it('resolves with the response when the request completes in time', async () => {
    const response = new Response('{}', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(fetchWithTimeout('/api/x', {}, 1000)).resolves.toBe(response);
  });

  it('aborts with a TimeoutError once the deadline elapses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          })
      )
    );
    const promise = fetchWithTimeout('/api/x', {}, 20);
    await expect(promise).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('forwards an external abort to the underlying request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')));
          })
      )
    );
    const controller = new AbortController();
    const promise = fetchWithTimeout('/api/x', { signal: controller.signal }, 5000);
    controller.abort();
    await expect(promise).rejects.toSatisfy(isAbortError);
  });
});

describe('parseRetryAfter', () => {
  it('reads a numeric Retry-After header', () => {
    const res = new Response('', { headers: { 'Retry-After': '42' } });
    expect(parseRetryAfter(res)).toBe(42);
  });

  it('returns undefined when absent or non-numeric', () => {
    expect(parseRetryAfter(new Response(''))).toBeUndefined();
    expect(parseRetryAfter(new Response('', { headers: { 'Retry-After': 'later' } }))).toBeUndefined();
  });
});

describe('httpErrorMessage', () => {
  it('mentions the retry delay on 429', () => {
    expect(httpErrorMessage(429, 30)).toContain('30 s');
  });

  it('distinguishes 503, 5xx and 4xx', () => {
    expect(httpErrorMessage(503)).toContain('temporairement indisponible');
    expect(httpErrorMessage(500)).toContain('erreur');
    expect(httpErrorMessage(400)).toContain('refusée');
  });
});

describe('apiErrorMessage', () => {
  it('reports a timeout explicitly', () => {
    const err = new DOMException('t', 'TimeoutError');
    expect(apiErrorMessage(err, 'fallback')).toContain('Délai dépassé');
  });

  it('reports offline state before anything else', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(apiErrorMessage(new Error('boom'), 'fallback')).toContain('hors ligne');
  });

  it('turns a fetch TypeError into a network message', () => {
    expect(apiErrorMessage(new TypeError('Failed to fetch'), 'fallback')).toContain('Connexion impossible');
  });

  it('passes through an already user-facing message', () => {
    expect(apiErrorMessage(new Error('Trop de requêtes — réessayez dans 30 s.'), 'fallback')).toBe(
      'Trop de requêtes — réessayez dans 30 s.'
    );
  });

  it('falls back for unknown values', () => {
    expect(apiErrorMessage('nope', 'fallback')).toBe('fallback');
  });
});
