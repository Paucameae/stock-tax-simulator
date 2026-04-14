import { describe, it, expect, vi } from 'vitest';

// Mock pdfjs-dist before importing the parser (it has top-level side effects)
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
}));

import { parseTaxNotice } from '../tax-notice-parser';

// Excerpt from a real impots.gouv.fr avis d'imposition (anonymized values)
const REAL_AVIS_TEXT = `
Impôt sur les revenus de 2024
108 989
2,75
Déclarant 1 - Nom de naissance : DOE JEAN
Déclarant 2 - Nom de naissance : DOE MARIE
O
1   1   2,75
Détail des revenus Déclar. 1 Déclar. 2 Total
Salaires.................................................................. 96111 24179
Total des salaires et assimilés   ............................. 96111 24179
Déduction 10% ou frais réels................................. -   9611 -   2418
Salaires, pensions, rentes nets.............................. 86500 21761 108261
Revenu brut global.............................................. 108261
CSG déductible...................................................... -   0
Total des charges déduites   ............................. -   7780
Revenu imposable............................................... 100481
Revenus au taux forfaitaire.................................... Taux 12,8% Montant 8
Forfait scolarité : Nombre d'enfants....................... 1 1
Revenu fiscal de référence   .............................. 108989
`;

describe('parseTaxNotice – real avis format', () => {
  const result = parseTaxNotice(REAL_AVIS_TEXT);

  it('extracts fiscal year', () => {
    expect(result.fiscalYear).toBe(2024);
  });

  it('detects couple status from Déclarant 2', () => {
    expect(result.familyStatus).toBe('couple');
  });

  it('extracts tax shares', () => {
    expect(result.taxShares).toBe(2.75);
  });

  it('extracts revenu brut global', () => {
    expect(result.revenuBrutGlobal).toBe(108261);
  });

  it('extracts revenu imposable', () => {
    expect(result.revenuImposable).toBe(100481);
  });

  it('extracts revenu fiscal de référence', () => {
    expect(result.revenuFiscalReference).toBe(108989);
  });

  it('extracts number of children from forfait scolarité', () => {
    expect(result.numberOfChildren).toBe(1);
  });
});

describe('parseTaxNotice – classic format (spaces/colons)', () => {
  const CLASSIC_TEXT = `
IMPÔT SUR LES REVENUS DE L'ANNÉE 2023
Situation de famille : M
Nombre de parts : 3,00
Nombre de personnes à charge : 2
Revenu brut global : 95 000
Revenu imposable : 85 500
Revenu fiscal de référence : 87 200
`;

  const result = parseTaxNotice(CLASSIC_TEXT);

  it('extracts fiscal year', () => {
    expect(result.fiscalYear).toBe(2023);
  });

  it('detects couple from M', () => {
    expect(result.familyStatus).toBe('couple');
  });

  it('extracts tax shares', () => {
    expect(result.taxShares).toBe(3);
  });

  it('extracts number of children', () => {
    expect(result.numberOfChildren).toBe(2);
  });

  it('extracts revenu brut global', () => {
    expect(result.revenuBrutGlobal).toBe(95000);
  });

  it('extracts revenu imposable', () => {
    expect(result.revenuImposable).toBe(85500);
  });

  it('extracts revenu fiscal de référence', () => {
    expect(result.revenuFiscalReference).toBe(87200);
  });
});

describe('parseTaxNotice – single filer', () => {
  const SINGLE_TEXT = `
Impôt sur les revenus de 2024
Déclarant 1 - Nom de naissance : DOE JEAN
Célibataire
1,00
Détail des revenus Déclar. 1 Total
Revenu imposable............................................... 45000
Revenu fiscal de référence   .............................. 45000
`;

  const result = parseTaxNotice(SINGLE_TEXT);

  it('detects single status', () => {
    expect(result.familyStatus).toBe('single');
  });

  it('extracts tax shares for single', () => {
    expect(result.taxShares).toBe(1);
  });
});
