export interface TaxBracket {
  limit: number;
  rate: number;
}

export interface TaxConfig {
  brackets: TaxBracket[];
  /**
   * PS on "revenus du patrimoine" (capital gains, AGA acquisition gain).
   * Liquidated in the annual 2042 at the rate in force at collection time.
   * For 2025 income → 18,6 %: LFSS 2026 (loi n° 2025-1403 du 30/12/2025,
   * art. 12) raised the CSG of CSS art. L. 136-8, I, 2° from 9,2 % to 10,6 %,
   * applicable "à compter de l'imposition des revenus de l'année 2025".
   */
  psPatrimoine: number;
  /**
   * PS on "revenus d'activité" (AGA acquisition gain above 300 k€, pre-Macron
   * gains taxed as salary). Set by CSS art. L. 136-8, I, **1°**, which the
   * LFSS 2026 did NOT touch: CSG stays at 9,2 %, so PS stay at 9,7 %.
   * Do not align this on `psPatrimoine` — they follow different provisions.
   */
  psActivite: number;
  /**
   * Deductible share of the CSG, in points of income (CGI art. 154 quinquies).
   * NOT a function of the CSG rate: the LFSS 2026 raised the CSG without
   * amending art. 154 quinquies, so the extra 1,4 point is not deductible and
   * the share stays at 6,8 points. Never derive this from `psPatrimoine`.
   */
  csgDeductible: number;
  pfuIrRate: number;
  pfuTotalRate: number;
  /**
   * PS on dividends. Unlike `psPatrimoine`, dividends are due at the rate in
   * force at the **fait générateur** (payment date): the PFNL paid quarterly
   * via form 2778-DIV is libératoire, and even the annual catch-up uses the
   * payment-date rate. KPMG 2025 deck p. 33 confirms 17,2 % for dividends
   * paid in 2025.
   */
  psDividends: number;
  /**
   * Deductible share of the CSG on dividends taxed under the barème (2OP).
   * Same 6,8 points as `csgDeductible` (CGI art. 154 quinquies, II), whatever
   * the CSG rate applied to the dividend.
   */
  csgDeductibleDividends: number;
  /** PFU global rate on dividends = 12,8 % IR + `psDividends`. */
  pfuDividendsTotalRate: number;
  salaryContributionRate: number;
  agaAbatementRateShort: number;
  agaAbatementRateLong: number;
  agaThreshold: number;
  cehrSingle: { from: number; to: number; rate: number }[];
  cehrCouple: { from: number; to: number; rate: number }[];
  qfCapPerHalfShare: number;
}

// ---- Per-year configurations ----

const TAX_CONFIG_2024: TaxConfig = {
  brackets: [
    { limit: 11294, rate: 0 },
    { limit: 28797, rate: 0.11 },
    { limit: 82341, rate: 0.30 },
    { limit: 177106, rate: 0.41 },
    { limit: Infinity, rate: 0.45 },
  ],
  psPatrimoine: 0.172,   // CSG 9.2% + CRDS 0.5% + prélèvement solidarité 7.5%
  psActivite: 0.097,     // CSG 9.2% + CRDS 0.5%
  csgDeductible: 0.068,  // CSG déductible 6.8%
  pfuIrRate: 0.128,
  pfuTotalRate: 0.300,   // 12.8% IR + 17.2% PS
  psDividends: 0.172,
  csgDeductibleDividends: 0.068,
  pfuDividendsTotalRate: 0.300,
  salaryContributionRate: 0.10,
  agaAbatementRateShort: 0.50,
  agaAbatementRateLong: 0.65,
  agaThreshold: 300000,
  cehrSingle: [
    { from: 250001, to: 500000, rate: 0.03 },
    { from: 500001, to: Infinity, rate: 0.04 },
  ],
  cehrCouple: [
    { from: 500001, to: 1000000, rate: 0.03 },
    { from: 1000001, to: Infinity, rate: 0.04 },
  ],
  qfCapPerHalfShare: 1759,
};

