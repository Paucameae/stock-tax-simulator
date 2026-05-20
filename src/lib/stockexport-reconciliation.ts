import type { GrantInfo, PlanType, QualificationReason, SoldLot, StockLot, StockOrigin, VestEvent } from './types';

/**
 * Tolerance window when matching Fidelity deposit dates to Microsoft vest dates.
 * Microsoft vests on a fixed schedule (15th or last day of month) but Fidelity
 * deposits the shares a few business days later — observed lag is 0–3 calendar
 * days, so 5 days gives a safety margin for long weekends / holidays without
 * crossing into the next vest event (minimum spacing between distinct vest
 * events in a single grant is ~13 days).
 */
const DATE_MATCH_TOLERANCE_MS = 5 * 24 * 60 * 60 * 1000;

export interface ReconciliationStats {
  reconciled: number;
  ambiguous: number;
  unmatched: number;
  notApplicable: number; // ESPP or already non-qualifiable
}

export interface ReconciliationResult {
  lots: StockLot[];
  stats: ReconciliationStats;
  warnings: string[];
}

/**
 * Outcome of trying to attach a single (lot or sold-lot) to a StockExport grant.
 * Shared between `reconcileLots` and `reconcileSoldLots` so both paths
 * apply *strictly* the same matching rules — see #5 in the lot-qualification
 * improvement plan.
 */
export type ReconciliationDecision =
  | { kind: 'notApplicable' }
  | { kind: 'unmatched' }
  | { kind: 'ambiguous' }
  | { kind: 'reconciled'; grant: GrantInfo; via: 'unique' | 'by_quantity' | 'by_agreement' };

/**
 * Two-tier index used by `decideReconciliation`. Transactions carry the *real*
 * deposit dates the broker reports, so we try them first; Vest Schedules are
 * the planned (sometimes lagging) dates and act as a fallback for grants where
 * the Transactions sheet was not parsed.
 */
export interface GrantIndex {
  byTxDay: Map<string, GrantInfo[]>;
  byVestDay: Map<string, GrantInfo[]>;
}

/** Which event list of a grant to read from when computing tiebreakers. */
type EventSource = 'transactions' | 'vestSchedule';

/**
 * Single source of truth for the matching logic. Given a lot's
 * (acquisitionDate, origin, quantity) and the pre-indexed grants, decides
 * which grant — if any — should be applied. Exported for the symmetry test.
 *
 * Matching strategy: try Transactions first (broker-aligned dates, populated
 * net shares for quantity tiebreaker). Only if no candidate is found via the
 * tx index do we fall back to the Vest Schedules index — that's the path used
 * by grants imported before this file was parsed against Transactions, and by
 * StockExport files where the Transactions sheet is missing or empty.
 */
export function decideReconciliation(
  acquisitionDate: Date,
  origin: StockOrigin,
  quantity: number,
  index: GrantIndex,
): ReconciliationDecision {
  // ESPP lots are self-describing (Fidelity encodes them as SP with correct metadata).
  if (origin === 'SP') return { kind: 'notApplicable' };

  const viaTx = tryMatch(acquisitionDate, quantity, index.byTxDay, 'transactions');
  if (viaTx.kind !== 'unmatched') return viaTx;

  return tryMatch(acquisitionDate, quantity, index.byVestDay, 'vestSchedule');
}

