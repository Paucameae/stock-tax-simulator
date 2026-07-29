import { describe, it, expect } from 'vitest';
import {
  hasExportedMarketValue,
  lotMarketValue,
  lotUnrealizedGain,
  portfolioTotals,
} from '../portfolio-value';
import type { StockLot } from '../types';

function makeLot(overrides: Partial<StockLot> = {}): StockLot {
  return {
    id: 'lot-1',
    broker: 'fidelity',
    acquisitionDate: new Date('2022-05-15'),
    quantity: 100,
    costBasisPerShare: 200,
    totalCostBasis: 20000,
    currentValue: 35000,
    unrealizedGainLoss: 15000,
    origin: 'DO',
    holdingPeriod: 'Long',
    planType: 'qualified_macron',
    ...overrides,
  };
}

describe('portfolio-value', () => {
  it('values lots at the live price when one is available', () => {
    const lot = makeLot();
    expect(lotMarketValue(lot, 400)).toBe(40000);
    expect(lotUnrealizedGain(lot, 400)).toBe(20000);
  });

  it('ignores the exported amounts entirely once the live price is known', () => {
    const lot = makeLot({ broker: 'morgan_stanley', currentValue: 20000, unrealizedGainLoss: 0 });
    expect(lotMarketValue(lot, 400)).toBe(40000);
    expect(lotUnrealizedGain(lot, 400)).toBe(20000);
  });

  it('falls back to the exported amounts for Fidelity lots', () => {
    const lot = makeLot();
    expect(lotMarketValue(lot, null)).toBe(35000);
    expect(lotUnrealizedGain(lot, null)).toBe(15000);
  });

  it('reports an unknown value for Morgan Stanley lots without a live price', () => {
    // The MS export carries no market value: the parser stores the acquisition
    // value, which would otherwise show as a 0 € unrealized gain.
    const lot = makeLot({ broker: 'morgan_stanley', currentValue: 20000, unrealizedGainLoss: 0 });
    expect(hasExportedMarketValue(lot)).toBe(false);
    expect(lotMarketValue(lot, null)).toBeNull();
    expect(lotUnrealizedGain(lot, null)).toBeNull();
  });

  it('sums totals across lots at the live price', () => {
    const lots = [makeLot({ id: 'a', quantity: 100 }), makeLot({ id: 'b', quantity: 50, totalCostBasis: 10000 })];
    expect(portfolioTotals(lots, 400)).toEqual({ value: 60000, gainLoss: 30000, knownCount: 2, unknownCount: 0 });
  });

  it('sums the lots it knows and counts the ones it does not', () => {
    const lots = [makeLot({ id: 'a' }), makeLot({ id: 'b', broker: 'morgan_stanley' })];
    expect(portfolioTotals(lots, null)).toEqual({
      value: 35000,
      gainLoss: 15000,
      knownCount: 1,
      unknownCount: 1,
    });
  });

  it('reports no known lot when every value is unknown', () => {
    const lots = [makeLot({ id: 'a', broker: 'morgan_stanley' })];
    expect(portfolioTotals(lots, null)).toEqual({
      value: 0,
      gainLoss: 0,
      knownCount: 0,
      unknownCount: 1,
    });
  });

  it('returns zero totals for an empty portfolio', () => {
    expect(portfolioTotals([], null)).toEqual({ value: 0, gainLoss: 0, knownCount: 0, unknownCount: 0 });
  });
});
