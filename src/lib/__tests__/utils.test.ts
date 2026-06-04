import { describe, it, expect } from 'vitest';
import { mergeByBroker, isLikelyReinvestedDividend, isLikelyEsppPurchase, qualificationReasonLabel, isDripQualifiedInconsistent } from '../utils';

describe('qualificationReasonLabel', () => {
  it('returns a non-empty French sentence for every known reason', () => {
    const reasons = [
      'broker_default',
      'broker_plan_name',
      'reconciled_unique',
      'reconciled_by_quantity',
      'reconciled_by_agreement',
      'nq_via_withholding',
      'manual',
      'bulk_qualify',
    ] as const;
    for (const r of reasons) {
      const label = qualificationReasonLabel(r);
      expect(label.length).toBeGreaterThan(10);
    }
  });

  it('returns a sensible fallback for undefined', () => {
    expect(qualificationReasonLabel(undefined)).toMatch(/non document/i);
  });
});

describe('isDripQualifiedInconsistent', () => {
  it('flags a DRIP lot on a Macron-qualified plan', () => {
    expect(isDripQualifiedInconsistent({ isReinvestedDividend: true, planType: 'qualified_macron' })).toBe(true);
  });

  it('flags a DRIP lot on a pré-Macron qualified plan', () => {
    expect(isDripQualifiedInconsistent({ isReinvestedDividend: true, planType: 'qualified_pre_macron' })).toBe(true);
  });

  it('does not flag a DRIP lot on a non-qualified plan', () => {
    expect(isDripQualifiedInconsistent({ isReinvestedDividend: true, planType: 'non_qualified' })).toBe(false);
  });

  it('does not flag a non-DRIP lot regardless of the plan type', () => {
    expect(isDripQualifiedInconsistent({ isReinvestedDividend: false, planType: 'qualified_macron' })).toBe(false);
    expect(isDripQualifiedInconsistent({ planType: 'qualified_macron' })).toBe(false);
  });
});

describe('isLikelyReinvestedDividend', () => {
  it('flags fractional quantity on vest origins (DO/FM/FQ) — vests are always whole shares', () => {
    expect(isLikelyReinvestedDividend('DO', 0.5432)).toBe(true);
    expect(isLikelyReinvestedDividend('FM', 12.123)).toBe(true);
    expect(isLikelyReinvestedDividend('FQ', 1.0001)).toBe(true);
  });

  it('does not flag whole-share vest lots', () => {
    expect(isLikelyReinvestedDividend('DO', 9)).toBe(false);
    expect(isLikelyReinvestedDividend('FM', 100)).toBe(false);
  });

  it('never auto-flags ESPP (SP) lots — they can be legitimately fractional', () => {
    expect(isLikelyReinvestedDividend('SP', 0.5)).toBe(false);
    expect(isLikelyReinvestedDividend('SP', 12.345)).toBe(false);
  });

  it('rejects non-positive or non-finite quantities', () => {
    expect(isLikelyReinvestedDividend('DO', 0)).toBe(false);
    expect(isLikelyReinvestedDividend('DO', -1.5)).toBe(false);
    expect(isLikelyReinvestedDividend('DO', NaN)).toBe(false);
  });

  it('treats values within rounding tolerance as whole shares', () => {
    expect(isLikelyReinvestedDividend('DO', 9 + 1e-9)).toBe(false);
  });
});

describe('isLikelyEsppPurchase', () => {
  it('flags any quantity on calendar-quarter-end dates (MSFT ESPP pattern)', () => {
    // Real user case: Fidelity sold lots dated Mar 31 / Jun 30 2023 with fractional qty
    expect(isLikelyEsppPurchase(new Date(2023, 2, 31))).toBe(true);
    expect(isLikelyEsppPurchase(new Date(2023, 5, 30))).toBe(true);
    // Other quarter ends
    expect(isLikelyEsppPurchase(new Date(2024, 8, 30))).toBe(true);  // Sep 30
    expect(isLikelyEsppPurchase(new Date(2024, 11, 31))).toBe(true); // Dec 31
  });

  it('flags quarter-end dates regardless of whole vs fractional quantity', () => {
    // Fidelity may split a single ESPP sale into a whole-share line plus a
    // fractional-share line (real user case: Jun 30 2025 qty 10 + qty 0.5874).
    // Both must be detected as ESPP — the quantity is not part of the signal.
    expect(isLikelyEsppPurchase(new Date(2025, 5, 30))).toBe(true);
  });

  it('accepts the last business day when month-end falls on a weekend', () => {
    // Sep 30 2023 was a Saturday; MSFT ESPP purchase landed on Sep 29 (Friday)
    expect(isLikelyEsppPurchase(new Date(2023, 8, 29))).toBe(true);
    // Dec 31 2022 was a Saturday; purchase on Dec 30 (Friday)
    expect(isLikelyEsppPurchase(new Date(2022, 11, 30))).toBe(true);
  });

  it('does not flag mid-quarter dates (DRIP pay-date pattern)', () => {
    // MSFT dividends pay around the 12th-14th of Feb/May/Aug/Nov
    expect(isLikelyEsppPurchase(new Date(2023, 1, 14))).toBe(false);
    expect(isLikelyEsppPurchase(new Date(2023, 4, 11))).toBe(false);
    expect(isLikelyEsppPurchase(new Date(2023, 7, 10))).toBe(false);
    expect(isLikelyEsppPurchase(new Date(2023, 10, 9))).toBe(false);
  });

  it('does not flag mid-month dates in quarter-end months', () => {
    expect(isLikelyEsppPurchase(new Date(2023, 2, 15))).toBe(false);
    expect(isLikelyEsppPurchase(new Date(2023, 5, 1))).toBe(false);
  });

  it('does not flag non-quarter-end months even on their last day', () => {
    expect(isLikelyEsppPurchase(new Date(2023, 0, 31))).toBe(false);  // Jan 31
    expect(isLikelyEsppPurchase(new Date(2023, 7, 31))).toBe(false);  // Aug 31 (FY Annual vest date)
    expect(isLikelyEsppPurchase(new Date(2023, 10, 30))).toBe(false); // Nov 30
  });

  it('rejects invalid dates', () => {
    expect(isLikelyEsppPurchase(new Date('invalid'))).toBe(false);
  });
});

describe('mergeByBroker', () => {
  it('replaces only the slice of the broker carried by the incoming items', () => {
    const prev = [
      { broker: 'fidelity', id: 'f1' },
      { broker: 'fidelity', id: 'f2' },
      { broker: 'morgan_stanley', id: 'm1' },
    ];
    const incoming = [{ broker: 'fidelity', id: 'f3' }];
    const next = mergeByBroker(prev, incoming);
    expect(next).toHaveLength(2);
    expect(next.find((x) => x.id === 'm1')).toBeDefined();
    expect(next.find((x) => x.id === 'f3')).toBeDefined();
    expect(next.find((x) => x.id === 'f1')).toBeUndefined();
  });

  it('returns the previous list unchanged when incoming is empty', () => {
    const prev = [{ broker: 'fidelity', id: 'f1' }];
    expect(mergeByBroker(prev, [])).toBe(prev);
  });

  it('appends when no previous slice for that broker exists', () => {
    const prev = [{ broker: 'fidelity', id: 'f1' }];
    const next = mergeByBroker(prev, [{ broker: 'morgan_stanley', id: 'm1' }]);
    expect(next).toHaveLength(2);
  });
});
