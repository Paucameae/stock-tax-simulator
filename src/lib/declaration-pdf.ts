import type {
  AppSettings,
  DeclarationData,
  Form2074Line,
  TaxSimulationResult,
} from './types';
import type { PdfBlock, PdfDocument, PdfField } from './pdf-writer';
import { FORM_2042, FORM_2042C_AGA_MACRON, FORM_2074_CADRE_510, TAX_DATA_VERIFIED_ON } from './tax-forms';
import { resolveTaxYear } from './tax-rates';
import { formatEUR, formatPercent } from './utils';

export interface DeclarationPdfInput {
  declaration: DeclarationData;
  result: TaxSimulationResult;
  settings: AppSettings;
  /** Cadre 510 lines as displayed, i.e. grouped or not depending on the toggle. */
  lines: Form2074Line[];
  grouped: boolean;
  /** Injectable so tests and snapshots stay stable. */
  generatedAt?: Date;
}

const FAMILY_LABELS: Record<AppSettings['familyStatus'], string> = {
  single: 'Célibataire',
  couple: 'Couple (marié / pacsé)',
};

function formatStamp(date: Date): string {
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function field(label: string, value: string, strong = false): PdfField {
  return { label, value, strong };
}

function caseField(code: string, label: string, value: string): PdfField {
  return { label: `Case ${code} — ${label}`, value, strong: true };
}

function parametersBlocks(settings: AppSettings, result: TaxSimulationResult, fiscalYear: number): PdfBlock[] {
  const { covered, appliedYear } = resolveTaxYear(fiscalYear);
  const rows: PdfField[] = [
    field('Année fiscale (année de la vente)', String(fiscalYear)),
    field('Situation familiale', FAMILY_LABELS[settings.familyStatus]),
    field('Nombre d’enfants à charge', String(settings.numberOfChildren)),
    field(
      `Parts fiscales${settings.taxSharesManual ? ' (saisie manuelle)' : ''}`,
      settings.taxShares.toLocaleString('fr-FR')
    ),
    field('Autres revenus imposables du foyer', formatEUR(settings.otherTaxableIncome)),
    field('Moins-values antérieures reportables', formatEUR(settings.priorLosses)),
    field(
      'Régime d’imposition retenu',
      result.taxMode === 'pfu' ? 'PFU (flat tax 30 %)' : 'Barème progressif (option 2OP)'
    ),
  ];

  const blocks: PdfBlock[] = [{ kind: 'heading', text: 'Paramètres de calcul' }, { kind: 'fields', rows }];
  if (!covered) {
    blocks.push({
      kind: 'paragraph',
      muted: true,
      text:
        `Aucun barème officiel n’est publié pour ${fiscalYear} : le calcul reprend le barème ${appliedYear}, ` +
        `dernier barème vérifié le ${TAX_DATA_VERIFIED_ON}. Les montants sont donc indicatifs.`,
    });
  }
  return blocks;
}

function calculationBlocks(result: TaxSimulationResult): PdfBlock[] {
  const acq = result.acquisitionGainTax;
  const cap = result.capitalGainTax;
  const rows: PdfField[] = [
    field('Produit brut de la vente', formatEUR(result.totalProceeds)),
    field('Gain d’acquisition (AGA / ESPP)', formatEUR(result.totalAcquisitionGain)),
    field('Plus-value de cession', formatEUR(result.totalCapitalGain)),
  ];

  if (result.totalAcquisitionGain > 0) {
    if (acq.abatement50 > 0) rows.push(field('dont abattement 50 % appliqué', formatEUR(acq.abatement50)));
    if (acq.irBelow > 0) rows.push(field('IR sur gain d’acquisition (≤ 300 k€)', formatEUR(acq.irBelow)));
    if (acq.irAbove > 0) rows.push(field('IR sur gain d’acquisition (> 300 k€)', formatEUR(acq.irAbove)));
    if (acq.psBelow > 0) rows.push(field('PS sur gain d’acquisition (≤ 300 k€)', formatEUR(acq.psBelow)));
    if (acq.psAbove > 0) rows.push(field('PS sur gain d’acquisition (> 300 k€)', formatEUR(acq.psAbove)));
    if (acq.salaryContribution > 0) rows.push(field('Contribution salariale', formatEUR(acq.salaryContribution)));
    rows.push(field('Sous-total gain d’acquisition', formatEUR(acq.total), true));
  }

  if (cap.netGain > 0) {
    if (cap.holdingAbatement > 0)
      rows.push(field('dont abattement pour durée de détention', formatEUR(cap.holdingAbatement)));
    rows.push(field('IR sur plus-value de cession', formatEUR(cap.ir)));
    rows.push(field('PS sur plus-value de cession', formatEUR(cap.ps)));
    rows.push(field('Sous-total plus-value de cession', formatEUR(cap.total), true));
  }
  if (cap.netLoss > 0) rows.push(field('Moins-value reportable (10 ans)', formatEUR(cap.netLoss)));
  if (result.cehr > 0) rows.push(field('Contribution exceptionnelle hauts revenus (CEHR)', formatEUR(result.cehr)));
  if (result.cdhr > 0) rows.push(field('Contribution différentielle hauts revenus (CDHR)', formatEUR(result.cdhr)));

  rows.push(field('Total impôts et prélèvements', formatEUR(result.totalTax), true));
  rows.push(field('Montant net estimé', formatEUR(result.netAmount), true));
  rows.push(field('Taux d’imposition effectif', formatPercent(result.effectiveTaxRate)));

  return [{ kind: 'heading', text: 'Résultat du calcul' }, { kind: 'fields', rows }];
}

function caseBlocks(data: DeclarationData): PdfBlock[] {
  const blocks: PdfBlock[] = [{ kind: 'heading', text: 'Cases à reporter — formulaire 2042' }];

  const main: PdfField[] = [];
  if (data.case3VG > 0) main.push(caseField(FORM_2042.case3VG.code, FORM_2042.case3VG.label, formatEUR(data.case3VG)));
  if (data.case3VH > 0) main.push(caseField(FORM_2042.case3VH.code, FORM_2042.case3VH.label, formatEUR(data.case3VH)));
  if (data.case3SG > 0) main.push(caseField(FORM_2042.case3SG.code, FORM_2042.case3SG.label, formatEUR(data.case3SG)));
  main.push(
    caseField(FORM_2042.option2OP.code, FORM_2042.option2OP.label, data.option2OP ? 'À cocher' : 'Ne pas cocher')
  );
  blocks.push({ kind: 'fields', rows: main });

  if (data.case1TZ > 0 || data.case1UZ > 0 || data.case1TT > 0) {
    const complementary: PdfField[] = [];
    const C = FORM_2042C_AGA_MACRON;
    if (data.case1TZ > 0) complementary.push(caseField(C.case1TZ.code, C.case1TZ.label, formatEUR(data.case1TZ)));
    if (data.case1UZ > 0) complementary.push(caseField(C.case1UZ.code, C.case1UZ.label, formatEUR(data.case1UZ)));
    if (data.case1TT > 0) complementary.push(caseField(C.case1TT.code, C.case1TT.label, formatEUR(data.case1TT)));
    blocks.push({ kind: 'heading', text: 'Cases à reporter — formulaire 2042-C' });
    blocks.push({ kind: 'fields', rows: complementary });
  }

  const social: PdfField[] = [];
  const ps = data.psDetails;
  if (ps.pvCessionPS > 0) social.push(field('PS sur plus-value de cession', formatEUR(ps.pvCessionPS)));
  if (ps.acquisitionGainPSBelow > 0)
    social.push(field('PS sur gain d’acquisition (≤ 300 k€)', formatEUR(ps.acquisitionGainPSBelow)));
  if (ps.acquisitionGainPSAbove > 0)
    social.push(field('PS sur gain d’acquisition (> 300 k€)', formatEUR(ps.acquisitionGainPSAbove)));
  social.push(field('Total prélèvements sociaux', formatEUR(ps.total), true));
  blocks.push({ kind: 'heading', text: 'Prélèvements sociaux' }, { kind: 'fields', rows: social });

  return blocks;
}

function form2074Blocks(data: DeclarationData, lines: Form2074Line[], grouped: boolean): PdfBlock[] {
  const F = FORM_2074_CADRE_510;
  const blocks: PdfBlock[] = [
    { kind: 'heading', text: 'Annexe 2074 — cadre 510' },
    {
      kind: 'paragraph',
      muted: true,
      text:
        `${lines.length} ligne(s)${grouped ? ', lignes identiques regroupées' : ''}. ` +
        `La ligne ${F.costBasis.line} (prix de revient) est calculée automatiquement sur impots.gouv.fr ` +
        `(${F.totalAcqPrice.line} + ${F.acqFees.line}) ; les frais ${F.saleFees.line} et ${F.acqFees.line} sont nuls pour MSFT.`,
    },
    {
      kind: 'table',
      columns: [
        { header: `Date (${F.saleDate.line})`, width: 12 },
        { header: `Titres (${F.designation.line})`, width: 16 },
        { header: `Nb (${F.quantity.line})`, width: 7, align: 'right' },
        { header: `PU vente (${F.unitSalePrice.line})`, width: 13, align: 'right' },
        { header: `Cession (${F.totalSale.line})`, width: 13, align: 'right' },
        { header: `PU acq. (${F.unitAcqPrice.line})`, width: 13, align: 'right' },
        { header: `Acq. (${F.totalAcqPrice.line})`, width: 13, align: 'right' },
        { header: `PV/MV (${F.result.line})`, width: 13, align: 'right' },
      ],
      rows: lines.map((line) => [
        line.date,
        line.origin,
        String(line.quantity),
        formatEUR(line.salePrice),
        formatEUR(line.quantity * line.salePrice),
        formatEUR(line.costBasis),
        formatEUR(line.quantity * line.costBasis),
        formatEUR(line.gainLoss),
      ]),
    },
  ];

  if (data.case3SG > 0) {
    blocks.push({
      kind: 'paragraph',
      text:
        `Abattement pour durée de détention de ${formatEUR(data.case3SG)} appliqué : compléter l’annexe 2074-ABT ` +
        `et reporter le montant en case ${FORM_2042.case3SG.code}.`,
    });
  }
  if (data.case3VH > 0) {
    blocks.push({
      kind: 'paragraph',
      text:
        `Moins-value globale de ${formatEUR(data.case3VH)} : à inscrire également au cadre 11 de la 2074 ` +
        `(suivi des moins-values reportables sur 10 ans, ligne ${data.fiscalYear}).`,
    });
  }
  return blocks;
}

function reminderBlocks(data: DeclarationData): PdfBlock[] {
  const reminders: string[] = [
    'Le gain d’acquisition n’est imposé que l’année de la vente des actions, pas au moment du vesting.',
  ];
  if (data.deductibleCSGNextYear > 0) {
    reminders.push(
      `La CSG déductible de ${formatEUR(data.deductibleCSGNextYear)} sera à reporter en case 6DE de la déclaration ` +
        `des revenus ${data.fiscalYear + 1}.`
    );
  }
  if (data.deductibleCSGSalaryNextYear > 0) {
    reminders.push(
      `La CSG de ${formatEUR(data.deductibleCSGSalaryNextYear)} assise sur la fraction imposée en traitements et ` +
        `salaires se déduit de ce revenu catégoriel en ${data.fiscalYear + 1}, et non en case 6DE.`
    );
  }
  if (data.case3VH > 0) {
    reminders.push(`La moins-value de ${formatEUR(data.case3VH)} est reportable pendant 10 ans.`);
  }
  if (data.case3VH > 0 && (data.case1TZ > 0 || data.case1TT > 0)) {
    reminders.push(
      'La moins-value sur les actions AGA qualifiées a déjà été imputée sur le gain d’acquisition des mêmes actions ' +
        '(art. 80 quaterdecies I bis du CGI). La moins-value résiduelle en case 3VH provient d’autres lots ' +
        '(non qualifiés / ESPP) et n’est pas imputable sur 1TZ/1TT.'
    );
  }

  return [
    { kind: 'heading', text: 'Rappels' },
    ...reminders.map((text): PdfBlock => ({ kind: 'paragraph', text: `• ${text}` })),
  ];
}

/** Assembles the archival declaration document from a completed simulation. */
export function buildDeclarationPdfDocument(input: DeclarationPdfInput): PdfDocument {
  const { declaration, result, settings, lines, grouped } = input;
  const generatedAt = input.generatedAt ?? new Date();

  return {
    title: `Déclaration des revenus ${declaration.fiscalYear} — actions Microsoft`,
    subtitle:
      `Récapitulatif généré le ${formatStamp(generatedAt)} par le simulateur fiscal. ` +
      `Barèmes vérifiés le ${TAX_DATA_VERIFIED_ON}. Document indicatif, à conserver comme pièce justificative : ` +
      `il ne constitue pas un conseil fiscal et ne remplace pas la déclaration officielle.`,
    footer: `Déclaration ${declaration.fiscalYear} — généré le ${formatStamp(generatedAt)}`,
    createdAt: generatedAt,
    blocks: [
      ...parametersBlocks(settings, result, declaration.fiscalYear),
      ...calculationBlocks(result),
      ...caseBlocks(declaration),
      ...form2074Blocks(declaration, lines, grouped),
      ...reminderBlocks(declaration),
    ],
  };
}

/** `declaration-2025-20260510-1432.pdf` — the timestamp makes archived copies self-ordering. */
export function declarationPdfFilename(fiscalYear: number, generatedAt = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${generatedAt.getFullYear()}${pad(generatedAt.getMonth() + 1)}${pad(generatedAt.getDate())}` +
    `-${pad(generatedAt.getHours())}${pad(generatedAt.getMinutes())}`;
  return `declaration-${fiscalYear}-${stamp}.pdf`;
}
