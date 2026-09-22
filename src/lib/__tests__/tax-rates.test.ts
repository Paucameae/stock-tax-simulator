import { describe, it, expect } from 'vitest';
import {
  calculateProgressiveTax,
  calculateCEHR,
  calculateCDHR,
  getTaxConfig,
  resolveTaxYear,
  FIRST_TAX_YEAR,
  LATEST_TAX_YEAR,
  TAX_RATE_SOURCES,
  TAX_RATES_VERIFIED_ON,
} from '../tax-rates';
import { TAX_DATA_VERIFIED_ON, TAX_FORMS_VERIFIED_ON } from '../tax-forms';

describe('calculateProgressiveTax', () => {
  it('returns 0 for zero income', () => {
    expect(calculateProgressiveTax(0, 1)).toBe(0);
  });

  it('returns 0 for income within the 0% bracket', () => {
    expect(calculateProgressiveTax(10000, 1)).toBe(0);
  });

  it('calculates tax for income in the 11% bracket', () => {
    // 20,000€ — 1 share
    // 0% on first 11,294 = 0
    // 11% on (20,000 - 11,294) = 11% × 8,706 = 957.66
    const tax = calculateProgressiveTax(20000, 1);
    expect(tax).toBeCloseTo(957.66, 2);
  });

  it('calculates tax for income in the 30% bracket', () => {
    // 50,000€ — 1 share
    // 0% on 11,294 = 0
    // 11% on (28,797 - 11,294) = 11% × 17,503 = 1,925.33
    // 30% on (50,000 - 28,797) = 30% × 21,203 = 6,360.90
    const tax = calculateProgressiveTax(50000, 1);
    expect(tax).toBeCloseTo(1925.33 + 6360.90, 2);
  });

  it('calculates tax for income in the 41% bracket', () => {
    // 100,000€ — 1 share
    // 0% on 11,294
    // 11% on 17,503 = 1,925.33
    // 30% on (82,341 - 28,797) = 30% × 53,544 = 16,063.20
    // 41% on (100,000 - 82,341) = 41% × 17,659 = 7,240.19
    const tax = calculateProgressiveTax(100000, 1);
    expect(tax).toBeCloseTo(1925.33 + 16063.20 + 7240.19, 2);
  });

  it('calculates tax for income in the 45% bracket', () => {
    // 200,000€ — 1 share
    // 0% on 11,294
    // 11% on 17,503 = 1,925.33
    // 30% on 53,544 = 16,063.20
    // 41% on (177,106 - 82,341) = 41% × 94,765 = 38,853.65
    // 45% on (200,000 - 177,106) = 45% × 22,894 = 10,302.30
    const tax = calculateProgressiveTax(200000, 1);
    expect(tax).toBeCloseTo(1925.33 + 16063.20 + 38853.65 + 10302.30, 2);
  });

  it('applies quotient familial for 2 shares (couple)', () => {
    // 60,000€ — 2 shares → 30,000€ per share
    // Per share: 0% on 11,294 + 11% on 17,503 + 30% on (30,000 - 28,797) = 30% × 1,203
    // = 1,925.33 + 360.90 = 2,286.23 per share
    // Total = 2 × 2,286.23 = 4,572.46
    const tax = calculateProgressiveTax(60000, 2);
    expect(tax).toBeCloseTo(4572.46, 2);
  });

  it('applies quotient familial for 2.5 shares', () => {
    const tax = calculateProgressiveTax(60000, 2.5);
    // 60,000 / 2.5 = 24,000 per share
    // 0% on 11,294 + 11% on (24,000 - 11,294) = 11% × 12,706 = 1,397.66
    // Total = 2.5 × 1,397.66 = 3,494.15
    expect(tax).toBeCloseTo(3494.15, 2);
  });

  it('handles negative income by returning 0', () => {
    expect(calculateProgressiveTax(-5000, 1)).toBe(0);
  });

  it('handles zero shares by returning 0 (no division by zero)', () => {
    expect(calculateProgressiveTax(50000, 0)).toBe(0);
  });

  it('handles negative shares by returning 0', () => {
    expect(calculateProgressiveTax(50000, -2)).toBe(0);
  });
});

