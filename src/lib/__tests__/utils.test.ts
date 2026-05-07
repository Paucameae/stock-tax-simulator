import { describe, it, expect } from 'vitest';
import { mergeByBroker, isLikelyReinvestedDividend } from '../utils';

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
