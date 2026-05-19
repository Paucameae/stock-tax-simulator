export type StockOrigin = 'SP' | 'DO' | 'FM' | 'FQ';
export type PlanType = 'qualified_macron' | 'qualified_pre_macron' | 'non_qualified';
export type TaxMode = 'pfu' | 'bareme';
export type FamilyStatus = 'single' | 'couple';
export type HoldingPeriod = 'Short' | 'Long';
export type ImportCurrency = 'EUR' | 'USD';

/**
 * Broker identifier. The app supports multi-broker users (typically Microsoft
 * employees who hold shares at Fidelity, Morgan Stanley, or both). The broker
 * is preserved on every lot/sold lot/dividend so users can filter and audit
 * their portfolio per source. The broker has NO fiscal impact — the tax engine
 * aggregates across all sources.
 */
export type Broker = 'fidelity' | 'morgan_stanley';

export interface StockLot {
  id: string;
  broker: Broker;
  acquisitionDate: Date;
  quantity: number;
  costBasisPerShare: number;
  totalCostBasis: number;
  currentValue: number;
  unrealizedGainLoss: number;
  availableForSaleDate?: Date;
  availableForTransferDate?: Date;
  grantDate?: Date;
  origin: StockOrigin;
  holdingPeriod: HoldingPeriod;
  planType: PlanType;
  // ESPP: Fair Market Value at acquisition (before 10% discount)
  esppFmvPerShare?: number;
  esppFmvPerShareUsd?: number;
  // USD import fields
  costBasisPerShareUsd?: number;
  totalCostBasisUsd?: number;
  currentValueUsd?: number;
  eurUsdRate?: number;
  importCurrency?: ImportCurrency;
  // Reconciliation with Microsoft StockExport (optional — present when matched)
  grantIdHash?: string;
  awardType?: string;
  reconciled?: boolean;
  /**
   * True when this lot is recognised as shares received from a reinvested
   * dividend (DRIP). Auto-detected when the lot has a fractional quantity AND
   * its declared origin is a vest-only origin (DO / FM / FQ — vests always
   * come in whole shares, so any fractional quantity is the signature of a
   * DRIP). ESPP-tagged lots (origin SP) can also be fractional, so we don't
   * auto-flag them here.
   * Display-only flag at the moment: surfaced in the UI so the user knows why
   * a lot is showing up out of the usual vest schedule.
   */
  isReinvestedDividend?: boolean;
  /**
   * Provenance of the current (origin, planType) on this lot — used to
   * surface a tooltip explaining *why* the lot is classified as it is.
   * Set everywhere the classification is established or changed: parsers,
   * StockExport reconciliation, manual edits and bulk-qualify.
   */
  qualificationReason?: QualificationReason;
}

/**
 * Why a lot carries its current (origin, planType). Populated as the lot
 * moves through parsing → reconciliation → user edits. Display-only;
 * never affects the tax computation.
 */
export type QualificationReason =
  | 'broker_default'           // value chosen by the broker parser without external info
  | 'broker_plan_name'         // origin derived from the broker's plan label (Morgan Stanley)
  | 'reconciled_unique'        // single StockExport grant matched on vest date
  | 'reconciled_by_quantity'   // multiple grants — disambiguated by net-share count
  | 'reconciled_by_agreement'  // multiple grants but identical (origin, planType)
  | 'nq_via_withholding'       // grant reclassified as NQ thanks to the StockExport Transactions sheet
  | 'manual'                   // user changed the value via a Select on the lot row
  | 'bulk_qualify';            // user used the bulk-qualify panel

/**
 * A single vesting event from the StockExport Vest Schedules sheet.
 * For qualified plans, this is the legal acquisition date (date d'acquisition
 * définitive) which triggers the gain d'acquisition for French tax purposes.
 *
 * `shares` is the *gross* number of shares awarded by the vest. For qualified
 * (FQ/FM) and ESPP grants it equals the number of shares actually deposited
 * to the broker. For non-qualified Stock Awards (DO), the broker withholds a
 * portion of shares to cover income tax, so the deposit equals
 * `shares - sharesForTaxes` (= `netShares`). When the StockExport Transactions
 * sheet is available, we capture both so the reconciliation can match against
 * either gross or net quantity.
 */
export interface VestEvent {
  date: Date;
  shares: number;
  /** Net shares actually deposited to the broker (gross − withheld). Optional: only filled when the Transactions sheet was parsed. */
  netShares?: number;
  /** Shares withheld for tax. > 0 ⇒ non-qualified Stock Award. Optional: only filled when the Transactions sheet was parsed. */
  sharesForTaxes?: number;
}

/**
 * A stock grant extracted from the Microsoft StockExport file.
 * Used to auto-classify Fidelity lots (planType, origin refinement) and to
 * project future unvested income.
 */
