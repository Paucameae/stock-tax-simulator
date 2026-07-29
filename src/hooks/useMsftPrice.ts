import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  subscribeToMsftQuote,
  getMsftQuote,
  fetchMsftQuote,
  type MsftQuoteState,
} from '../lib/msft-quote-store';

export interface MsftPriceResult extends MsftQuoteState {
  /** Force a refresh, ignoring the freshness window (manual retry). */
  retry: () => void;
}

/**
 * Read the shared MSFT quote: every consumer gets the same value from the same
 * single request. See `lib/msft-quote-store`.
 */
export function useMsftPrice(): MsftPriceResult {
  const state = useSyncExternalStore(subscribeToMsftQuote, getMsftQuote, getMsftQuote);

  useEffect(() => {
    void fetchMsftQuote();
  }, []);

  const retry = useCallback(() => {
    void fetchMsftQuote({ force: true });
  }, []);

  return { ...state, retry };
}