const TAX_CONFIG_2025: TaxConfig = {
  ...TAX_CONFIG_2024,
  brackets: [
    { limit: 11600, rate: 0 },
    { limit: 29579, rate: 0.11 },
    { limit: 84577, rate: 0.30 },
    { limit: 181917, rate: 0.41 },
    { limit: Infinity, rate: 0.45 },
  ],
  qfCapPerHalfShare: 1791,
  // PS patrimoine (PV de cession, gain d'acquisition AGA) are liquidated in
  // the 2026 annual return at the rate in force at collection time. KPMG
  // 2025 deck slide 48 confirms a PFU at 31,4 % on PV de cession 2025.
  psPatrimoine: 0.186,   // CSG 10.6% + CRDS 0.5% + prélèvement solidarité 7.5%
  // Unchanged by the LFSS 2026: art. 12 only amends the 2° of CSS L. 136-8, I
  // (revenus du patrimoine et produits de placement). Salaries stay at 9,2 %.
  psActivite: 0.097,     // CSG 9.2% + CRDS 0.5%
  // Stays at 6,8 points despite the CSG rising to 10,6 %: the LFSS 2026 left
  // CGI art. 154 quinquies untouched, so the extra 1,4 point is not deductible.
  csgDeductible: 0.068,  // CSG déductible 6.8%
  pfuTotalRate: 0.314,   // 12.8% IR + 18.6% PS
  // Dividends paid during 2025 are taxed at the rate in force at the fait
  // générateur (payment date). KPMG 2025 deck slide 33 confirms 17,2 %.
  // PFNL via form 2778-DIV paid quarterly at 30 % is libératoire; even the
  // annual catch-up for late filers uses 17,2 % PS for 2025 payments.
  psDividends: 0.172,
  csgDeductibleDividends: 0.068,
  pfuDividendsTotalRate: 0.300,
};

const TAX_CONFIG_2026: TaxConfig = {
  ...TAX_CONFIG_2025,
  // Dividends paid from 2026 onwards bear the CSG raised by the LFSS 2026
  // (art. 12, II, 2°: produits de placement "à compter du 1er janvier 2026").
  // The deductible share is unchanged — see `csgDeductible`.
  psDividends: 0.186,
  csgDeductibleDividends: 0.068,
  pfuDividendsTotalRate: 0.314,
};

// ---- Per-rate provenance ----

/**
 * Where a figure comes from and when it was last checked against that source.
 *
 * `url` is only filled when the text itself was opened and read: a reference
 * without a link means "stated in the cited article, not re-read on that date".
 */
export interface RateSource {
  /** Human-readable name of the figure, shown in the UI. */
  label: string;
  /** Legal reference, e.g. "CGI art. 154 quinquies, II". */
  reference: string;
  /** ISO date (YYYY-MM-DD) of the last manual check against the source. */
  verifiedOn: string;
  /** Direct link to the consolidated text, when it was read first-hand. */
  url?: string;
}

const LEGIFRANCE_L136_8 = 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054336623';
const LEGIFRANCE_154_QUINQUIES = 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054336634';
const IMPOTS_AGA =
  'https://www.impots.gouv.fr/particulier/questions/mon-entreprise-ma-attribue-des-actions-gratuites-comment-sera-impose-le-gain';

/**
 * Provenance of every figure of `TaxConfig`.
 *
 * Typed as `Record<keyof TaxConfig, RateSource>` on purpose: adding a rate
 * without declaring where it comes from is a compile error. This registry
 * exists because a rate was once *derived* from another (the CSG déductible
 * was computed as 6,8 + 1,4 when the CSG rose to 10,6 %) and nothing in the
 * code recorded that no text had ever been read.
 *
 * RULE: never derive a rate from another rate. Read the article, cite it here.
 */
