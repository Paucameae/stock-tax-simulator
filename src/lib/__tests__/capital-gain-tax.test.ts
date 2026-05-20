import { describe, it, expect } from 'vitest';
import { calculateCapitalGainTax, allocateHoldingAbatement } from '../capital-gain-tax';
import { getTaxConfig, calculateProgressiveTax } from '../tax-rates';

const cfg2025 = getTaxConfig(2025);

describe('calculateCapitalGainTax', () => {
  describe('guards and loss handling', () => {
    it('returns zeros for zero gain', () => {
      const r = calculateCapitalGainTax(0, 0, 'pfu', 0, 1, 0, 0, cfg2025);
      expect(r.total).toBe(0);
      expect(r.ir).toBe(0);
      expect(r.ps).toBe(0);
      expect(r.netGain).toBe(0);
      expect(r.netLoss).toBe(0);
    });

    it('records net loss when gross gain is negative', () => {
      const r = calculateCapitalGainTax(-5000, 0, 'pfu', 0, 1, 0, 0, cfg2025);
      expect(r.total).toBe(0);
      expect(r.netGain).toBe(0);
      expect(r.netLoss).toBe(5000);
      expect(r.remainingLosses).toBe(5000);
    });

    it('adds new loss on top of prior losses', () => {
      const r = calculateCapitalGainTax(-3000, 2000, 'pfu', 0, 1, 0, 0, cfg2025);
      expect(r.netLoss).toBe(3000);
      expect(r.remainingLosses).toBe(5000);
    });

    it('deducts prior losses from gain; remainingLosses shrinks to 0', () => {
      const r = calculateCapitalGainTax(10000, 3000, 'pfu', 0, 1, 0, 0, cfg2025);
      expect(r.netGain).toBe(7000);
      expect(r.remainingLosses).toBe(0);
    });

    it('keeps leftover prior losses when gain < priorLosses', () => {
      const r = calculateCapitalGainTax(2000, 5000, 'pfu', 0, 1, 0, 0, cfg2025);
      expect(r.netGain).toBe(0);
      expect(r.remainingLosses).toBe(3000);
      expect(r.total).toBe(0);
    });
  });

  describe('PFU mode', () => {
    it('applies 12.8% IR and PS patrimoine on net gain', () => {
      const r = calculateCapitalGainTax(10000, 0, 'pfu', 0, 1, 0, 0, cfg2025);
      expect(r.ir).toBeCloseTo(10000 * cfg2025.pfuIrRate, 2);
      expect(r.ps).toBeCloseTo(10000 * cfg2025.psPatrimoine, 2);
      expect(r.total).toBeCloseTo(r.ir + r.ps, 2);
    });

    it('ignores holding abatement in PFU mode', () => {
      const withAbatement = calculateCapitalGainTax(10000, 0, 'pfu', 0, 1, 0, 5000, cfg2025);
      const without = calculateCapitalGainTax(10000, 0, 'pfu', 0, 1, 0, 0, cfg2025);
      expect(withAbatement.total).toBeCloseTo(without.total, 2);
      expect(withAbatement.holdingAbatement).toBe(0);
      expect(withAbatement.deductibleCSG).toBe(0);
    });

    it('ignores other income in PFU mode (flat rate)', () => {
      const low = calculateCapitalGainTax(10000, 0, 'pfu', 0, 1, 0, 0, cfg2025);
      const high = calculateCapitalGainTax(10000, 0, 'pfu', 150000, 1, 0, 0, cfg2025);
      expect(high.total).toBeCloseTo(low.total, 2);
    });
  });

  describe('Bareme mode', () => {
    it('applies holding abatement capped at net gain', () => {
      const r = calculateCapitalGainTax(10000, 0, 'bareme', 0, 1, 0, 20000, cfg2025);
      expect(r.holdingAbatement).toBe(10000);
    });

    it('applies abatement exactly when equal to net gain', () => {
      const r = calculateCapitalGainTax(10000, 0, 'bareme', 0, 1, 0, 10000, cfg2025);
      expect(r.holdingAbatement).toBe(10000);
      expect(r.ir).toBe(0);
    });

    it('applies full abatement below net gain', () => {
      const r = calculateCapitalGainTax(20000, 0, 'bareme', 0, 1, 0, 8000, cfg2025);
      expect(r.holdingAbatement).toBe(8000);
      // IR computed on 20000 - 8000 = 12000 stacked on otherIncome 0
      const expectedIr = calculateProgressiveTax(12000, 1, cfg2025);
      expect(r.ir).toBeCloseTo(expectedIr, 2);
    });

    it('applies PS on full net gain (abatement does not reduce PS)', () => {
      const r = calculateCapitalGainTax(10000, 0, 'bareme', 0, 1, 0, 4000, cfg2025);
      expect(r.ps).toBeCloseTo(10000 * cfg2025.psPatrimoine, 2);
    });

    it('computes deductible CSG on full net gain', () => {
      const r = calculateCapitalGainTax(10000, 0, 'bareme', 50000, 1, 0, 0, cfg2025);
      expect(r.deductibleCSG).toBeCloseTo(10000 * cfg2025.csgDeductible, 2);
    });

    it('IR stacks on top of other income (progressive)', () => {
      const low = calculateCapitalGainTax(10000, 0, 'bareme', 0, 1, 0, 0, cfg2025);
      const high = calculateCapitalGainTax(10000, 0, 'bareme', 100000, 1, 0, 0, cfg2025);
      expect(high.ir).toBeGreaterThan(low.ir);
    });

    it('stacks on top of acquisition-gain taxable income', () => {
      const withoutAcq = calculateCapitalGainTax(10000, 0, 'bareme', 50000, 1, 0, 0, cfg2025);
      const withAcq = calculateCapitalGainTax(10000, 0, 'bareme', 50000, 1, 30000, 0, cfg2025);
      // With AGA income stacked, the CGT IR should be in a higher bracket
      expect(withAcq.ir).toBeGreaterThanOrEqual(withoutAcq.ir);
    });
  });

  describe('total coherence', () => {
    it('PFU total equals ir + ps exactly', () => {
      const r = calculateCapitalGainTax(25000, 500, 'pfu', 80000, 2, 0, 0, cfg2025);
      expect(r.total).toBeCloseTo(r.ir + r.ps, 2);
    });

    it('Bareme total equals ir + ps (deductible CSG not included in total)', () => {
      const r = calculateCapitalGainTax(25000, 500, 'bareme', 80000, 2, 0, 3000, cfg2025);
      expect(r.total).toBeCloseTo(r.ir + r.ps, 2);
    });
  });
});

