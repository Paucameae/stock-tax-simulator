// Fetch historical EUR/USD exchange rates from the ECB Statistical Data Warehouse
// API: https://data-api.ecb.europa.eu/

const ECB_API_BASE = 'https://data-api.ecb.europa.eu/service/data/EXR';
const RATE_CACHE_KEY = 'ecbRateCache';

type RateCache = Record<string, number>; // "YYYY-MM-DD" -> EUR/USD rate

function loadCache(): RateCache {
  try {
    return JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveCache(cache: RateCache): void {
  localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(cache));
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Convert a USD amount to EUR using the given EUR/USD rate.
 * EUR/USD rate means 1 EUR = rate USD, so EUR = USD / rate.
 */
export function convertUsdToEur(usdAmount: number, eurUsdRate: number): number {
  if (eurUsdRate <= 0) return usdAmount;
  return usdAmount / eurUsdRate;
}

/**
 * Fetch EUR/USD rates for multiple dates.
 * Uses localStorage cache, only fetches missing dates from ECB.
 */
export async function fetchECBRates(dates: Date[]): Promise<RateCache> {
  const cache = loadCache();
  const uniqueKeys = [...new Set(dates.map(formatDateKey))];
  const missing = uniqueKeys.filter((k) => !cache[k]);

  if (missing.length === 0) return cache;

  const sorted = missing.sort();
  const startDate = new Date(sorted[0]);
  startDate.setDate(startDate.getDate() - 7); // look back 7 days for weekends/holidays
  const startStr = formatDateKey(startDate);
  const endStr = sorted[sorted.length - 1];

  try {
    const url = `${ECB_API_BASE}/D.USD.EUR.SP00.A?startPeriod=${startStr}&endPeriod=${endStr}&format=csvdata`;
    const response = await fetch(url);
    if (!response.ok) return cache;

    const text = await response.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return cache;

    const header = lines[0].split(',');
    const timeIdx = header.indexOf('TIME_PERIOD');
    const valueIdx = header.indexOf('OBS_VALUE');
    if (timeIdx === -1 || valueIdx === -1) return cache;

    // Parse all available rates from the response
    const allRates: RateCache = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const dateKey = cols[timeIdx];
      const rate = parseFloat(cols[valueIdx]);
      if (dateKey && !isNaN(rate)) {
        allRates[dateKey] = rate;
      }
    }

    // For each missing date, find the closest earlier business day rate
    const available = Object.keys(allRates).sort();
    for (const dateStr of missing) {
      if (allRates[dateStr]) {
        cache[dateStr] = allRates[dateStr];
      } else {
        const earlier = available.filter((d) => d <= dateStr);
        if (earlier.length > 0) {
          cache[dateStr] = allRates[earlier[earlier.length - 1]];
        }
      }
    }
  } catch {
    // Silent fail — rates will stay missing, user can enter manually
  }

  saveCache(cache);
  return cache;
}
