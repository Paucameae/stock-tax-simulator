import { runSimulation } from './tax-engine';
import type { StockLot, SoldLot, SaleLotEntry, AppSettings, TaxSimulationResult, TaxMode } from './types';

/** Distinct sale years present in the sold lots, most recent first. */
export function getSaleYears(soldLots: SoldLot[]): number[] {
  return [...new Set(soldLots.map((sl) => sl.saleDate.getFullYear()))].sort((a, b) => b - a);
}

export function soldLotsToSaleEntries(soldLots: SoldLot[]): SaleLotEntry[] {
  return soldLots.map((sl) => {
    const costBasisPerShare = sl.quantity > 0 ? sl.costBasis / sl.quantity : 0;
    const salePricePerShare = sl.quantity > 0 ? sl.proceeds / sl.quantity : 0;
    const syntheticLot: StockLot = {
      id: sl.id,
      broker: sl.broker,
      acquisitionDate: sl.acquisitionDate,
      quantity: sl.quantity,
      costBasisPerShare,
      totalCostBasis: sl.costBasis,
      currentValue: sl.proceeds,
      unrealizedGainLoss: sl.gainLoss,
      origin: sl.origin,
      holdingPeriod: sl.holdingPeriod,
      planType: sl.planType,
      importCurrency: sl.importCurrency,
      esppFmvPerShare: sl.origin === 'SP' ? costBasisPerShare / 0.90 : undefined,
    };
    return {
      lot: syntheticLot,
      quantitySold: sl.quantity,
      salePricePerShare,
      saleDate: sl.saleDate,
    };
  });
}

/**
 * Recompute the declaration view state from a list of sold lots.
 *
 * Single source of truth for the bootstrap pattern used after every mutation
 * that affects sold lots: sales import, backup restore, grant reconciliation,
 * year switch, qualification toggle. Picking the most recent sale year by
 * default matches what the user is most likely declaring (N-1).
 *
 * Returns the year that was selected, the SaleLotEntry projection used by the
 * UI, and the TaxSimulationResult — so callers can wire all three into state
 * with a single helper instead of duplicating the runSimulation block.
 */
export function computeDeclarationFor(
  soldLotsList: SoldLot[],
  settings: AppSettings,
  taxMode: TaxMode,
  preferredYear?: number | null,
): { saleYear: number | null; entries: SaleLotEntry[]; result: TaxSimulationResult | null } {
  if (soldLotsList.length === 0) {
    return { saleYear: null, entries: [], result: null };
  }
  const availableYears = getSaleYears(soldLotsList);
  // If the caller has a preferred year (e.g. the year currently selected by the
  // user) and that year still has at least one sold lot, keep it. Otherwise
  // fall back to the most recent year present in the data.
  const year = preferredYear != null && availableYears.includes(preferredYear)
    ? preferredYear
    : (availableYears[0] ?? new Date().getFullYear());
  const yearLots = soldLotsList.filter((sl) => sl.saleDate.getFullYear() === year);
  const entries = soldLotsToSaleEntries(yearLots);
  const result = runSimulation({
    lots: entries,
    taxMode,
    otherTaxableIncome: settings.otherTaxableIncome,
    taxShares: settings.taxShares,
    familyStatus: settings.familyStatus,
    priorLosses: settings.priorLosses,
    fiscalYear: year,
  });
  return { saleYear: year, entries, result };
}
