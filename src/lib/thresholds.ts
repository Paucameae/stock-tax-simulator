// Centralized fiscal threshold detection helpers.
// Components should import from here instead of re-implementing the logic
// inline, so the definition of "exceeds X" stays consistent.

import type { TaxSimulationResult, FamilyStatus } from './types';
import { getTaxConfig, type TaxConfig } from './tax-rates';

export interface ThresholdAnalysis {
  /** True when the AGA acquisition gain crosses the 300 k€ threshold. */
  exceedsAgaThreshold: boolean;
  /** Amount of acquisition gain strictly above the AGA threshold. */
  amountAboveAgaThreshold: number;
  /** True when the high-income surtax (CEHR) applies. */
  cehrTriggered: boolean;
  /** CEHR entry threshold for the current family status (lowest "from"). */
  cehrEntryThreshold: number;
  /** Reference cehr entry threshold for a couple (shown in UI copy). */
  cehrCoupleEntryThreshold: number;
  /** AGA threshold value (typically 300 000 €). */
  agaThreshold: number;
}

export function analyzeThresholds(
  result: TaxSimulationResult,
  fiscalYear: number,
  familyStatus: FamilyStatus = 'single'
): ThresholdAnalysis {
  const cfg: TaxConfig = getTaxConfig(fiscalYear);
  const cehrEntry =
    familyStatus === 'couple'
      ? cfg.cehrCouple[0]?.from ?? 500001
      : cfg.cehrSingle[0]?.from ?? 250001;
  const cehrCoupleEntry = cfg.cehrCouple[0]?.from ?? 500001;

  return {
    exceedsAgaThreshold: result.acquisitionGainTax.above300k > 0,
    amountAboveAgaThreshold: result.acquisitionGainTax.above300k,
    cehrTriggered: result.cehr > 0,
    cehrEntryThreshold: cehrEntry - 1, // "from 250001" -> UI shows 250 000
    cehrCoupleEntryThreshold: cehrCoupleEntry - 1,
    agaThreshold: cfg.agaThreshold,
  };
}
