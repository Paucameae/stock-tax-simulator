import { describe, it, expect } from 'vitest';
import { getUpcomingVests, groupUpcomingVestsByYear, totalUpcomingShares } from '../unvested';
import type { GrantInfo } from '../types';

function mkGrant(overrides: Partial<GrantInfo> = {}): GrantInfo {
  return {
    grantIdHash: 'h',
    awardType: 'FY24 FQ Annual',
    awardDate: new Date('2023-08-31'),
    planType: 'qualified_macron',
    origin: 'DO',
    vestSchedule: [],
    totalAwarded: 0,
    totalVested: 0,
    totalUnvested: 0,
    ...overrides,
  };
}

describe('getUpcomingVests', () => {
  const NOW = new Date('2026-04-22T00:00:00Z');

  it('returns only future vests', () => {
    const grants = [
      mkGrant({
        grantIdHash: 'g1',
        vestSchedule: [
          { date: new Date('2025-08-31'), shares: 10 }, // past
          { date: new Date('2026-08-31'), shares: 11 }, // future
          { date: new Date('2027-08-31'), shares: 12 }, // future
        ],
      }),
    ];
    const upcoming = getUpcomingVests(grants, NOW);
    expect(upcoming).toHaveLength(2);
    expect(upcoming.map((v) => v.shares)).toEqual([11, 12]);
  });

  it('sorts events from multiple grants by date', () => {
    const grants = [
      mkGrant({
        grantIdHash: 'g1',
        awardType: 'FY24 FQ Annual',
        vestSchedule: [
          { date: new Date('2027-08-31'), shares: 5 },
          { date: new Date('2026-08-31'), shares: 6 },
        ],
      }),
      mkGrant({
        grantIdHash: 'g2',
        awardType: 'FY25 FQ Annual',
        vestSchedule: [
          { date: new Date('2026-11-30'), shares: 7 },
          { date: new Date('2027-05-31'), shares: 8 },
        ],
      }),
    ];
    const upcoming = getUpcomingVests(grants, NOW);
    expect(upcoming.map((v) => v.date.toISOString().slice(0, 10))).toEqual([
      '2026-08-31',
      '2026-11-30',
      '2027-05-31',
      '2027-08-31',
    ]);
    expect(upcoming[0].awardType).toBe('FY24 FQ Annual');
    expect(upcoming[1].awardType).toBe('FY25 FQ Annual');
  });

  it('skips vest events with zero or negative shares', () => {
    const grants = [
      mkGrant({
        vestSchedule: [
          { date: new Date('2026-08-31'), shares: 0 },
          { date: new Date('2027-08-31'), shares: 5 },
        ],
      }),
    ];
    expect(getUpcomingVests(grants, NOW)).toHaveLength(1);
  });

  it('returns [] when grants is empty', () => {
    expect(getUpcomingVests([], NOW)).toEqual([]);
  });
});

describe('groupUpcomingVestsByYear', () => {
  it('groups events by calendar year with year totals', () => {
    const NOW = new Date('2026-04-22');
    const grants = [
      mkGrant({
        vestSchedule: [
          { date: new Date('2026-08-31'), shares: 10 },
          { date: new Date('2026-11-30'), shares: 5 },
          { date: new Date('2027-08-31'), shares: 12 },
        ],
      }),
    ];
    const groups = groupUpcomingVestsByYear(getUpcomingVests(grants, NOW));
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ year: 2026, shares: 15 });
    expect(groups[1]).toMatchObject({ year: 2027, shares: 12 });
  });
});

describe('totalUpcomingShares', () => {
  it('sums shares', () => {
    expect(
      totalUpcomingShares([
        { date: new Date(), shares: 3 },
        { date: new Date(), shares: 4 },
      ]),
    ).toBe(7);
  });
});