function tryMatch(
  acquisitionDate: Date,
  quantity: number,
  byDay: Map<string, GrantInfo[]>,
  source: EventSource,
): ReconciliationDecision {
  const candidates = findCandidateGrantsByDate(acquisitionDate, byDay);
  if (candidates.length === 0) return { kind: 'unmatched' };

  // De-duplicate by grantIdHash (a grant could have several events on the same day).
  const uniqueGrants = Array.from(new Map(candidates.map((g) => [g.grantIdHash, g])).values());

  if (uniqueGrants.length === 1) {
    return { kind: 'reconciled', grant: uniqueGrants[0], via: 'unique' };
  }

  // Multiple grants — first try to disambiguate by net-share quantity.
  const byQuantity = pickByQuantity(uniqueGrants, acquisitionDate, quantity, source);
  if (byQuantity) {
    return { kind: 'reconciled', grant: byQuantity, via: 'by_quantity' };
  }

  // Otherwise, only safe when they all agree on the classification.
  const planTypes = new Set(uniqueGrants.map((g) => g.planType));
  const origins = new Set(uniqueGrants.map((g) => g.origin));
  if (planTypes.size === 1 && origins.size === 1) {
    return { kind: 'reconciled', grant: uniqueGrants[0], via: 'by_agreement' };
  }

  return { kind: 'ambiguous' };
}

function viaToReason(via: 'unique' | 'by_quantity' | 'by_agreement'): QualificationReason {
  switch (via) {
    case 'unique':
      return 'reconciled_unique';
    case 'by_quantity':
      return 'reconciled_by_quantity';
    case 'by_agreement':
      return 'reconciled_by_agreement';
  }
}

/**
 * When the matched grant was reclassified as non-qualified thanks to the
 * StockExport Transactions sheet (`nqDetected`), the *reason* the resulting
 * lot ends up non-qualified is the withholding signal — not the date match.
 * Surface that more informative reason instead of the generic reconciliation
 * reason so the UI tooltip explains the actual evidence.
 */
function reasonForGrant(grant: GrantInfo, via: 'unique' | 'by_quantity' | 'by_agreement'): QualificationReason {
  if (grant.nqDetected && grant.planType === 'non_qualified') {
    return 'nq_via_withholding';
  }
  return viaToReason(via);
}

/**
 * Apply StockExport grant metadata to a set of Fidelity lots:
 *  - assign planType and refine origin when a grant can be identified by vest date;
 *  - flag lots as `reconciled` so the UI can display them differently;
 *  - keep lots untouched when matching is ambiguous or no grant is found.
 */
export function reconcileLots(lots: StockLot[], grants: GrantInfo[]): ReconciliationResult {
  const stats: ReconciliationStats = { reconciled: 0, ambiguous: 0, unmatched: 0, notApplicable: 0 };
  const warnings: string[] = [];

  const index = indexGrants(grants);

  const out = lots.map((lot) => {
    const decision = decideReconciliation(lot.acquisitionDate, lot.origin, lot.quantity, index);
    switch (decision.kind) {
      case 'notApplicable':
        stats.notApplicable++;
        return lot;
      case 'unmatched':
        stats.unmatched++;
        return lot;
      case 'reconciled':
        stats.reconciled++;
        return applyGrant(lot, decision.grant, reasonForGrant(decision.grant, decision.via));
      case 'ambiguous':
        stats.ambiguous++;
        warnings.push(
          `Lot du ${lot.acquisitionDate.toLocaleDateString('fr-FR')} : plusieurs grants candidats avec classifications différentes — qualification conservée telle quelle.`,
        );
        return lot;
    }
  });

  return { lots: out, stats, warnings };
}

/**
 * Same logic as `reconcileLots` but for already-realised sales. The decision
 * function is shared so the two paths cannot drift (see symmetry test).
 */
export function reconcileSoldLots(soldLots: SoldLot[], grants: GrantInfo[]): {
  lots: SoldLot[];
  stats: ReconciliationStats;
  warnings: string[];
} {
  const stats: ReconciliationStats = { reconciled: 0, ambiguous: 0, unmatched: 0, notApplicable: 0 };
  const warnings: string[] = [];

  const index = indexGrants(grants);

  const out = soldLots.map((sl) => {
    const decision = decideReconciliation(sl.acquisitionDate, sl.origin, sl.quantity, index);
    switch (decision.kind) {
      case 'notApplicable':
        stats.notApplicable++;
        return sl;
      case 'unmatched':
        stats.unmatched++;
        return sl;
      case 'reconciled':
        stats.reconciled++;
        return applyGrantToSoldLot(sl, decision.grant, reasonForGrant(decision.grant, decision.via));
      case 'ambiguous':
        stats.ambiguous++;
        warnings.push(
          `Lot vendu acquis le ${sl.acquisitionDate.toLocaleDateString('fr-FR')} : plusieurs grants candidats avec classifications différentes — qualification conservée telle quelle.`,
        );
        return sl;
    }
  });

  return { lots: out, stats, warnings };
}

