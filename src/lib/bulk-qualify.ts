import type { PlanType, QualificationReason, SoldLot, StockLot, StockOrigin } from './types';

/**
 * User intent for bulk-requalifying a set of lots:
 *   - 'uniform': apply the same (origin, planType) to every eligible lot.
 *   - 'byDate':  split on a pivot acquisition date — typically used to mark
 *                everything vested before the Macron law cut-off as
 *                pré-Macron and the rest as Macron.
 */
export type BulkQualifyChoice =
  | { kind: 'uniform'; origin: StockOrigin; planType: PlanType }
  | {
      kind: 'byDate';
      /** Pivot acquisition date. Lots strictly before are classified by `before`, others by `after`. */
      pivotDate: Date;
      before: { origin: StockOrigin; planType: PlanType };
      after: { origin: StockOrigin; planType: PlanType };
    };

/** Loose shape so the helpers can operate on either StockLot or SoldLot. */
interface QualifiableLot {
  acquisitionDate: Date;
  origin: StockOrigin;
  planType: PlanType;
  reconciled?: boolean;
  qualificationReason?: QualificationReason;
}

/**
 * Optional opt-in flags that loosen the default eligibility rules.
 *
 * `includeEspp` allows the user to forcibly requalify lots that the broker
 * exported as ESPP (origin SP). By default we keep them out because their
 * tax regime is self-describing and unique (ESPP discount, specific cost
 * basis treatment). Surface this only when the user explicitly opts in
 * (typically because the SP labelling is wrong — e.g. shares actually
 * issued from reinvested dividends).
 */
export interface BulkQualifyOptions {
  includeEspp?: boolean;
}

/**
 * Bulk-qualification only touches lots that the user genuinely needs to
 * decide for: lots already reconciled against StockExport carry an
 * authoritative classification we must not silently overwrite, and ESPP
 * lots (origin SP) are self-describing in broker exports — unless the
 * user opts in via `options.includeEspp`.
 */
export function isEligibleForBulk(lot: QualifiableLot, options: BulkQualifyOptions = {}): boolean {
  if (lot.reconciled) return false;
  if (lot.origin === 'SP' && !options.includeEspp) return false;
  return true;
}

export function countEligible(items: QualifiableLot[], options: BulkQualifyOptions = {}): number {
  return items.filter((item) => isEligibleForBulk(item, options)).length;
}

/**
 * Apply a BulkQualifyChoice to a list of lots, leaving non-eligible lots
 * (already reconciled, or ESPP unless `includeEspp` is set) untouched.
 * Generic over StockLot | SoldLot so the same engine drives bulk
 * requalification of open positions and realised sales.
 */
export function applyBulkChoice<T extends QualifiableLot>(
  items: T[],
  choice: BulkQualifyChoice,
  options: BulkQualifyOptions = {},
): T[] {
  return items.map((item) => {
    if (!isEligibleForBulk(item, options)) return item;
    if (choice.kind === 'uniform') {
      return { ...item, origin: choice.origin, planType: choice.planType, qualificationReason: 'bulk_qualify' };
    }
    const target = item.acquisitionDate.getTime() < choice.pivotDate.getTime() ? choice.before : choice.after;
    return { ...item, origin: target.origin, planType: target.planType, qualificationReason: 'bulk_qualify' };
  });
}

/** Convenience wrapper for typed call sites. */
export function applyBulkChoiceToLots(
  lots: StockLot[],
  choice: BulkQualifyChoice,
  options: BulkQualifyOptions = {},
): StockLot[] {
  return applyBulkChoice(lots, choice, options);
}

export function applyBulkChoiceToSoldLots(
  soldLots: SoldLot[],
  choice: BulkQualifyChoice,
  options: BulkQualifyOptions = {},
): SoldLot[] {
  return applyBulkChoice(soldLots, choice, options);
}
