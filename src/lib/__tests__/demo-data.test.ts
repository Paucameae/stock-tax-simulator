import { describe, it, expect } from 'vitest';
import { buildDemoData } from '../demo-data';
import { isOriginPlanTypeInconsistent, originLabel, planTypeLabel } from '../utils';

describe('buildDemoData', () => {
  // The demo dataset is the first thing most users see, and the declaration
  // view labels each lot with its origin AND its regime. A mismatch there
  // teaches a wrong calculation (a "AGA pré-Macron" lot shown with the 50%
  // Macron abatement), so the invariant is asserted rather than eyeballed.
  it('pairs every lot origin with the regime it implies', () => {
    const { lots, soldLots } = buildDemoData();
    const offenders = [...lots, ...soldLots]
      .filter(isOriginPlanTypeInconsistent)
      .map((l) => `${l.id}: ${originLabel(l.origin)} / ${planTypeLabel(l.planType)}`);
    expect(offenders).toEqual([]);
  });

  it('covers the three regimes so every code path is exercised', () => {
    const { lots } = buildDemoData();
    const planTypes = new Set(lots.map((l) => l.planType));
    expect(planTypes).toEqual(
      new Set(['qualified_macron', 'qualified_pre_macron', 'non_qualified'])
    );
  });

  it('returns fresh objects on every call', () => {
    expect(buildDemoData().lots[0]).not.toBe(buildDemoData().lots[0]);
  });
});