export const TAX_RATE_SOURCES: Record<keyof TaxConfig, RateSource> = {
  brackets: {
    label: "Barème progressif de l'impôt sur le revenu",
    reference: 'CGI art. 197, I, 1',
    verifiedOn: '2026-05-10',
  },
  qfCapPerHalfShare: {
    label: 'Plafond du quotient familial par demi-part',
    reference: 'CGI art. 197, I, 2',
    verifiedOn: '2026-05-10',
  },
  psPatrimoine: {
    label: 'Prélèvements sociaux sur les revenus du patrimoine',
    reference: 'CSS art. L. 136-8, I, 2° (CSG 10,6 %) + CRDS 0,5 % + prélèvement de solidarité 7,5 %',
    verifiedOn: '2026-09-22',
    url: LEGIFRANCE_L136_8,
  },
  psActivite: {
    label: "Prélèvements sociaux sur les revenus d'activité",
    reference: 'CSS art. L. 136-8, I, 1° (CSG 9,2 %) + CRDS 0,5 %',
    verifiedOn: '2026-09-22',
    url: LEGIFRANCE_L136_8,
  },
  psDividends: {
    label: 'Prélèvements sociaux sur les produits de placement',
    reference: 'CSS art. L. 136-7 et L. 136-8, I, 2°',
    verifiedOn: '2026-09-22',
    url: LEGIFRANCE_L136_8,
  },
  csgDeductible: {
    label: 'CSG déductible (patrimoine)',
    reference: 'CGI art. 154 quinquies, II',
    verifiedOn: '2026-09-22',
    url: LEGIFRANCE_154_QUINQUIES,
  },
  csgDeductibleDividends: {
    label: 'CSG déductible (dividendes au barème)',
    reference: 'CGI art. 154 quinquies, II',
    verifiedOn: '2026-09-22',
    url: LEGIFRANCE_154_QUINQUIES,
  },
  pfuIrRate: {
    label: 'Taux forfaitaire IR du PFU',
    reference: 'CGI art. 200 A, 1, A',
    verifiedOn: '2026-05-10',
  },
  pfuTotalRate: {
    label: 'PFU global sur les plus-values de cession',
    reference: 'CGI art. 200 A, 1, A + CSS art. L. 136-8',
    verifiedOn: '2026-09-22',
    url: LEGIFRANCE_L136_8,
  },
  pfuDividendsTotalRate: {
    label: 'PFU global sur les dividendes',
    reference: 'CGI art. 200 A, 1, A + CSS art. L. 136-8',
    verifiedOn: '2026-09-22',
    url: LEGIFRANCE_L136_8,
  },
  salaryContributionRate: {
    label: 'Contribution salariale sur le gain d’acquisition',
    reference: 'CSS art. L. 137-14',
    verifiedOn: '2026-09-22',
  },
  agaAbatementRateShort: {
    label: 'Abattement AGA (50 %)',
    reference: 'CGI art. 200 A, 3 ; CGI art. 150-0 D, 1 ter (régimes antérieurs)',
    verifiedOn: '2026-05-10',
    url: IMPOTS_AGA,
  },
  agaAbatementRateLong: {
    label: 'Abattement AGA renforcé (65 %)',
    reference: 'CGI art. 150-0 D, 1 ter (détention > 8 ans)',
    verifiedOn: '2026-05-10',
    url: IMPOTS_AGA,
  },
  agaThreshold: {
    label: 'Seuil annuel du gain d’acquisition AGA',
    reference: 'CGI art. 200 A, 3 (limite de 300 000 €)',
    verifiedOn: '2026-05-10',
    url: IMPOTS_AGA,
  },
  cehrSingle: {
    label: 'CEHR — barème célibataire',
    reference: 'CGI art. 223 sexies',
    verifiedOn: '2026-05-10',
  },
  cehrCouple: {
    label: 'CEHR — barème couple',
    reference: 'CGI art. 223 sexies',
    verifiedOn: '2026-05-10',
  },
};

/**
 * Oldest verification date across every rate — i.e. the date until which the
 * whole rate set can honestly be claimed up to date. Derived, never written by
 * hand: a single stale rate pulls the displayed date back.
 */
