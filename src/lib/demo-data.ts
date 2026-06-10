// Demo dataset used by the in-app "Mode démo" button.
//
// Goal: let a first-time user (or a tester) explore every flow — portfolio,
// simulation, declaration, dividends — without having to export anything from
// their broker. The numbers are entirely synthetic and loosely model a
// Microsoft employee holding shares at Fidelity (ESPP + Stock Awards) with a
// couple of 2025 sales to declare. They are NOT real and carry no PII.

import type { AppSettings, StockLot, SoldLot } from './types';
import type { DividendEvent } from './brokers/fidelity/transactions-parser';

export interface DemoDataset {
  settings: AppSettings;
  lots: StockLot[];
  soldLots: SoldLot[];
  dividends: DividendEvent[];
}

/**
 * Build a fresh demo dataset. Returns new objects (and new `Date` instances)
 * on every call so callers can safely mutate the result without leaking state
 * between loads.
 */
export function buildDemoData(): DemoDataset {
  const settings: AppSettings = {
    familyStatus: 'couple',
    numberOfChildren: 2,
    taxShares: 3,
    taxSharesManual: false,
    otherTaxableIncome: 90000,
    defaultPlanType: 'qualified_macron',
    priorLosses: 0,
  };

  // Open positions still held (feed the portfolio + simulation tabs).
  const lots: StockLot[] = [
    {
      id: 'demo-lot-1',
      broker: 'fidelity',
      acquisitionDate: new Date(2021, 7, 31), // 31 Aug 2021 — FQ vest
      quantity: 120,
      costBasisPerShare: 245,
      totalCostBasis: 29400,
      currentValue: 54000,
      unrealizedGainLoss: 24600,
      origin: 'FQ',
      holdingPeriod: 'Long',
      planType: 'qualified_macron',
      qualificationReason: 'broker_default',
    },
    {
      id: 'demo-lot-2',
      broker: 'fidelity',
      acquisitionDate: new Date(2022, 1, 28), // 28 Feb 2022 — FM vest
      quantity: 80,
      costBasisPerShare: 270,
      totalCostBasis: 21600,
      currentValue: 36000,
      unrealizedGainLoss: 14400,
      origin: 'FM',
      holdingPeriod: 'Long',
      planType: 'qualified_macron',
      qualificationReason: 'broker_default',
    },
    {
      id: 'demo-lot-3',
      broker: 'fidelity',
      acquisitionDate: new Date(2023, 5, 30), // 30 Jun 2023 — ESPP purchase
      quantity: 45,
      costBasisPerShare: 280, // 90% of FMV (10% discount)
      totalCostBasis: 12600,
      currentValue: 20250,
      unrealizedGainLoss: 7650,
      origin: 'SP',
      holdingPeriod: 'Short',
      planType: 'qualified_macron',
      esppFmvPerShare: 280 / 0.9, // FMV before the 10% discount
      qualificationReason: 'broker_default',
    },
  ];

  // Lots sold in 2025 (feed the declaration tab).
  const soldLots: SoldLot[] = [
    {
      id: 'demo-sold-1',
      broker: 'fidelity',
      acquisitionDate: new Date(2020, 8, 30), // 30 Sep 2020 — FQ vest
      saleDate: new Date(2025, 3, 15), // 15 Apr 2025
      quantity: 60,
      proceeds: 27000, // 450 €/share
      costBasis: 12000, // 200 €/share acquisition gain basis
      gainLoss: 15000,
      holdingPeriod: 'Long',
      origin: 'FQ',
      planType: 'qualified_macron',
      qualificationReason: 'broker_default',
    },
    {
      id: 'demo-sold-2',
      broker: 'fidelity',
      acquisitionDate: new Date(2022, 5, 30), // 30 Jun 2022 — ESPP purchase
      saleDate: new Date(2025, 9, 3), // 3 Oct 2025
      quantity: 30,
      proceeds: 13500, // 450 €/share
      costBasis: 7560, // 252 €/share (90% of 280 FMV)
      gainLoss: 5940,
      holdingPeriod: 'Long',
      origin: 'SP',
      planType: 'qualified_macron',
      qualificationReason: 'broker_default',
    },
  ];

  // Quarterly Microsoft dividends received in 2025 (feed the dividends flow).
  const dividends: DividendEvent[] = [
    makeDividend('demo', new Date(2025, 2, 13), 132.0),
    makeDividend('demo', new Date(2025, 5, 12), 132.0),
    makeDividend('demo', new Date(2025, 8, 11), 150.0),
    makeDividend('demo', new Date(2025, 11, 11), 150.0),
  ];

  return { settings, lots, soldLots, dividends };
}

function makeDividend(_idPrefix: string, date: Date, grossUsd: number): DividendEvent {
  const taxWithheldUsd = Math.round(grossUsd * 0.15 * 100) / 100; // 15% US withholding
  return {
    date,
    broker: 'fidelity',
    grossUsd,
    taxWithheldUsd,
    netUsd: Math.round((grossUsd - taxWithheldUsd) * 100) / 100,
  };
}
