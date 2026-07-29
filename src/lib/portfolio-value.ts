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

/**
 * Portfolio-wide totals. A single lot with an unknown value makes the whole
 * total unknown: a partial sum would silently under-report the portfolio.
 */
export function portfolioTotals(
  lots: StockLot[],
  eurPrice: number | null
): { value: number | null; gainLoss: number | null } {
  let value = 0;
  let gainLoss = 0;
  for (const lot of lots) {
    const v = lotMarketValue(lot, eurPrice);
    const g = lotUnrealizedGain(lot, eurPrice);
    if (v === null || g === null) return { value: null, gainLoss: null };
    value += v;
    gainLoss += g;
  }
  return { value, gainLoss };
}
