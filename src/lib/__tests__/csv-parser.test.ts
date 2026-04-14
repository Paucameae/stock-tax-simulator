import { describe, it, expect } from 'vitest';
import { parseCsvFile } from '../csv-parser';

const HEADER = "Date d'acquisition,Quantité,\"Coût total\",\"Coût/action\",\"Valeur actuelle\",\"+/- value\",\"Dispo vente\",\"Dispo transfert\",\"Date attribution\",Origine,\"Période détention\"";

function makeCsvRow(overrides: Partial<{
  date: string; qty: string; totalCost: string; costPerShare: string;
  currentValue: string; gl: string; saleDate: string; transferDate: string;
  grantDate: string; origin: string; holding: string;
}> = {}) {
  return [
    overrides.date ?? 'Mar-15-2023',
    overrides.qty ?? '100',
    overrides.totalCost ?? '2500000', // 25000.00
    overrides.costPerShare ?? '25000',  // 250.00
    overrides.currentValue ?? '4000000', // 40000.00
    overrides.gl ?? '1500000', // 15000.00
    overrides.saleDate ?? 'Mar-15-2024',
    overrides.transferDate ?? 'Mar-15-2024',
    overrides.grantDate ?? 'Jan-01-2022',
    overrides.origin ?? 'DO',
    overrides.holding ?? 'Short',
  ].join(',');
}

describe('parseCsvFile', () => {
  it('parses a valid CSV line (EUR)', () => {
    const csv = [HEADER, makeCsvRow()].join('\n');
    const lots = parseCsvFile(csv, 'EUR');

    expect(lots).toHaveLength(1);
    expect(lots[0].quantity).toBe(100);
    expect(lots[0].costBasisPerShare).toBe(250);
    expect(lots[0].totalCostBasis).toBe(25000);
    expect(lots[0].origin).toBe('DO');
    expect(lots[0].holdingPeriod).toBe('Short');
    expect(lots[0].importCurrency).toBe('EUR');
  });

  it('parses multiple rows', () => {
    const csv = [HEADER, makeCsvRow(), makeCsvRow({ date: 'Jun-01-2023', origin: 'SP' })].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(2);
    expect(lots[1].origin).toBe('SP');
  });

  it('skips header row', () => {
    const csv = [HEADER, makeCsvRow()].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(1);
  });

  it('skips footer lines containing "Les valeurs sont affichées en"', () => {
    const csv = [HEADER, makeCsvRow(), 'Les valeurs sont affichées en EUR,,,,,,,,,,'].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(1);
  });

  it('skips rows with invalid dates', () => {
    const csv = [HEADER, makeCsvRow({ date: 'INVALID' })].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(0);
  });

  it('skips rows with zero quantity', () => {
    const csv = [HEADER, makeCsvRow({ qty: '0' })].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(0);
  });

  it('parses USD imports with raw USD values stored', () => {
    const csv = [HEADER, makeCsvRow()].join('\n');
    const lots = parseCsvFile(csv, 'USD');

    expect(lots).toHaveLength(1);
    expect(lots[0].importCurrency).toBe('USD');
    expect(lots[0].costBasisPerShareUsd).toBe(250);
    expect(lots[0].totalCostBasisUsd).toBe(25000);
    // EUR values should be 0 (awaiting ECB rate)
    expect(lots[0].costBasisPerShare).toBe(0);
    expect(lots[0].totalCostBasis).toBe(0);
  });

  it('assigns correct default plan type per origin', () => {
    const csvFM = [HEADER, makeCsvRow({ origin: 'FM' })].join('\n');
    const csvFQ = [HEADER, makeCsvRow({ origin: 'FQ' })].join('\n');
    const csvSP = [HEADER, makeCsvRow({ origin: 'SP' })].join('\n');
    const csvDO = [HEADER, makeCsvRow({ origin: 'DO' })].join('\n');

    expect(parseCsvFile(csvFM)[0].planType).toBe('qualified_macron');
    expect(parseCsvFile(csvFQ)[0].planType).toBe('qualified_pre_macron');
    expect(parseCsvFile(csvSP)[0].planType).toBe('non_qualified');
    expect(parseCsvFile(csvDO)[0].planType).toBe('qualified_macron');
  });

  it('handles empty input', () => {
    expect(parseCsvFile('')).toEqual([]);
    expect(parseCsvFile(HEADER)).toEqual([]);
  });

  it('parses date correctly (MMM-DD-YYYY)', () => {
    const csv = [HEADER, makeCsvRow({ date: 'Dec-25-2024' })].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots[0].acquisitionDate.getFullYear()).toBe(2024);
    expect(lots[0].acquisitionDate.getMonth()).toBe(11); // December = 11
    expect(lots[0].acquisitionDate.getDate()).toBe(25);
  });

  it('parses amounts with Fidelity format (integer / 100)', () => {
    // 123456 → 1234.56
    const csv = [HEADER, makeCsvRow({ costPerShare: '123456' })].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots[0].costBasisPerShare).toBe(1234.56);
  });
});
