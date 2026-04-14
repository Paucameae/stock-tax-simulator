// Tax engine - main orchestrator module.
// Sub-module logic is delegated; re-exported here for backward compatibility.

import type {
  StockLot,
  SaleLotEntry,
  SaleSimulation,
  LotTaxResult,
  TaxSimulationResult,
} from './types';
import {
  calculateCEHR,
  getTaxConfig,
} from './tax-rates';
import { calculateAcquisitionGainTax } from './acquisition-tax';
import { calculateCapitalGainTax } from './capital-gain-tax';

// Re-export sub-modules for backward compatibility
export { calculateAcquisitionGainTax } from './acquisition-tax';
export { calculateCapitalGainTax } from './capital-gain-tax';
export { rankLotsForSale, type LotRanking } from './lot-ranking';

export function isQualifiedStockAward(lot: StockLot): boolean {
  return (
    lot.origin === 'FM' ||
    lot.origin === 'FQ' ||
    (lot.origin === 'DO' && lot.planType !== 'non_qualified')
  );
}

export function calculateLotTax(entry: SaleLotEntry): LotTaxResult {
  const { lot, quantitySold, salePricePerShare } = entry;
  const safeQty = Math.max(0, quantitySold);
  const safePrice = Math.max(0, salePricePerShare);
  const proceeds = safeQty * safePrice;

  if (safeQty === 0) {
    return {
      lotId: lot.id,
      proceeds: 0,
      acquisitionGain: 0,
      capitalGain: 0,
      origin: lot.origin,
      planType: lot.planType,
    };
  }

  if (lot.origin === 'SP') {
    const capitalGain = safeQty * (safePrice - lot.costBasisPerShare);
    return {
      lotId: lot.id,
      proceeds,
      acquisitionGain: 0,
      capitalGain,
      origin: lot.origin,
      planType: lot.planType,
    };
  }

  if (isQualifiedStockAward(lot)) {
    const rawAcquisitionGain = safeQty * lot.costBasisPerShare;
    const rawCapitalGain = safeQty * (safePrice - lot.costBasisPerShare);

    let netAcquisitionGain = rawAcquisitionGain;
    let netCapitalGain = rawCapitalGain;

    if (rawCapitalGain < 0) {
      netAcquisitionGain = Math.max(0, rawAcquisitionGain + rawCapitalGain);
      netCapitalGain = Math.min(0, rawCapitalGain + rawAcquisitionGain);
    }

    return {
      lotId: lot.id,
      proceeds,
      acquisitionGain: netAcquisitionGain,
      capitalGain: netCapitalGain,
      origin: lot.origin,
      planType: lot.planType,
    };
  } else {
    const capitalGain = safeQty * (safePrice - lot.costBasisPerShare);
    return {
      lotId: lot.id,
      proceeds,
      acquisitionGain: 0,
      capitalGain,
      origin: lot.origin,
      planType: lot.planType,
    };
  }
}

export function runSimulation(simulation: SaleSimulation): TaxSimulationResult {
  const safeTaxShares = Math.max(1, simulation.taxShares);
  const safeSimulation = { ...simulation, taxShares: safeTaxShares };

  const config = getTaxConfig(safeSimulation.fiscalYear);

  const lotResults = safeSimulation.lots.map((entry) => calculateLotTax(entry));

  const totalProceeds = lotResults.reduce((sum, r) => sum + r.proceeds, 0);
  const totalAcquisitionGain = lotResults.reduce((sum, r) => sum + r.acquisitionGain, 0);
  const totalCapitalGain = lotResults.reduce((sum, r) => sum + r.capitalGain, 0);

  const hasFQ = lotResults.some((r) => r.planType === 'qualified_pre_macron' && r.acquisitionGain > 0);
  const primaryPlanType = hasFQ ? 'qualified_pre_macron' : 'qualified_macron';

  const fqLots = safeSimulation.lots.filter(
    (e) => e.lot.planType === 'qualified_pre_macron'
  );
  const earliestGrantDate = fqLots.length > 0
    ? fqLots.reduce((earliest, e) => {
        const gd = e.lot.grantDate;
        if (!gd) return earliest;
        return !earliest || gd < earliest ? gd : earliest;
      }, undefined as Date | undefined)
    : undefined;

  const hasLongHolding = safeSimulation.lots.some((e) => e.lot.holdingPeriod === 'Long');
  const holdingPeriod: 'Short' | 'Long' = hasLongHolding ? 'Long' : 'Short';

  const acquisitionGainTax = calculateAcquisitionGainTax(
    totalAcquisitionGain,
    safeSimulation.otherTaxableIncome,
    safeSimulation.taxShares,
    primaryPlanType,
    earliestGrantDate,
    holdingPeriod,
    config
  );

  const acqTaxableIncome = primaryPlanType === 'qualified_macron'
    ? (acquisitionGainTax.below300k - acquisitionGainTax.abatement50) + acquisitionGainTax.above300k
    : acquisitionGainTax.below300k;

  const capitalGainTax = calculateCapitalGainTax(
    totalCapitalGain,
    safeSimulation.priorLosses,
    safeSimulation.taxMode,
    safeSimulation.otherTaxableIncome,
    safeSimulation.taxShares,
    acqTaxableIncome,
    config
  );

  const rfi = safeSimulation.otherTaxableIncome + totalAcquisitionGain + Math.max(0, totalCapitalGain);
  const cehr = calculateCEHR(rfi, safeSimulation.familyStatus, config);

  const totalTax = acquisitionGainTax.total + capitalGainTax.total + cehr;
  const netAmount = totalProceeds - totalTax;
  const effectiveTaxRate = totalProceeds > 0 ? (totalTax / totalProceeds) * 100 : 0;

  return {
    totalProceeds,
    totalAcquisitionGain,
    totalCapitalGain,
    acquisitionGainTax,
    capitalGainTax,
    cehr,
    totalTax,
    netAmount,
    effectiveTaxRate,
    lotResults,
    taxMode: safeSimulation.taxMode,
  };
}