function indexGrants(grants: GrantInfo[]): GrantIndex {
  const byTxDay = new Map<string, GrantInfo[]>();
  const byVestDay = new Map<string, GrantInfo[]>();
  for (const grant of grants) {
    for (const tx of grant.transactions ?? []) {
      const key = dayKey(tx.date);
      const list = byTxDay.get(key) ?? [];
      list.push(grant);
      byTxDay.set(key, list);
    }
    for (const vest of grant.vestSchedule) {
      const key = dayKey(vest.date);
      const list = byVestDay.get(key) ?? [];
      list.push(grant);
      byVestDay.set(key, list);
    }
  }
  return { byTxDay, byVestDay };
}

function findCandidateGrantsByDate(date: Date, byDay: Map<string, GrantInfo[]>): GrantInfo[] {
  const key = dayKey(date);
  const sameDay = byDay.get(key);
  if (sameDay && sameDay.length > 0) return sameDay;

  const t = date.getTime();
  const fuzzy: GrantInfo[] = [];
  for (const [k, list] of byDay.entries()) {
    const d = dayFromKey(k);
    if (Math.abs(d.getTime() - t) <= DATE_MATCH_TOLERANCE_MS) fuzzy.push(...list);
  }
  return fuzzy;
}

function applyGrantToSoldLot(sl: SoldLot, grant: GrantInfo, reason: QualificationReason): SoldLot {
  const origin: StockOrigin = grant.origin;
  const planType: PlanType = grant.planType;
  return {
    ...sl,
    origin,
    planType,
    grantIdHash: grant.grantIdHash,
    awardType: grant.awardType,
    reconciled: true,
    qualificationReason: reason,
  };
}

/**
 * Tie-breaker used when multiple distinct grants have an event near the lot's
 * acquisition date. Returns the unique grant whose event on (or nearest to)
 * `date` has `netShares` equal to `quantity`. Returns null if zero or more
 * than one candidate matches — in that case the caller falls back to the
 * classification-agreement check.
 *
 * Reads from `grant.transactions` when matching via the Transactions index
 * (where `netShares` is always populated) and from `grant.vestSchedule`
 * otherwise. The vest path may not have `netShares` populated at all, in
 * which case this helper returns null and the agreement check takes over.
 */
function pickByQuantity(
  grants: GrantInfo[],
  date: Date,
  quantity: number,
  source: EventSource,
): GrantInfo | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const t = date.getTime();
  const matches: GrantInfo[] = [];
  for (const grant of grants) {
    const events = source === 'transactions' ? (grant.transactions ?? []) : grant.vestSchedule;
    let best: VestEvent | null = null;
    let bestDelta = Infinity;
    for (const ev of events) {
      const delta = Math.abs(ev.date.getTime() - t);
      if (delta <= DATE_MATCH_TOLERANCE_MS && delta < bestDelta) {
        best = ev;
        bestDelta = delta;
      }
    }
    if (best && best.netShares !== undefined && best.netShares === quantity) {
      matches.push(grant);
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

function applyGrant(lot: StockLot, grant: GrantInfo, reason: QualificationReason): StockLot {
  const origin: StockOrigin = grant.origin;
  const planType: PlanType = grant.planType;
  return {
    ...lot,
    origin,
    planType,
    grantIdHash: grant.grantIdHash,
    awardType: grant.awardType,
    reconciled: true,
    qualificationReason: reason,
  };
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map((s) => parseInt(s, 10));
  return new Date(y, m - 1, d);
}
