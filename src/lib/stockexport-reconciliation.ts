import type { GrantInfo, PlanType, SoldLot, StockLot, StockOrigin, VestEvent } from './types';

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
 * Apply StockExport grant metadata to a set of Fidelity lots:
 *  - assign planType and refine origin when a grant can be identified by vest date;
 *  - flag lots as `reconciled` so the UI can display them differently;
 *  - keep lots untouched when matching is ambiguous or no grant is found.
 *
 * Strategy: match on vest date only. Quantities don't match 1:1 because Microsoft
 * reports gross vest shares while Fidelity reports net-of-withholding shares.
 * When multiple grants share a vest date but all derive the same planType, we
 * still reconcile (safe ambiguity). Otherwise we abstain.
 */
export function reconcileLots(lots: StockLot[], grants: GrantInfo[]): ReconciliationResult {
  const stats: ReconciliationStats = { reconciled: 0, ambiguous: 0, unmatched: 0, notApplicable: 0 };
  const warnings: string[] = [];

  // Pre-index: vest date (day-granularity) → list of grants having a vest event on that day.
  const byDay = indexGrantsByVestDay(grants);

  const out = lots.map((lot) => {
    // ESPP lots are self-describing (Fidelity encodes them as SP with correct metadata).
    if (lot.origin === 'SP') {
      stats.notApplicable++;
      return lot;
    }

    const candidates = findCandidateGrants(lot, byDay);
    if (candidates.length === 0) {
      stats.unmatched++;
      return lot;
    }

    // De-duplicate by grantIdHash (a grant could have several vest events on the same day).
    const uniqueGrants = Array.from(new Map(candidates.map((g) => [g.grantIdHash, g])).values());

    if (uniqueGrants.length === 1) {
      stats.reconciled++;
      return applyGrant(lot, uniqueGrants[0]);
    }

    // Multiple grants — first try to disambiguate by quantity (Microsoft's
    // Transactions sheet exposes the *net* shares actually deposited at each
    // vest, which is what brokers report). When exactly one grant has a vest
    // matching the lot's date AND quantity, it wins regardless of
    // classification differences.
    const byQuantity = pickByQuantity(uniqueGrants, lot.acquisitionDate, lot.quantity);
    if (byQuantity) {
      stats.reconciled++;
      return applyGrant(lot, byQuantity);
    }

    // Otherwise, only safe when they all agree on the classification.
    const planTypes = new Set(uniqueGrants.map((g) => g.planType));
    const origins = new Set(uniqueGrants.map((g) => g.origin));
    if (planTypes.size === 1 && origins.size === 1) {
      stats.reconciled++;
      return applyGrant(lot, uniqueGrants[0]);
    }

    stats.ambiguous++;
    warnings.push(
      `Lot du ${lot.acquisitionDate.toLocaleDateString('fr-FR')} : plusieurs grants candidats avec classifications différentes — qualification conservée telle quelle.`,
    );
    return lot;
  });

  return { lots: out, stats, warnings };
}

/**
 * Same logic as `reconcileLots` but for already-realised sales.
 *
 * Why we need this even though Morgan Stanley sales already carry an origin
 * derived from the Plan Name: matching against StockExport grants lets us
 * refine the planType (`qualified_macron` vs `qualified_pre_macron`, decided
 * by the grant *award* date which is not present in the sales export) and
 * stamp `grantIdHash` / `awardType` for traceability — exactly like for
 * positions. For Fidelity sales (which lack origin entirely) it can also
 * upgrade the default `DO` to `FM` / `FQ` when a grant matches.
 *
 * Matching is by acquisition date only — same rationale as `reconcileLots`
 * (Fidelity reports net-of-withholding shares, MS reports the gross vest
 * quantity, so quantity comparison is unreliable).
 */