describe('allocateHoldingAbatement', () => {
  it('returns 0 when no lots are provided', () => {
    expect(allocateHoldingAbatement([], 0)).toBe(0);
  });

  it('returns 0 when all lots are ineligible (rate = 0)', () => {
    const abat = allocateHoldingAbatement(
      [{ pv: 5000, rate: 0 }, { pv: 3000, rate: 0 }],
      0,
    );
    expect(abat).toBe(0);
  });

  it('applies the lot rate to a single eligible PV without any loss', () => {
    const abat = allocateHoldingAbatement([{ pv: 10000, rate: 0.5 }], 0);
    expect(abat).toBe(5000);
  });

  it('imputes prior losses on non-eligible PV first (preserves abatement-eligible PV)', () => {
    // 10 000 € PV pré-2018 (50 %) + 5 000 € PV post-2018 (0 %) − 3 000 € MV antérieures.
    // Ordre optimal : la MV s'impute d'abord sur les 5 000 € non éligibles, ne
    // laissant rien à grignoter sur la PV éligible → abattement = 10 000 × 50 % = 5 000 €.
    const abat = allocateHoldingAbatement(
      [
        { pv: 10000, rate: 0.5 },
        { pv: 5000, rate: 0 },
      ],
      3000,
    );
    expect(abat).toBe(5000);
  });

  it('imputes year MV (negative pv) on non-eligible PV first', () => {
    // 10 000 € PV pré-2018 (50 %) + 5 000 € PV post-2018 (0 %) + lot MV −8 000 €.
    // MV de l'année = 8 000 €. Imputation : 5 000 € sur post-2018 puis 3 000 €
    // sur pré-2018 → reste 7 000 € pré-2018 × 50 % = 3 500 €.
    const abat = allocateHoldingAbatement(
      [
        { pv: 10000, rate: 0.5 },
        { pv: 5000, rate: 0 },
        { pv: -8000, rate: 0 },
      ],
      0,
    );
    expect(abat).toBe(3500);
  });

  it('prefers absorbing losses on the lowest-rate eligible lot first', () => {
    // PV 10 000 à 65 % (≥ 8 ans) + PV 6 000 à 50 % (2-8 ans) − 4 000 € MV antérieures.
    // Ordre optimal : MV s'impute sur la PV à 50 % d'abord → reste 2 000 € à 50 %
    // + 10 000 € à 65 % = 1 000 + 6 500 = 7 500 €.
    const abat = allocateHoldingAbatement(
      [
        { pv: 10000, rate: 0.65 },
        { pv: 6000, rate: 0.5 },
      ],
      4000,
    );
    expect(abat).toBe(7500);
  });

  it('caps the abatement at the residual PV (heavy losses absorb everything)', () => {
    // 5 000 € PV pré-2018 (50 %) − 8 000 € MV antérieures → tout est absorbé.
    const abat = allocateHoldingAbatement(
      [{ pv: 5000, rate: 0.5 }],
      8000,
    );
    expect(abat).toBe(0);
  });

  it('is consistent with calculateCapitalGainTax via the engine integration', () => {
    // Cas simple PV unique sans MV : doit donner le même montant qu'avant
    // la refactorisation (10 000 € × 65 % = 6 500 €).
    const abat = allocateHoldingAbatement([{ pv: 10000, rate: 0.65 }], 0);
    const r = calculateCapitalGainTax(10000, 0, 'bareme', 0, 1, 0, abat, cfg2025);
    expect(r.holdingAbatement).toBe(6500);
  });
});
