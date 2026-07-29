import { useState, useCallback } from 'react';
import {
  fetchECBRates,
  formatDateKey,
  convertLotWithRate,
  convertSoldLotWithRate,
  type RateCache,
} from '../lib/ecb-rates';
import type { StockLot, SoldLot } from '../lib/types';

interface ConversionOutcome<T> {
  converted: T[];
  missingCount: number;
  /** Rates actually resolved, so the caller can suggest a value for the missing dates. */
  rates: RateCache;
}

interface EcbConversionResult {
  convertLots: (lots: StockLot[]) => Promise<ConversionOutcome<StockLot>>;
  convertSoldLots: (lots: SoldLot[]) => Promise<ConversionOutcome<SoldLot>>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to convert USD-imported stock lots to EUR using ECB historical rates.
 * Lots whose rate could not be resolved keep `eurUsdRate` undefined and their
 * EUR amounts untouched, so the caller can hold them back rather than publish
 * 0 € amounts.
 */
export function useEcbConversion(): EcbConversionResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convertLots = useCallback(async (lots: StockLot[]) => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date();
      const rates = await fetchECBRates([...lots.map((l) => l.acquisitionDate), today]);
      const todayRate = rates[formatDateKey(today)];

      const converted = lots.map((lot) => {
        const acqRate = rates[formatDateKey(lot.acquisitionDate)];
        if (!acqRate) return { ...lot, eurUsdRate: undefined, rateSource: undefined };
        return convertLotWithRate(lot, acqRate, todayRate || acqRate, 'ecb');
      });

      const missingCount = converted.filter((l) => !l.eurUsdRate).length;
      if (missingCount > 0) {
        setError(`Taux BCE introuvable pour ${missingCount} lot(s). Vérifiez les dates ou renseignez manuellement.`);
      }
      return { converted, missingCount, rates };
    } catch {
      setError('Erreur lors de la récupération des taux BCE. Vérifiez votre connexion.');
      return { converted: lots, missingCount: lots.length, rates: {} };
    } finally {
      setLoading(false);
    }
  }, []);

  const convertSoldLots = useCallback(async (lots: SoldLot[]) => {
    setLoading(true);
    setError(null);
    try {
      const rates = await fetchECBRates([
        ...lots.map((l) => l.saleDate),
        ...lots.map((l) => l.acquisitionDate),
      ]);

      const converted = lots.map((lot) => {
        const saleRate = rates[formatDateKey(lot.saleDate)];
        if (!saleRate) return { ...lot, eurUsdRate: undefined, rateSource: undefined };
        const acqRate = rates[formatDateKey(lot.acquisitionDate)] || saleRate;
        return convertSoldLotWithRate(lot, saleRate, acqRate, 'ecb');
      });

      const missingCount = converted.filter((l) => !l.eurUsdRate).length;
      if (missingCount > 0) {
        setError(`Taux BCE introuvable pour ${missingCount} lot(s). Vérifiez les dates ou renseignez manuellement.`);
      }
      return { converted, missingCount, rates };
    } catch {
      setError('Erreur lors de la récupération des taux BCE. Vérifiez votre connexion.');
      return { converted: lots, missingCount: lots.length, rates: {} };
    } finally {
      setLoading(false);
    }
  }, []);

  return { convertLots, convertSoldLots, loading, error };
}
