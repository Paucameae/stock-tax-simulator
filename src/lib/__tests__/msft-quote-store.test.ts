// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchMsftQuote,
  getMsftQuote,
  isQuoteStale,
  resetMsftQuoteStore,
  subscribeToMsftQuote,
  QUOTE_TTL_MS,
} from '../msft-quote-store';
import { formatDateKey } from '../ecb-rates';

const QUOTE = { c: 400, d: 4, dp: 1, t: 1_700_000_000, _cachedAt: '2026-07-29T09:00:00.000Z' };

function quoteResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => QUOTE,
  } as unknown as Response;
}

describe('msft-quote-store', () => {
  beforeEach(() => {
    resetMsftQuoteStore();
    localStorage.clear();
    // Seed today's ECB rate so the conversion never reaches the network.
    localStorage.setItem('ecbRateCache', JSON.stringify({ [formatDateKey(new Date())]: 1.1 }));
    localStorage.setItem('ecbRateCacheTimestamp', String(Date.now()));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('issues a single request when several consumers ask at once', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(quoteResponse());

    await Promise.all([fetchMsftQuote(), fetchMsftQuote(), fetchMsftQuote()]);

    const quoteCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/api/msft-quote'));
    expect(quoteCalls).toHaveLength(1);
    expect(getMsftQuote().usdPrice).toBe(400);
    expect(getMsftQuote().loading).toBe(false);
  });

  it('skips the network while the cached quote is fresh, and refetches when forced', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(quoteResponse());

    await fetchMsftQuote();
    await fetchMsftQuote();
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes('/api/msft-quote'))).toHaveLength(1);

    await fetchMsftQuote({ force: true });
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes('/api/msft-quote'))).toHaveLength(2);
  });

  it('considers the quote stale once the TTL has elapsed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(quoteResponse());
    await fetchMsftQuote();

    expect(isQuoteStale()).toBe(false);
    expect(isQuoteStale(Date.now() + QUOTE_TTL_MS)).toBe(true);
  });

  it('keeps the quote stale after a failure so the next call retries', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));

    await fetchMsftQuote();

    expect(getMsftQuote().error).toBeTruthy();
    expect(getMsftQuote().fetchedAt).toBeNull();
    expect(isQuoteStale()).toBe(true);
  });

  it('notifies subscribers and stops once they unsubscribe', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(quoteResponse());
    const listener = vi.fn();
    const unsubscribe = subscribeToMsftQuote(listener);

    await fetchMsftQuote();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    const callsAfterUnsubscribe = listener.mock.calls.length;
    await fetchMsftQuote({ force: true });
    expect(listener.mock.calls.length).toBe(callsAfterUnsubscribe);
  });
});
