import type { StockLot } from './types';

/**
 * Morgan Stanley exports carry no market value: the positions parser falls back
 * to the acquisition value, which would show as a 0 € unrealized gain.
 */
export function hasExportedMarketValue(lot: StockLot): boolean {
  return lot.broker !== 'morgan_stanley';
}

/**
 * Value a lot at the live MSFT price when available, otherwise at the value
 * frozen in the broker export. `null` means "unknown" — never 0 € — so the UI
 * can say so instead of showing a plausible-looking wrong number.
 */
export function lotMarketValue(lot: StockLot, eurPrice: number | null): number | null {
  if (eurPrice != null) return lot.quantity * eurPrice;
  return hasExportedMarketValue(lot) ? lot.currentValue : null;
}

export function lotUnrealizedGain(lot: StockLot, eurPrice: number | null): number | null {
  if (eurPrice != null) return lot.quantity * eurPrice - lot.totalCostBasis;
  return hasExportedMarketValue(lot) ? lot.unrealizedGainLoss : null;
}

export interface PortfolioTotals {
  /** Sum over the lots whose value is known — `unknownCount` says what it leaves out. */
  value: number;
  gainLoss: number;
  knownCount: number;
  unknownCount: number;
}

/**
 * Portfolio-wide totals. Lots with an unknown value are excluded from the sum
 * and counted separately, so the UI can show what it does know while saying
 * out loud how much of the portfolio the figure ignores.
 */
export function portfolioTotals(lots: StockLot[], eurPrice: number | null): PortfolioTotals {
  let value = 0;
  let gainLoss = 0;
  let knownCount = 0;
  let unknownCount = 0;
  for (const lot of lots) {
    const v = lotMarketValue(lot, eurPrice);
    const g = lotUnrealizedGain(lot, eurPrice);
    if (v === null || g === null) {
      unknownCount += 1;
      continue;
    }
    value += v;
    gainLoss += g;
    knownCount += 1;
  }
  return { value, gainLoss, knownCount, unknownCount };
}
