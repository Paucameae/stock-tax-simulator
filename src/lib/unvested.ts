import type { GrantInfo, VestEvent, PlanType } from './types';

/** A future vest event enriched with its grant context. */
export interface UpcomingVest {
  date: Date;
  shares: number;
  awardType: string;
  planType: PlanType;
  grantIdHash: string;
}

/**
 * Flatten all grants into a list of future vest events, sorted by date ascending.
 * "Future" means strictly after `now`. Past vests are already materialised as
 * Fidelity lots and are shown elsewhere.
 */
export function getUpcomingVests(grants: GrantInfo[], now: Date = new Date()): UpcomingVest[] {
  const nowMs = now.getTime();
  const out: UpcomingVest[] = [];
  for (const g of grants) {
    for (const v of g.vestSchedule) {
      if (v.date.getTime() > nowMs && v.shares > 0) {
        out.push({
          date: v.date,
          shares: v.shares,
          awardType: g.awardType,
          planType: g.planType,
          grantIdHash: g.grantIdHash,
        });
      }
    }
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

/** Group upcoming vests by calendar year. Returns entries sorted by year ascending. */
export function groupUpcomingVestsByYear(vests: UpcomingVest[]): Array<{
  year: number;
  shares: number;
  events: UpcomingVest[];
}> {
  const byYear = new Map<number, UpcomingVest[]>();
  for (const v of vests) {
    const y = v.date.getFullYear();
    const arr = byYear.get(y);
    if (arr) arr.push(v);
    else byYear.set(y, [v]);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, events]) => ({
      year,
      shares: events.reduce((s, e) => s + e.shares, 0),
      events,
    }));
}

/** Total unvested shares across all future events. */
export function totalUpcomingShares(vests: VestEvent[] | UpcomingVest[]): number {
  return vests.reduce((s, v) => s + v.shares, 0);
}