describe('calculateCEHR', () => {
  it('returns 0 for single below threshold', () => {
    expect(calculateCEHR(200000, 'single')).toBe(0);
  });

  it('returns 0 for couple below threshold', () => {
    expect(calculateCEHR(400000, 'couple')).toBe(0);
  });

  it('calculates 3% band for single', () => {
    // RFI = 300,000: 3% on (300,000 - 250,000) = 3% × 50,000 = 1,500
    const cehr = calculateCEHR(300000, 'single');
    expect(cehr).toBeCloseTo(1500, 2);
  });

  it('calculates 3% + 4% bands for single', () => {
    // RFI = 600,000:
    // 3% on (500,000 - 250,000) = 3% × 250,000 = 7,500
    // 4% on (600,000 - 500,000) = 4% × 100,000 = 4,000
    const cehr = calculateCEHR(600000, 'single');
    expect(cehr).toBeCloseTo(11500, 2);
  });

  it('calculates 3% band for couple', () => {
    // RFI = 700,000: 3% on (700,000 - 500,000) = 3% × 200,000 = 6,000
    const cehr = calculateCEHR(700000, 'couple');
    expect(cehr).toBeCloseTo(6000, 2);
  });

  it('calculates 3% + 4% bands for couple', () => {
    // RFI = 1,200,000:
    // 3% on (1,000,000 - 500,000) = 3% × 500,000 = 15,000
    // 4% on (1,200,000 - 1,000,000) = 4% × 200,000 = 8,000
    const cehr = calculateCEHR(1200000, 'couple');
    expect(cehr).toBeCloseTo(23000, 2);
  });

  it('returns 0 for exactly at threshold', () => {
    expect(calculateCEHR(250000, 'single')).toBe(0);
    expect(calculateCEHR(500000, 'couple')).toBe(0);
  });
});

describe('calculateCDHR', () => {
  it('returns 0 below the single threshold (250 k)', () => {
    expect(calculateCDHR(200000, 0, 'single')).toBe(0);
    expect(calculateCDHR(250000, 0, 'single')).toBe(0);
  });

  it('returns 0 below the couple threshold (500 k)', () => {
    expect(calculateCDHR(450000, 0, 'couple')).toBe(0);
    expect(calculateCDHR(500000, 0, 'couple')).toBe(0);
  });

  it('returns 0 when effective IR rate is already ≥ 20 % of adj. RFR', () => {
    // Adj. RFR = 400 k, adj. IR = 80 k (= 20 %) → no CDHR
    expect(calculateCDHR(400000, 80000, 'single')).toBe(0);
    expect(calculateCDHR(400000, 100000, 'single')).toBe(0);
  });

  it('lifts a 12.8 % effective IR (PFU) up to 20 %', () => {
    // Single, adj. RFR = 400 k, adj. IR = 51.2 k (= 12.8 %)
    // CDHR = 20 % × 400 k − 51.2 k = 80 k − 51.2 k = 28.8 k
    const cdhr = calculateCDHR(400000, 51200, 'single');
    expect(cdhr).toBeCloseTo(28800, 2);
  });

  it('applies to couples once adj. RFR > 500 k', () => {
    // Couple, adj. RFR = 800 k, adj. IR = 100 k (= 12.5 %)
    // Target = 160 k → CDHR = 60 k
    const cdhr = calculateCDHR(800000, 100000, 'couple');
    expect(cdhr).toBeCloseTo(60000, 2);
  });

  // Décote (CGI 224 III 5°). Worked example reproduced from
  // jpchatelainavocat.fr "Eléments de calcul de la CDHR" §3.5:
  //   Single, RFR retraité = 310 000 €, threshold low = 250 000 €
  //   ⇒ imposition retenue = 82,5 % × 60 000 = 49 500 €
  it('applies the décote between 250 k and 330 k (single)', () => {
    // RFR = 310 k, IR = 35 k → CDHR due = 49 500 − 35 000 = 14 500
    expect(calculateCDHR(310000, 35000, 'single')).toBeCloseTo(14500, 2);
    // RFR = 310 k, IR = 50 k → CDHR due = 0 (IR ≥ 49 500)
    expect(calculateCDHR(310000, 50000, 'single')).toBe(0);
    // RFR = 310 k, IR = 45 k → CDHR due = 49 500 − 45 000 = 4 500
    expect(calculateCDHR(310000, 45000, 'single')).toBeCloseTo(4500, 2);
  });

  it('décote ramps from 0 at 250 k to 66 k at 330 k (single, no IR)', () => {
    // At threshold_low: target = 0
    expect(calculateCDHR(250001, 0, 'single')).toBeCloseTo(0.825, 4);
    // At threshold_high: target = 82,5 % × 80 000 = 66 000 = 20 % × 330 000
    expect(calculateCDHR(330000, 0, 'single')).toBeCloseTo(66000, 2);
    // Just above threshold_high: headline 20 % rule kicks in
    expect(calculateCDHR(330001, 0, 'single')).toBeCloseTo(66000.2, 2);
  });

  it('applies the décote between 500 k and 660 k (couple)', () => {
    // RFR = 600 k, IR = 50 k → target = 82,5 % × 100 000 = 82 500
    //                          CDHR = 82 500 − 50 000 = 32 500
    expect(calculateCDHR(600000, 50000, 'couple')).toBeCloseTo(32500, 2);
    // At couple threshold_high: target = 82,5 % × 160 000 = 132 000 = 20 % × 660 000
    expect(calculateCDHR(660000, 0, 'couple')).toBeCloseTo(132000, 2);
  });
});

