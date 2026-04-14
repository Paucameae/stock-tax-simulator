// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatDateKey, convertUsdToEur, fetchECBRates } from '../ecb-rates';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('formatDateKey', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(formatDateKey(new Date(2024, 0, 5))).toBe('2024-01-05');
    expect(formatDateKey(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('zero-pads month and day', () => {
    expect(formatDateKey(new Date(2024, 2, 3))).toBe('2024-03-03');
  });
});

describe('convertUsdToEur', () => {
  it('converts using EUR/USD rate', () => {
    // 1 EUR = 1.1 USD → 110 USD = 100 EUR
    expect(convertUsdToEur(110, 1.1)).toBeCloseTo(100, 2);
  });

  it('returns usdAmount if rate is 0 or negative', () => {
    expect(convertUsdToEur(100, 0)).toBe(100);
    expect(convertUsdToEur(100, -1)).toBe(100);
  });

  it('handles rate of 1', () => {
    expect(convertUsdToEur(50, 1)).toBe(50);
  });
});

describe('fetchECBRates', () => {
  const CSV_RESPONSE = [
    'KEY,FREQ,CURRENCY,TIME_PERIOD,OBS_VALUE',
    'EXR.D.USD.EUR.SP00.A,D,USD,2024-03-01,1.0850',
    'EXR.D.USD.EUR.SP00.A,D,USD,2024-03-04,1.0900',
    'EXR.D.USD.EUR.SP00.A,D,USD,2024-03-05,1.0920',
  ].join('\n');

  it('returns cached rates without fetching', async () => {
    localStorage.setItem('ecbRateCache', JSON.stringify({ '2024-03-01': 1.085 }));
    localStorage.setItem('ecbRateCacheTimestamp', String(Date.now()));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await fetchECBRates([new Date(2024, 2, 1)]);

    expect(result['2024-03-01']).toBe(1.085);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches missing dates from ECB', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(CSV_RESPONSE, { status: 200 })
    );

    const result = await fetchECBRates([new Date(2024, 2, 1), new Date(2024, 2, 5)]);

    expect(result['2024-03-01']).toBe(1.085);
    expect(result['2024-03-05']).toBe(1.092);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('falls back to nearest earlier business day for weekends', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(CSV_RESPONSE, { status: 200 })
    );

    // March 2 is a Saturday — should fall back to March 1
    const result = await fetchECBRates([new Date(2024, 2, 2)]);
    expect(result['2024-03-02']).toBe(1.085);
  });

  it('returns cache unchanged on network error', async () => {
    localStorage.setItem('ecbRateCache', JSON.stringify({ '2024-01-01': 1.1 }));
    localStorage.setItem('ecbRateCacheTimestamp', String(Date.now()));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await fetchECBRates([new Date(2024, 0, 1), new Date(2024, 2, 1)]);

    expect(result['2024-01-01']).toBe(1.1);
  });

  it('returns cache on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 })
    );

    const result = await fetchECBRates([new Date(2024, 2, 1)]);
    expect(result['2024-03-01']).toBeUndefined();
  });

  it('saves fetched rates to localStorage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(CSV_RESPONSE, { status: 200 })
    );

    await fetchECBRates([new Date(2024, 2, 1)]);

    const cached = JSON.parse(localStorage.getItem('ecbRateCache') || '{}');
    expect(cached['2024-03-01']).toBe(1.085);
  });

  it('expires recent dates after 24h', async () => {
    const staleTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25h ago
    const todayKey = formatDateKey(new Date());
    localStorage.setItem('ecbRateCache', JSON.stringify({
      '2020-01-01': 1.12,  // old — should stay
      [todayKey]: 1.08,     // recent — should be expired
    }));
    localStorage.setItem('ecbRateCacheTimestamp', String(staleTimestamp));

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('KEY,FREQ,CURRENCY,TIME_PERIOD,OBS_VALUE', { status: 200 })
    );

    const result = await fetchECBRates([new Date(2020, 0, 1)]);

    // Old date should still be cached
    expect(result['2020-01-01']).toBe(1.12);
  });
});