export interface GrantInfo {
  /** SHA-256 hash of the original Award ID (we never persist the plaintext). */
  grantIdHash: string;
  /** Raw Award Type label from the file (e.g. "FY23 FQ Annual", "On-Hire FQ", "FY24 SA Annual"). */
  awardType: string;
  /** Award (grant) date — decisive for Macron / pré-Macron classification. */
  awardDate: Date;
  /** Derived plan type based on awardType + awardDate. */
  planType: PlanType;
  /** Short origin code the rest of the app uses (DO / FM / FQ / SP). */
  origin: StockOrigin;
  /** Vesting schedule; dates may be past or future. */
  vestSchedule: VestEvent[];
  /** Totals from Award Summary (for audit display). */
  totalAwarded: number;
  totalVested: number;
  totalUnvested: number;
  /**
   * True when at least one vest of this grant withheld shares for tax (i.e.
   * `sharesForTaxes > 0` on the Transactions sheet). This is the unambiguous
   * signature of a non-qualified Stock Award (DO / non_qualified) and
   * overrides any classification derived from the award label alone.
   * Only set when the Transactions sheet was parsed.
   */
  nqDetected?: boolean;
}

export interface SoldLot {
  id: string;
  broker: Broker;
  acquisitionDate: Date;
  saleDate: Date;
  quantity: number;
  proceeds: number;
  costBasis: number;
  gainLoss: number;
  holdingPeriod: HoldingPeriod;
  origin: StockOrigin;
  planType: PlanType;
  // USD import fields
  proceedsUsd?: number;
  costBasisUsd?: number;
  eurUsdRate?: number;
  importCurrency?: ImportCurrency;
  // Reconciliation with Microsoft StockExport (optional — present when matched)
  grantIdHash?: string;
  awardType?: string;
  reconciled?: boolean;
  /** See StockLot.isReinvestedDividend. Carried through to sold lots so the table can flag historical DRIP sales. */
  isReinvestedDividend?: boolean;
  /** See StockLot.qualificationReason. */
  qualificationReason?: QualificationReason;
}

export interface SaleLotEntry {
  lot: StockLot;
  quantitySold: number;
  salePricePerShare: number;
  saleDate?: Date;
}

export interface SaleSimulation {
  lots: SaleLotEntry[];
  taxMode: TaxMode;
  otherTaxableIncome: number;
  taxShares: number;
  familyStatus: FamilyStatus;
  priorLosses: number;
  fiscalYear: number;
}

export interface LotTaxResult {
  lotId: string;
  proceeds: number;
  acquisitionGain: number;
  capitalGain: number;
  origin: StockOrigin;
  planType: PlanType;
}

export interface AcquisitionGainTaxResult {
  below300k: number;
  above300k: number;
  abatement50: number;
  irBelow: number;
  irAbove: number;
  psBelow: number;
  psAbove: number;
  salaryContribution: number;
  deductibleCSG: number;
  total: number;
}

export interface CapitalGainTaxResult {
  grossGain: number;
  netGain: number;
  ir: number;
  ps: number;
  deductibleCSG: number;
  holdingAbatement: number;
  total: number;
  remainingLosses: number;
  netLoss: number;
}

export interface TaxSimulationResult {
  totalProceeds: number;
  totalAcquisitionGain: number;
  totalCapitalGain: number;
  acquisitionGainTax: AcquisitionGainTaxResult;
  capitalGainTax: CapitalGainTaxResult;
  cehr: number;
  /** CDHR (Contribution Différentielle sur les Hauts Revenus, CGI art. 224, FY 2025+). */
  cdhr: number;
  totalTax: number;
  netAmount: number;
  effectiveTaxRate: number;
  lotResults: LotTaxResult[];
  taxMode: TaxMode;
}

export interface AppSettings {
  familyStatus: FamilyStatus;
  numberOfChildren: number;
  taxShares: number;
  taxSharesManual: boolean;
  otherTaxableIncome: number;
  defaultPlanType: 'qualified_macron' | 'non_qualified';
  priorLosses: number;
}

export interface SavedSimulation {
  id: string;
  date: string;
  name: string;
  result: TaxSimulationResult;
  settings: AppSettings;
  lots: SaleLotEntry[];
}

export interface DeclarationData {
  fiscalYear: number;
  case3VG: number;
  case3VH: number;
  case1TZ: number;
  case1UZ: number;
  case1TT: number;
  option2OP: boolean;
  case3SG: number;
  deductibleCSGNextYear: number;
  form2074Lines: Form2074Line[];
  psDetails: PSDetails;
}

export interface Form2074Line {
  date: string;
  quantity: number;
  origin: string;
  salePrice: number;
  costBasis: number;
  gainLoss: number;
}

export interface PSDetails {
  pvCessionPS: number;
  acquisitionGainPSBelow: number;
  acquisitionGainPSAbove: number;
  total: number;
}
