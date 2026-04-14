import type { StockLot, SaleLotEntry } from './types';
import { AGA_THRESHOLD } from './tax-rates';
import { runSimulation } from './tax-engine';

export interface LotRanking {
  lot: StockLot;
  effectiveTaxRatePfu: number;
  effectiveTaxRateBareme: number;
  bestRate: number;
  bestMode: 'pfu' | 'bareme';
  totalTaxPfu: number;
  totalTaxBareme: number;
  proceeds: number;
  netAmountBest: number;
  acquisitionGain: number;
  capitalGain: number;
  warnings: string[];
}

export function rankLotsForSale(
  lots: StockLot[],
  salePricePerShare: number,
  otherTaxableIncome: number,
  taxShares: number,
  familyStatus: 'single' | 'couple',
  priorLosses: number,
  fiscalYear: number
): LotRanking[] {
  if (salePricePerShare <= 0 || lots.length === 0) return [];

  let cumulativeAcqGain = 0;

  const rankings: LotRanking[] = lots.map((lot) => {
    const entry: SaleLotEntry = {
      lot,
      quantitySold: lot.quantity,
      salePricePerShare,
    };

    const simPfu = runSimulation({
      lots: [entry],
      taxMode: 'pfu',
      otherTaxableIncome,
      taxShares,
      familyStatus,
      priorLosses,
      fiscalYear,
    });

    const simBareme = runSimulation({
      lots: [entry],
      taxMode: 'bareme',
      otherTaxableIncome,
      taxShares,
      familyStatus,
      priorLosses,
      fiscalYear,
    });

    const bestMode = simPfu.totalTax <= simBareme.totalTax ? 'pfu' as const : 'bareme' as const;
    const bestSim = bestMode === 'pfu' ? simPfu : simBareme;

    const warnings: string[] = [];

    const lotAcqGain = simPfu.totalAcquisitionGain;
    if (lotAcqGain > 0) {
      cumulativeAcqGain += lotAcqGain;
      if (cumulativeAcqGain > AGA_THRESHOLD) {
        warnings.push(`Le gain d'acquisition cumulé (${Math.round(cumulativeAcqGain).toLocaleString('fr-FR')} €) dépasse le seuil de 300 000 €`);
      }
    }

    const rfi = otherTaxableIncome + lotAcqGain + Math.max(0, simPfu.totalCapitalGain);
    const cehrThreshold = familyStatus === 'couple' ? 500000 : 250000;
    if (rfi > cehrThreshold) {
      warnings.push(`Déclenche la CEHR (RFI estimé : ${Math.round(rfi).toLocaleString('fr-FR')} €)`);
    }

    if (simPfu.totalCapitalGain < 0) {
      warnings.push(`Moins-value de ${Math.abs(Math.round(simPfu.totalCapitalGain)).toLocaleString('fr-FR')} € (reportable 10 ans)`);
    }

    return {
      lot,
      effectiveTaxRatePfu: simPfu.effectiveTaxRate,
      effectiveTaxRateBareme: simBareme.effectiveTaxRate,
      bestRate: bestSim.effectiveTaxRate,
      bestMode,
      totalTaxPfu: simPfu.totalTax,
      totalTaxBareme: simBareme.totalTax,
      proceeds: bestSim.totalProceeds,
      netAmountBest: bestSim.netAmount,
      acquisitionGain: simPfu.totalAcquisitionGain,
      capitalGain: simPfu.totalCapitalGain,
      warnings,
    };
  });

  rankings.sort((a, b) => a.bestRate - b.bestRate);

  return rankings;
}
