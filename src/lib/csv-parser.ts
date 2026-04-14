import Papa from 'papaparse';
import type { StockLot, StockOrigin, HoldingPeriod, PlanType, ImportCurrency } from './types';

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseFidelityDate(dateStr: string): Date | undefined {
  if (!dateStr || !dateStr.trim()) return undefined;
  const trimmed = dateStr.trim();
  // Format: MMM-DD-YYYY e.g. Mar-31-2026
  const parts = trimmed.split('-');
  if (parts.length !== 3) return undefined;
  const month = MONTH_MAP[parts[0]];
  if (month === undefined) return undefined;
  const day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(year)) return undefined;
  return new Date(year, month, day);
}

function parseFidelityAmount(amountStr: string): number {
  if (!amountStr || !amountStr.trim()) return 0;
  // Remove spaces (thousand separators), the last 2 digits are cents
  const cleaned = amountStr.trim().replace(/\s/g, '');
  if (!cleaned || isNaN(Number(cleaned))) return 0;
  const num = parseInt(cleaned, 10);
  return num / 100;
}

function parseFidelityQuantity(qtyStr: string): number {
  if (!qtyStr || !qtyStr.trim()) return 0;
  return parseFloat(qtyStr.trim()) || 0;
}

function getDefaultPlanType(origin: StockOrigin): PlanType {
  switch (origin) {
    case 'FM': return 'qualified_macron';
    case 'FQ': return 'qualified_pre_macron';
    case 'DO': return 'qualified_macron'; // default, user can change
    case 'SP': return 'non_qualified'; // not applicable for ESPP
  }
}

export function parseCsvFile(csvText: string, currency: ImportCurrency = 'EUR'): StockLot[] {
  const result = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  const lots: StockLot[] = [];
  let id = 0;

  for (const row of result.data as string[][]) {
    // Skip header row
    if (row[0] === "Date d'acquisition" || row[0] === 'Date d\'acquisition') continue;
    // Skip footer lines
    if (row.join(',').includes('Les valeurs sont affichées en')) continue;
    // Skip empty rows
    if (!row[0] || !row[0].trim()) continue;

    const acquisitionDate = parseFidelityDate(row[0]);
    if (!acquisitionDate) continue;

    const quantity = parseFidelityQuantity(row[1]);
    if (quantity <= 0) continue;

    const totalCostBasis = parseFidelityAmount(row[2]);
    const costBasisPerShare = parseFidelityAmount(row[3]);
    const currentValue = parseFidelityAmount(row[4]);
    const unrealizedGainLoss = parseFidelityAmount(row[5]);
    const availableForSaleDate = parseFidelityDate(row[6]);
    const availableForTransferDate = parseFidelityDate(row[7]);
    const grantDate = parseFidelityDate(row[8]);
    const origin = (row[9]?.trim() || 'DO') as StockOrigin;
    const holdingPeriod = (row[10]?.trim() || 'Short') as HoldingPeriod;

    id++;

    if (currency === 'USD') {
      lots.push({
        id: `lot-${id}`,
        acquisitionDate,
        quantity,
        // EUR values will be filled after ECB rate fetch
        costBasisPerShare: 0,
        totalCostBasis: 0,
        currentValue: 0,
        unrealizedGainLoss: 0,
        // Store raw USD values
        costBasisPerShareUsd: costBasisPerShare,
        totalCostBasisUsd: totalCostBasis,
        currentValueUsd: currentValue,
        importCurrency: 'USD',
        availableForSaleDate,
        availableForTransferDate,
        grantDate,
        origin,
        holdingPeriod,
        planType: getDefaultPlanType(origin),
      });
    } else {
      lots.push({
        id: `lot-${id}`,
        acquisitionDate,
        quantity,
        costBasisPerShare,
        totalCostBasis,
        currentValue,
        unrealizedGainLoss,
        importCurrency: 'EUR',
        availableForSaleDate,
        availableForTransferDate,
        grantDate,
        origin,
        holdingPeriod,
        planType: getDefaultPlanType(origin),
      });
    }
  }

  return lots;
}
