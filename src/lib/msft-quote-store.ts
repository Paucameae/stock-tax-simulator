/**
 * Shared MSFT quote. The three views that show a live price (portefeuille,
 * simulation, non acquises) all stay mounted once visited, so a per-component
 * hook meant one network round-trip each against a 20 req/min rate limit.
 * One store, one in-flight request, refreshed when the tab returns to the
 * foreground and the quote has gone stale.
 */
import { fetchECBRates, convertUsdToEur, formatDateKey } from './ecb-rates';
import { formatUSD } from './utils';
import {
  fetchWithTimeout,
  httpErrorMessage,
  parseRetryAfter,
  apiErrorMessage,
} from './api-client';

export interface MsftQuoteState {
  usdPrice: number | null;
  eurPrice: number | null;
  change: number | null;
  changeEur: number | null;
  changePercent: number | null;
  marketTimestamp: Date | null;
  lastUpdated: Date | null;
  error: string | null;
  loading: boolean;
  /** Client-side timestamp of the last completed fetch; drives staleness. */
  fetchedAt: number | null;
}

/** Matches the server-side quote cache: asking sooner cannot return anything new. */
export const QUOTE_TTL_MS = 5 * 60 * 1000;

const INITIAL: MsftQuoteState = {
  usdPrice: null,
  eurPrice: null,
  change: null,
  changeEur: null,
  changePercent: null,
  marketTimestamp: null,
  lastUpdated: null,
  error: null,
  loading: false,
  fetchedAt: null,
};

let state: MsftQuoteState = INITIAL;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

function emit(patch: Partial<MsftQuoteState>) {
  state = { ...state, ...patch };
  for (const listener of [...listeners]) listener();
}

export function getMsftQuote(): MsftQuoteState {
  return state;
}

export function isQuoteStale(now: number = Date.now()): boolean {
  return state.fetchedAt === null || now - state.fetchedAt >= QUOTE_TTL_MS;
}

async function runFetch(): Promise<void> {
  emit({ loading: true, error: null });
  try {
    const res = await fetchWithTimeout('/api/msft-quote');
    if (!res.ok) throw new Error(httpErrorMessage(res.status, parseRetryAfter(res)));
    const data = await res.json();
    if (!data.c || data.c === 0) throw new Error('Cours MSFT indisponible pour le moment.');
    const usd = data.c as number;

    const patch: Partial<MsftQuoteState> = {
      usdPrice: usd,
      change: typeof data.d === 'number' ? data.d : null,
      changePercent: typeof data.dp === 'number' ? data.dp : null,
      marketTimestamp: typeof data.t === 'number' ? new Date(data.t * 1000) : null,
      fetchedAt: Date.now(),
    };
    if (data._cachedAt) patch.lastUpdated = new Date(data._cachedAt);

    const today = new Date();
    const rates = await fetchECBRates([today]);
    const rate = rates[formatDateKey(today)];
    if (rate) {
      patch.eurPrice = convertUsdToEur(usd, rate);
      patch.changeEur = typeof data.d === 'number' ? convertUsdToEur(data.d, rate) : null;
    } else {
      patch.eurPrice = null;
      patch.changeEur = null;
      patch.error = `Cours MSFT: ${formatUSD(usd)} — Taux BCE du jour indisponible, convertissez manuellement.`;
    }
    emit(patch);
  } catch (err) {
    emit({ error: apiErrorMessage(err, 'Impossible de récupérer le cours MSFT.') });
  } finally {
    emit({ loading: false });
  }
}

/**
 * Fetch the quote unless one is already in flight or the cached one is still
 * fresh. `force` bypasses the freshness check (manual "Actualiser"/"Réessayer")
 * but still joins an in-flight request.
 */
export function fetchMsftQuote(options: { force?: boolean } = {}): Promise<void> {
  if (inFlight) return inFlight;
  if (!options.force && !isQuoteStale()) return Promise.resolve();
  inFlight = runFetch().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function refreshOnForeground() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  void fetchMsftQuote();
}

export function subscribeToMsftQuote(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', refreshOnForeground);
    window.addEventListener('focus', refreshOnForeground);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', refreshOnForeground);
      window.removeEventListener('focus', refreshOnForeground);
    }
  };
}

/** Test-only: drop the cached quote and any pending request. */
export function resetMsftQuoteStore() {
  state = INITIAL;
  inFlight = null;
  listeners.clear();
}