describe('getTaxConfig', () => {
  it('returns 2024 config for fiscal year 2024', () => {
    const config = getTaxConfig(2024);
    expect(config.brackets[0].limit).toBe(11294);
    expect(config.psPatrimoine).toBe(0.172);
    expect(config.csgDeductible).toBe(0.068);
  });

  it('returns 2025 config with updated brackets and retroactive PS', () => {
    const config = getTaxConfig(2025);
    expect(config.brackets[0].limit).toBe(11600);
    expect(config.psPatrimoine).toBe(0.186); // retroactive CSG increase
  });

  it('keeps dividends 2025 at 17,2 % PS / 30 % PFU (KPMG p. 33, fait générateur rule)', () => {
    const config = getTaxConfig(2025);
    expect(config.psDividends).toBe(0.172);
    expect(config.pfuDividendsTotalRate).toBe(0.300);
    expect(config.csgDeductibleDividends).toBe(0.068);
  });

  it('returns 2026 config with updated CSG', () => {
    const config = getTaxConfig(2026);
    expect(config.psPatrimoine).toBe(0.186);
    expect(config.csgDeductible).toBe(0.068);
    expect(config.pfuTotalRate).toBe(0.314);
  });

  it('aligns dividends 2026 on the post-LFSS-2026 rates (18,6 % PS / 31,4 % PFU)', () => {
    const config = getTaxConfig(2026);
    expect(config.psDividends).toBe(0.186);
    expect(config.pfuDividendsTotalRate).toBe(0.314);
    expect(config.csgDeductibleDividends).toBe(0.068);
  });

  // --- Garde-fous LFSS 2026 : ce que la hausse de CSG n'a PAS changé ---
  // La LFSS 2026 (loi n° 2025-1403 du 30/12/2025, art. 12) ne modifie que le
  // 2° du I de l'article L. 136-8 du CSS. Deux taux voisins ont été dérivés à
  // tort de cette hausse ; ces tests verrouillent leur valeur légale.

  it('garde la CSG déductible à 6,8 points malgré la CSG portée à 10,6 % (CGI art. 154 quinquies)', () => {
    // L'article 154 quinquies n'a été modifié ni par la LFSS 2026 ni par la
    // LF 2026 : le supplément de 1,4 point n'est pas déductible (BOSS, Q/R
    // « CSG sur les revenus du capital »). 6,8 n'est donc PAS 18,6 − 10,4.
    for (const year of [2024, 2025, 2026]) {
      expect(getTaxConfig(year).csgDeductible).toBe(0.068);
      expect(getTaxConfig(year).csgDeductibleDividends).toBe(0.068);
    }
  });

  it("ne fait pas varier les PS sur revenus d'activité avec la LFSS 2026 (CSS art. L. 136-8, I, 1°)", () => {
    // Le 1° du I (CSG sur revenus d'activité) reste à 9,2 % : PS = 9,2 + 0,5.
    // Concerne la fraction > 300 k€ des AGA Macron et les gains pré-Macron.
    for (const year of [2024, 2025, 2026]) {
      expect(getTaxConfig(year).psActivite).toBe(0.097);
    }
  });

  it('falls back to latest config for future years', () => {
    const config = getTaxConfig(2030);
    expect(config).toEqual(getTaxConfig(2026));
  });

  it('falls back to earliest config for past years', () => {
    const config = getTaxConfig(2020);
    expect(config).toEqual(getTaxConfig(2024));
  });

  it('reports whether the requested year is actually covered', () => {    expect(resolveTaxYear(2025)).toEqual({ covered: true, appliedYear: 2025 });
    expect(resolveTaxYear(LATEST_TAX_YEAR + 1)).toEqual({ covered: false, appliedYear: LATEST_TAX_YEAR });
    expect(resolveTaxYear(FIRST_TAX_YEAR - 1)).toEqual({ covered: false, appliedYear: FIRST_TAX_YEAR });
  });

  it('uses config in calculateProgressiveTax', () => {
    const config2024 = getTaxConfig(2024);
    const config2025 = getTaxConfig(2025);
    // 2025 has higher 0% bracket (11497 vs 11294), so less tax for same income
    const tax2024 = calculateProgressiveTax(20000, 1, config2024);
    const tax2025 = calculateProgressiveTax(20000, 1, config2025);
    expect(tax2025).toBeLessThan(tax2024);
  });
});