export const TAX_RATES_VERIFIED_ON = Object.values(TAX_RATE_SOURCES)
  .map((source) => source.verifiedOn)
  .sort()[0];

const TAX_CONFIGS: Record<number, TaxConfig> = {
  2024: TAX_CONFIG_2024,
  2025: TAX_CONFIG_2025,
  2026: TAX_CONFIG_2026,
};

const TAX_YEARS = Object.keys(TAX_CONFIGS).map(Number).sort((a, b) => a - b);

/** Oldest and newest fiscal years whose figures were checked against impots.gouv.fr. */
export const FIRST_TAX_YEAR = TAX_YEARS[0];
export const LATEST_TAX_YEAR = TAX_YEARS[TAX_YEARS.length - 1];

/**
 * Which year's figures `getTaxConfig` will actually apply.
 *
 * `covered` is false when the requested year has no verified configuration:
 * the nearest one is substituted, which yields plausible amounts that are
 * nonetheless wrong. Callers that display results must say so.
 */
export function resolveTaxYear(fiscalYear: number): { covered: boolean; appliedYear: number } {
  if (TAX_CONFIGS[fiscalYear]) return { covered: true, appliedYear: fiscalYear };
  return {
    covered: false,
    appliedYear: fiscalYear > LATEST_TAX_YEAR ? LATEST_TAX_YEAR : FIRST_TAX_YEAR,
  };
}

/**
 * Get the tax configuration for a given fiscal year.
 * Falls back to the nearest available year — see `resolveTaxYear`.
 */
export function getTaxConfig(fiscalYear: number): TaxConfig {
  return TAX_CONFIGS[resolveTaxYear(fiscalYear).appliedYear];
}

// ---- Default exports (latest config) for backward compatibility ----

export const TAX_BRACKETS_2024 = TAX_CONFIG_2024.brackets;
export const PS_PATRIMOINE = TAX_CONFIG_2026.psPatrimoine;
export const PS_ACTIVITE = TAX_CONFIG_2026.psActivite;
export const CSG_DEDUCTIBLE = TAX_CONFIG_2026.csgDeductible;
export const PFU_IR_RATE = TAX_CONFIG_2026.pfuIrRate;
export const PFU_TOTAL_RATE = TAX_CONFIG_2026.pfuTotalRate;
export const SALARY_CONTRIBUTION_RATE = TAX_CONFIG_2026.salaryContributionRate;
export const AGA_ABATEMENT_RATE_SHORT = TAX_CONFIG_2026.agaAbatementRateShort;
export const AGA_ABATEMENT_RATE_LONG = TAX_CONFIG_2026.agaAbatementRateLong;
export const AGA_THRESHOLD = TAX_CONFIG_2026.agaThreshold;
export const CEHR_SINGLE = TAX_CONFIG_2026.cehrSingle;
export const CEHR_COUPLE = TAX_CONFIG_2026.cehrCouple;
export const QF_CAP_PER_HALF_SHARE = TAX_CONFIG_2026.qfCapPerHalfShare;

// Holding period abatement (for titles acquired before 2018, bareme option)
export function getHoldingAbatementRate(acquisitionDate: Date, saleDate: Date): number {
  if (acquisitionDate.getFullYear() >= 2018) return 0;
  const years = (saleDate.getTime() - acquisitionDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years >= 8) return 0.65;
  if (years >= 2) return 0.50;
  return 0;
}

export function calculateProgressiveTax(taxableIncome: number, shares: number, config?: TaxConfig): number {
  if (shares <= 0) return 0;
  if (taxableIncome <= 0) return 0;
  const perShare = taxableIncome / shares;
  let tax = 0;
  let previousLimit = 0;

  const brackets = config ? config.brackets : TAX_BRACKETS_2024;
  for (const bracket of brackets) {
    if (perShare <= previousLimit) break;
    const taxableInBracket = Math.min(perShare, bracket.limit) - previousLimit;
    tax += taxableInBracket * bracket.rate;
    previousLimit = bracket.limit;
  }

  return tax * shares;
}

