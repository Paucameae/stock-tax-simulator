import type { CapitalGainTaxResult } from './types';
import {
  calculateProgressiveTax,
  PS_PATRIMOINE,
  CSG_DEDUCTIBLE,
  PFU_IR_RATE,
  type TaxConfig,
} from './tax-rates';

export function calculateCapitalGainTax(
  totalCapitalGain: number,
  priorLosses: number,
  taxMode: 'pfu' | 'bareme',
  otherIncome: number,
  taxShares: number,
  acquisitionGainTaxableIncome: number = 0,
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
      total: ir + ps,
      remainingLosses,
      netLoss: 0,
    };
  } else {
    const baseIncome = otherIncome + acquisitionGainTaxableIncome;
    const ir =
      calculateProgressiveTax(baseIncome + netGain, taxShares, config) -
      calculateProgressiveTax(baseIncome, taxShares, config);
    const ps = netGain * psPatrimoine;
    const deductibleCSG = netGain * csgDeductible;
    return {
      grossGain: totalCapitalGain,
      netGain,
      ir,
      ps,
      deductibleCSG,
      total: ir + ps,
      remainingLosses,
      netLoss: 0,
    };
  }
}
