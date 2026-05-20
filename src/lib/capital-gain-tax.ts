import type { CapitalGainTaxResult } from './types';
import {
  calculateProgressiveTax,
  PS_PATRIMOINE,
  CSG_DEDUCTIBLE,
  PFU_IR_RATE,
  type TaxConfig,
} from './tax-rates';

/**
 * Per-lot context required to compute the holding-period abatement.
 * Built by the engine; consumed by {@link allocateHoldingAbatement}.
 */
export interface LotAbatementContext {
  /** Signed result of the lot: positive = plus-value, negative = moins-value. */
  pv: number;
  /**
   * Abatement rate eligible for this lot (0 / 0.50 / 0.65). 0 covers PFU,
   * post-2018 acquisitions, MV lots and lots held < 2 years.
   */
  rate: number;
}

/**
 * Allocate prior losses + year MVs lot-by-lot and compute the resulting
 * holding-period abatement, per notice 2074-NOT cadre 11 :
 *   1. Pool of losses = MV antérieures (`priorLosses`) + Σ |MV de l'année|.
 *   2. Imputer ce pool en priorité sur les PV non éligibles à abattement
 *      puis sur les PV au taux le plus faible (choix d'imputation laissé
 *      au contribuable — on prend l'ordre le plus favorable, légal).
 *   3. Appliquer le taux d'abattement de chaque lot sur sa PV résiduelle.
 *
 * Cette fonction est mathématiquement équivalente à l'ancien calcul
 * (abattement brut puis cap à `netGain`) dans les cas simples mais
 * corrige la répartition dans les cas mixtes pré-2018 / post-2018 / MV.
 */
export function allocateHoldingAbatement(
  lots: readonly LotAbatementContext[],
  priorLosses: number,
): number {
  if (lots.length === 0) return 0;
  let lossPool = Math.max(0, priorLosses);
  for (const l of lots) {
    if (l.pv < 0) lossPool += -l.pv;
  }
  // Tri par taux d'abattement croissant : on impute d'abord sur les PV
  // sans abattement, puis sur les PV à 50 %, puis à 65 %. Cet ordre
  // maximise l'abattement final (jurisprudence : choix d'imputation
  // libre du contribuable, notice 2074-NOT cadre 11).
  const positives = lots
    .filter((l) => l.pv > 0)
    .map((l) => ({ pv: l.pv, rate: l.rate }))
    .sort((a, b) => a.rate - b.rate);
  for (const l of positives) {
    if (lossPool <= 0) break;
    const absorbed = Math.min(l.pv, lossPool);
    l.pv -= absorbed;
    lossPool -= absorbed;
  }
  return positives.reduce((sum, l) => sum + l.pv * l.rate, 0);
}

export function calculateCapitalGainTax(
  totalCapitalGain: number,
  priorLosses: number,
  taxMode: 'pfu' | 'bareme',
  otherIncome: number,
  taxShares: number,
  acquisitionGainTaxableIncome: number = 0,
  holdingAbatement: number = 0,
  config?: TaxConfig
): CapitalGainTaxResult {
  const pfuIrRate = config?.pfuIrRate ?? PFU_IR_RATE;
  const psPatrimoine = config?.psPatrimoine ?? PS_PATRIMOINE;
  const csgDeductible = config?.csgDeductible ?? CSG_DEDUCTIBLE;

  const netLoss = totalCapitalGain < 0 ? Math.abs(totalCapitalGain) : 0;

  if (totalCapitalGain <= 0) {
    return {
      grossGain: totalCapitalGain,
      netGain: 0,
      ir: 0,
      ps: 0,
      deductibleCSG: 0,
      holdingAbatement: 0,
      total: 0,
      remainingLosses: priorLosses + netLoss,
      netLoss,
    };
  }

  const netGain = Math.max(0, totalCapitalGain - priorLosses);
  const remainingLosses = Math.max(0, priorLosses - totalCapitalGain);

  if (taxMode === 'pfu') {
    const ir = netGain * pfuIrRate;
    const ps = netGain * psPatrimoine;
    return {
      grossGain: totalCapitalGain,
      netGain,
      ir,
      ps,
      deductibleCSG: 0,
      holdingAbatement: 0,
      total: ir + ps,
      remainingLosses,
      netLoss: 0,
    };
  } else {
    const baseIncome = otherIncome + acquisitionGainTaxableIncome;
    const effectiveAbatement = Math.min(holdingAbatement, netGain);
    const irTaxableGain = netGain - effectiveAbatement;
    const ir =
      calculateProgressiveTax(baseIncome + irTaxableGain, taxShares, config) -
      calculateProgressiveTax(baseIncome, taxShares, config);
    const ps = netGain * psPatrimoine;
    const deductibleCSG = netGain * csgDeductible;
    return {
      grossGain: totalCapitalGain,
      netGain,
      ir,
      ps,
      deductibleCSG,
      holdingAbatement: effectiveAbatement,
      total: ir + ps,
      remainingLosses,
      netLoss: 0,
    };
  }
}