export function calculateCEHR(rfi: number, familyStatus: 'single' | 'couple', config?: TaxConfig): number {
  const thresholds = config
    ? (familyStatus === 'single' ? config.cehrSingle : config.cehrCouple)
    : (familyStatus === 'single' ? CEHR_SINGLE : CEHR_COUPLE);
  let cehr = 0;

  for (const t of thresholds) {
    if (rfi > t.from - 1) {
      const taxable = Math.min(rfi, t.to) - (t.from - 1);
      cehr += Math.max(0, taxable) * t.rate;
    }
  }

  return cehr;
}

/**
 * CDHR — Contribution Différentielle sur les Hauts Revenus.
 *
 * Introduced by article 10 of the 2025 Finance Act, codified at CGI art. 224.
 * KPMG 2025 deck, section 8 (pages 72-74).
 *
 * Applies to French tax residents whose adjusted reference tax income (adj.
 * RFR) exceeds €250 k (single) / €500 k (couple) AND whose effective income
 * tax (IR + CEHR + libératoires) is below the minimum threshold below.
 *
 * Headline rule: minimum effective IR = 20 % of adjusted RFR.
 *
 * Smoothing (décote, CGI 224 III 5°): when adj. RFR is between the entry
 * threshold and the upper threshold (330 k single / 660 k couple), the
 * minimum target is replaced by 82,5 % × (RFR − threshold_low). This
 * provides perfect continuity at the upper threshold (82,5 % × 80 000 =
 * 66 000 = 20 % × 330 000) and avoids a cliff effect at the entry
 * threshold (target = 0 when RFR = threshold_low).
 *
 * Main impact for MSFT employees: PFU income (12.8 % IR) can be pushed up
 * to a 20 % effective IR rate, so PFU rises from 31.4 % up to 38.6 %
 * (KPMG p. 73).
 *
 * NOTE: this is a simplified implementation. The legal definition of
 * "adjusted RFR" and "adjusted IR" includes specific add-backs (CGI 224 III
 * 1° and 2°, e.g. add-backs of certain tax credits and a 1/4 reducer for
 * exceptional income). Treat the result as guidance only.
 *
 * @param adjustedRfr  Adjusted reference tax income (≈ RFR for a typical
 *                     MSFT employee with only salary + AGA + dividends/PV).
 * @param adjustedIr   Adjusted income tax = barème IR + PFU IR + CEHR
 *                     + libératoires.
 * @param familyStatus 'single' or 'couple'.
 */
/**
 * Shown wherever a CDHR amount is displayed, so the simplification documented
 * on `calculateCDHR` reaches the user instead of staying in the source.
 */
export const CDHR_APPROXIMATION_NOTICE =
  "Estimation indicative : le RFR et l'impôt « ajustés » au sens du CGI art. 224 III comportent des retraitements " +
  "(réintégration de certains crédits d'impôt, quart des revenus exceptionnels) que le simulateur n'applique pas.";

export function calculateCDHR(
  adjustedRfr: number,
  adjustedIr: number,
  familyStatus: 'single' | 'couple'
): number {
  const thresholdLow = familyStatus === 'single' ? 250_000 : 500_000;
  const thresholdHigh = familyStatus === 'single' ? 330_000 : 660_000;
  if (adjustedRfr <= thresholdLow) return 0;

  // Décote zone: linear ramp from 0 (at threshold_low) up to the headline
  // 20 % at threshold_high. Above threshold_high the headline 20 % applies
  // directly. The two formulas coincide at threshold_high by design.
  const target =
    adjustedRfr <= thresholdHigh
      ? 0.825 * (adjustedRfr - thresholdLow)
      : 0.20 * adjustedRfr;

  if (adjustedIr >= target) return 0;
  return target - adjustedIr;
}