describe('TAX_RATE_SOURCES', () => {
  it('documente la provenance de chaque champ de TaxConfig', () => {
    // La complétude est déjà garantie à la compilation par le type
    // Record<keyof TaxConfig, RateSource> ; ce test protège le contenu.
    const config = getTaxConfig(LATEST_TAX_YEAR);
    for (const key of Object.keys(config)) {
      const source = TAX_RATE_SOURCES[key as keyof typeof TAX_RATE_SOURCES];
      expect(source, `aucune source déclarée pour ${key}`).toBeDefined();
      expect(source.reference.length).toBeGreaterThan(0);
      expect(source.label.length).toBeGreaterThan(0);
      expect(source.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('cite le texte lu pour les taux touchés par la LFSS 2026', () => {
    expect(TAX_RATE_SOURCES.csgDeductible.reference).toContain('154 quinquies');
    expect(TAX_RATE_SOURCES.csgDeductible.url).toContain('legifrance');
    expect(TAX_RATE_SOURCES.psActivite.reference).toContain('L. 136-8');
    expect(TAX_RATE_SOURCES.psPatrimoine.reference).toContain('L. 136-8');
  });

  it('ne laisse pas la date affichée dépasser la vérification la plus ancienne', () => {
    // Un seul taux périmé doit tirer la date globale vers le bas : c'est ce
    // qui manquait quand la constante était écrite à la main.
    const oldest = Object.values(TAX_RATE_SOURCES)
      .map((s) => s.verifiedOn)
      .sort()[0];
    expect(TAX_RATES_VERIFIED_ON).toBe(oldest);
    expect(TAX_DATA_VERIFIED_ON <= TAX_RATES_VERIFIED_ON).toBe(true);
    expect(TAX_DATA_VERIFIED_ON <= TAX_FORMS_VERIFIED_ON).toBe(true);
  });
});
