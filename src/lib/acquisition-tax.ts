import type { AcquisitionGainTaxResult } from './types';
import {
  calculateProgressiveTax,
  PS_PATRIMOINE,
  PS_ACTIVITE,
  CSG_DEDUCTIBLE,
  AGA_ABATEMENT_RATE_SHORT,
  AGA_THRESHOLD,
  SALARY_CONTRIBUTION_RATE,
  type TaxConfig,
} from './tax-rates';

/**
 * Macron AGA abatement rate driven by the holding period (vesting → sale),
 * per KPMG 2025 guidance (deck pages 23 and 27):
 *   - < 2 years         → 0 % (100 % taxable in case 1TZ, no abatement)
 *   - ≥ 2 and < 8 years → 50 % (split 1TZ / 1UZ)
 *   - ≥ 8 years         → 65 %
 * The rate applies on the fraction ≤ 300 k€ only; the > 300 k€ fraction is
 * never abated.
 */
export function macronAbatementRateFromHoldingYears(holdingYears: number): number {
  if (holdingYears < 2) return 0;
  if (holdingYears < 8) return 0.5;
  return 0.65;
}

export function calculateAcquisitionGainTax(
  totalAcquisitionGain: number,
  otherIncome: number,
  taxShares: number,
  planType: 'qualified_macron' | 'qualified_pre_macron',
  grantDate?: Date,
  /**
   * Effective Macron abatement rate to apply on the below-300k portion.
   * Default = 0.5 (legacy behaviour: ≥2 years held). Caller should compute
   * a per-lot weighted average based on actual holding years using
   * {@link macronAbatementRateFromHoldingYears}.
   *
   * Only used when planType === 'qualified_macron'. The pre-Macron regime
   * never applies an abatement, so this argument is ignored for FQ lots.
   */
  macronAbatementRate: number = AGA_ABATEMENT_RATE_SHORT,
  config?: TaxConfig
): AcquisitionGainTaxResult {
  if (totalAcquisitionGain <= 0) {
    return {
      below300k: 0, above300k: 0, abatement50: 0,
      irBelow: 0, irAbove: 0, psBelow: 0, psAbove: 0,
      salaryContribution: 0, deductibleCSGPatrimoine: 0, deductibleCSGActivite: 0,
      deductibleCSG: 0, total: 0,
    };
  }

  const psPatrimoine = config?.psPatrimoine ?? PS_PATRIMOINE;
  const psActivite = config?.psActivite ?? PS_ACTIVITE;
  const csgDeductible = config?.csgDeductible ?? CSG_DEDUCTIBLE;
  const agaThreshold = config?.agaThreshold ?? AGA_THRESHOLD;
  const salaryRate = config?.salaryContributionRate ?? SALARY_CONTRIBUTION_RATE;

  // Pre-Macron regime (FQ). Applied whenever the lot is classified
  // qualified_pre_macron — even when the grant date is unknown (e.g. a user
  // forcing Origine=FQ on a sold lot, which carries no grant date). In that
  // case we default to the post-28/09/2012 sub-regime (T&S, PS activité,
  // 10 % salary contribution, no abatement) — the common Microsoft pré-Macron
  // case (KPMG 2025 deck p. 22). We must NOT fall through to the Macron path,
  // which would wrongly grant the 50 % abatement and the patrimoine PS rate.
  if (planType === 'qualified_pre_macron') {
    return calculatePreMacronAcquisitionGainTax(totalAcquisitionGain, otherIncome, taxShares, grantDate, config);
  }

  // Macron regime (FM, DO qualified) - post 01/01/2018 attributions
  const below = Math.min(totalAcquisitionGain, agaThreshold);
  const above = Math.max(0, totalAcquisitionGain - agaThreshold);

  // Macron AGA: abatement on the fraction ≤ 300 k€.
  // Per KPMG 2025 (p. 23, 27): rate depends on holding period
  // (< 2 years: 0 %, 2-8 years: 50 %, > 8 years: 65 %). The caller is
  // responsible for providing the effective (potentially weighted) rate.
  const abatementRate = Math.max(0, Math.min(macronAbatementRate, 0.65));
  const abatement = below * abatementRate;
  const taxableBelow = below - abatement;
  const psBelow = below * psPatrimoine;

  const psAbove = above * psActivite;
  const salaryContribution = above * salaryRate;

  const irBelow =
    calculateProgressiveTax(otherIncome + taxableBelow, taxShares, config) -
    calculateProgressiveTax(otherIncome, taxShares, config);

  const irAbove =
    calculateProgressiveTax(otherIncome + taxableBelow + above, taxShares, config) -
    calculateProgressiveTax(otherIncome + taxableBelow, taxShares, config);

  // CGI art. 154 quinquies, II, b) : pour les avantages de l'article 80
  // quaterdecies bénéficiant de l'abattement de 50 % (CGI art. 200 A, 3), la
  // CSG n'est déductible qu'à hauteur du rapport base IR / base sociale.
  // L'assiette sociale est le gain brut, la base IR le gain après abattement :
  // appliquer les 6,8 points à l'assiette IR produit exactement ce rapport
  // (6,8 × 50 % = 3,4 points effectifs pour un abattement de 50 %).
  const deductibleCSGPatrimoine = taxableBelow * csgDeductible;
  // Fraction > 300 k€ : CSG sur revenus d'activité, sans abattement donc sans
  // proratisation. Déductible du revenu catégoriel traitements et salaires
  // (CGI art. 154 quinquies, I), et non en case 6DE.
  const deductibleCSGActivite = above * csgDeductible;

  return {
    below300k: below,
    above300k: above,
    abatement50: abatement,
    irBelow,
    irAbove,
    psBelow,
    psAbove,
    salaryContribution,
    deductibleCSGPatrimoine,
    deductibleCSGActivite,
    deductibleCSG: deductibleCSGPatrimoine + deductibleCSGActivite,
    total: irBelow + irAbove + psBelow + psAbove + salaryContribution,
  };
}
function calculatePreMacronAcquisitionGainTax(
  totalAcquisitionGain: number,
  otherIncome: number,
  taxShares: number,
  grantDate: Date | undefined,
  config?: TaxConfig
): AcquisitionGainTaxResult {
  const psPatrimoine = config?.psPatrimoine ?? PS_PATRIMOINE;
  const psActivite = config?.psActivite ?? PS_ACTIVITE;
  const csgDeductible = config?.csgDeductible ?? CSG_DEDUCTIBLE;
  const salaryRate = config?.salaryContributionRate ?? SALARY_CONTRIBUTION_RATE;

  const sep2012 = new Date(2012, 8, 28).getTime();
  // 10 % salary contribution introduced by article 13 of the 2008 Social
  // Security Financing Act, applicable only to AGA grants on or after
  // 16 October 2007 (KPMG 2025 deck p. 21). Grants prior to that date are
  // exempt from the 10 % "contribution salariale".
  const oct2007 = new Date(2007, 9, 16).getTime();
  // When the grant date is unknown (e.g. a manual Origine=FQ override on a
  // sold lot), default to the post-28/09/2012 sub-regime — the common
  // Microsoft pré-Macron case (PS activité 9.7 %, 10 % salary contribution).
  const grantTimestamp = grantDate ? grantDate.getTime() : sep2012;
  const isPre2007Grant = grantTimestamp < oct2007;

  if (grantTimestamp < sep2012) {
    // TODO: KPMG p. 21 also allows the taxpayer to elect for a flat 30 %
    // rate (case 3VI of form 2042 C) in lieu of the progressive bareme.
    // Not yet implemented; would require a Settings toggle. Currently only
    // the progressive bareme path is computed.
    const ir =
      calculateProgressiveTax(otherIncome + totalAcquisitionGain, taxShares, config) -
      calculateProgressiveTax(otherIncome, taxShares, config);
    const ps = totalAcquisitionGain * psPatrimoine;
    const salaryContribution = isPre2007Grant ? 0 : totalAcquisitionGain * salaryRate;
    // PS patrimoine et aucun abattement : pas de proratisation (CGI art. 154
    // quinquies, II) — 6,8 points de l'assiette, à reporter en case 6DE.
    const deductibleCSG = totalAcquisitionGain * csgDeductible;

    return {
      below300k: totalAcquisitionGain,
      above300k: 0,
      abatement50: 0,
      irBelow: ir,
      irAbove: 0,
      psBelow: ps,
      psAbove: 0,
      salaryContribution,
      deductibleCSGPatrimoine: deductibleCSG,
      deductibleCSGActivite: 0,
      deductibleCSG,
      total: ir + ps + salaryContribution,
    };
  } else {
    const ir =
      calculateProgressiveTax(otherIncome + totalAcquisitionGain, taxShares, config) -
      calculateProgressiveTax(otherIncome, taxShares, config);
    const ps = totalAcquisitionGain * psActivite;
    const salaryContribution = totalAcquisitionGain * salaryRate;
    // Gain imposé en traitements et salaires : CSG d'activité, 6,8 points
    // déductibles du revenu catégoriel (CGI art. 154 quinquies, I), pas en 6DE.
    const deductibleCSG = totalAcquisitionGain * csgDeductible;

    return {
      below300k: totalAcquisitionGain,
      above300k: 0,
      abatement50: 0,
      irBelow: ir,
      irAbove: 0,
      psBelow: ps,
      psAbove: 0,
      salaryContribution,
      deductibleCSGPatrimoine: 0,
      deductibleCSGActivite: deductibleCSG,
      deductibleCSG,
      total: ir + ps + salaryContribution,
    };
  }
}