export function reconcileSoldLots(soldLots: SoldLot[], grants: GrantInfo[]): {
  lots: SoldLot[];
  stats: ReconciliationStats;
  warnings: string[];
} {
  const stats: ReconciliationStats = { reconciled: 0, ambiguous: 0, unmatched: 0, notApplicable: 0 };
  const warnings: string[] = [];

  const byDay = indexGrantsByVestDay(grants);

  const out = soldLots.map((sl) => {
    if (sl.origin === 'SP') {
      stats.notApplicable++;
      return sl;
    }

    const candidates = findCandidateGrantsByDate(sl.acquisitionDate, byDay);
    if (candidates.length === 0) {
      stats.unmatched++;
      return sl;
    }

    const uniqueGrants = Array.from(new Map(candidates.map((g) => [g.grantIdHash, g])).values());

    if (uniqueGrants.length === 1) {
      stats.reconciled++;
      return applyGrantToSoldLot(sl, uniqueGrants[0]);
    }

    // Same quantity-based tie-breaker as for open positions.
    const byQuantity = pickByQuantity(uniqueGrants, sl.acquisitionDate, sl.quantity);
    if (byQuantity) {
      stats.reconciled++;
      return applyGrantToSoldLot(sl, byQuantity);
    }

    const planTypes = new Set(uniqueGrants.map((g) => g.planType));
    const origins = new Set(uniqueGrants.map((g) => g.origin));
    if (planTypes.size === 1 && origins.size === 1) {
      stats.reconciled++;
      return applyGrantToSoldLot(sl, uniqueGrants[0]);
    }

    stats.ambiguous++;
    warnings.push(
      `Lot vendu acquis le ${sl.acquisitionDate.toLocaleDateString('fr-FR')} : plusieurs grants candidats avec classifications différentes — qualification conservée telle quelle.`,
    );
    return sl;
  });

  return { lots: out, stats, warnings };
}

function indexGrantsByVestDay(grants: GrantInfo[]): Map<string, GrantInfo[]> {
  const byDay = new Map<string, GrantInfo[]>();
  for (const grant of grants) {
    for (const vest of grant.vestSchedule) {
      const key = dayKey(vest.date);
      const list = byDay.get(key) ?? [];
      list.push(grant);
      byDay.set(key, list);
    }
  }
  return byDay;
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

function applyGrantToSoldLot(sl: SoldLot, grant: GrantInfo): SoldLot {
  const origin: StockOrigin = grant.origin;
  const planType: PlanType = grant.planType;
  return {
    ...sl,
    origin,
    planType,
    grantIdHash: grant.grantIdHash,
    awardType: grant.awardType,
    reconciled: true,
  };
}

function findCandidateGrants(lot: StockLot, byDay: Map<string, GrantInfo[]>): GrantInfo[] {
  return findCandidateGrantsByDate(lot.acquisitionDate, byDay);
}

/**
 * Tie-breaker used when multiple distinct grants have a vest near the lot's
 * acquisition date. Returns the unique grant whose vest event on (or nearest
 * to) `date` has `netShares` equal to `quantity`. Returns null if zero or
 * more than one candidate matches — in that case the caller falls back to
 * the classification-agreement check.
 *
 * Only meaningful when the StockExport Transactions sheet was parsed (i.e.
 * `vest.netShares` is populated). When it isn't, every comparison fails and
 * this helper returns null — leaving prior behaviour unchanged.
 */
function pickByQuantity(grants: GrantInfo[], date: Date, quantity: number): GrantInfo | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const t = date.getTime();
  const matches: GrantInfo[] = [];
  for (const grant of grants) {
    // Find the vest event closest to `date` within the tolerance window.
    let best: VestEvent | null = null;
    let bestDelta = Infinity;
    for (const vest of grant.vestSchedule) {
      const delta = Math.abs(vest.date.getTime() - t);
      if (delta <= DATE_MATCH_TOLERANCE_MS && delta < bestDelta) {
        best = vest;
        bestDelta = delta;
      }
    }
    if (best && best.netShares !== undefined && best.netShares === quantity) {
      matches.push(grant);
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

function applyGrant(lot: StockLot, grant: GrantInfo): StockLot {
  const origin: StockOrigin = grant.origin;
  const planType: PlanType = grant.planType;
  return {
    ...lot,
    origin,
    planType,
    grantIdHash: grant.grantIdHash,
    awardType: grant.awardType,
    reconciled: true,
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
