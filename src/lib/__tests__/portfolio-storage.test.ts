// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadPortfolio,
  savePortfolio,
  clearPortfolio,
  getLastPortfolioSave,
  subscribeToPortfolioSaves,
  PORTFOLIO_STORAGE_KEY,
} from '../portfolio-storage';
import type { StockLot, SoldLot } from '../types';

const lot: StockLot = {
  id: 'lot-1',
  broker: 'fidelity',
  acquisitionDate: new Date('2022-05-15T00:00:00Z'),
  quantity: 100,
  costBasisPerShare: 200,
  totalCostBasis: 20000,
  currentValue: 38000,
  unrealizedGainLoss: 18000,
  origin: 'DO',
  holdingPeriod: 'Long',
  planType: 'qualified_macron',
};

const soldLot: SoldLot = {
  id: 'sold-1',
  broker: 'fidelity',
  acquisitionDate: new Date('2021-01-10T00:00:00Z'),
  saleDate: new Date('2024-09-20T00:00:00Z'),
  quantity: 50,
  proceeds: 20000,
  costBasis: 12000,
  gainLoss: 8000,
  holdingPeriod: 'Long',
  origin: 'DO',
  planType: 'qualified_macron',
};

describe('portfolio-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty portfolio when nothing was ever saved', () => {
    expect(loadPortfolio()).toEqual({
      lots: [],
      soldLots: [],
      savedAt: null,
      importedAt: null,
      rejected: 0,
    });
  });

  it('round-trips lots and sales with revived Date objects', () => {
    expect(savePortfolio([lot], [soldLot], '2025-03-12T09:00:00.000Z')).toBe(true);

    const loaded = loadPortfolio();
    expect(loaded.lots).toHaveLength(1);
    expect(loaded.soldLots).toHaveLength(1);
    expect(loaded.lots[0].acquisitionDate).toBeInstanceOf(Date);
    expect(loaded.lots[0].acquisitionDate.getTime()).toBe(lot.acquisitionDate.getTime());
    expect(loaded.soldLots[0].saleDate.getFullYear()).toBe(2024);
    expect(loaded.lots[0].totalCostBasis).toBe(20000);
    expect(loaded.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(loaded.importedAt).toBe('2025-03-12T09:00:00.000Z');
  });

  it('drops corrupt rows instead of failing the whole load', () => {
    localStorage.setItem(
      PORTFOLIO_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        lots: [lot, { id: 'broken' }],
        soldLots: [{ ...soldLot, proceeds: 'oops' }],
      })
    );

    const loaded = loadPortfolio();
    expect(loaded.lots).toHaveLength(1);
    expect(loaded.soldLots).toHaveLength(0);
    expect(loaded.rejected).toBe(2);
  });

  it('falls back to empty on malformed JSON', () => {
    localStorage.setItem(PORTFOLIO_STORAGE_KEY, '{not json');
    expect(loadPortfolio().lots).toEqual([]);
  });

  it('persists an empty portfolio so a clear survives the reload', () => {
    savePortfolio([lot], [soldLot]);
    savePortfolio([], []);
    expect(loadPortfolio().lots).toEqual([]);
    expect(loadPortfolio().soldLots).toEqual([]);
    expect(localStorage.getItem(PORTFOLIO_STORAGE_KEY)).toBeNull();
  });

  it('clears the stored portfolio', () => {
    savePortfolio([lot], []);
    clearPortfolio();
    expect(localStorage.getItem(PORTFOLIO_STORAGE_KEY)).toBeNull();
  });

  it('notifies subscribers of the last save date', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToPortfolioSaves(listener);

    savePortfolio([lot], []);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLastPortfolioSave()).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    clearPortfolio();
    expect(getLastPortfolioSave()).toBeNull();

    unsubscribe();
    savePortfolio([lot], []);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
