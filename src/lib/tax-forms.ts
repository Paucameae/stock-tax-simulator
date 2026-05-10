/**
 * Source of truth for French tax form references (2042, 2042-C, 2074).
 *
 * RULE: Any tax case code (e.g. "1TZ", "3VG") or 2074 line number (e.g. "514", "520")
 * displayed in the UI or in the exported declaration text MUST come from this file.
 *
 * When updating, cross-check with impots.gouv.fr and note the verification date.
 * Last verified against impots.gouv.fr: 2026-05-10 (revenus 2025).
 */

export interface TaxCase {
  /** Code de la case telle qu'elle apparaît sur le formulaire officiel. */
  code: string;
  /** Libellé court à afficher à côté du code. */
  label: string;
  /** Formulaire d'origine. */
  form: '2042' | '2042-C' | '2074';
}

/** Formulaire 2042 — déclaration principale (plus-values mobilières). */
export const FORM_2042 = {
  case3VG: { code: '3VG', label: 'Plus-value nette de cession', form: '2042' },
  case3VH: { code: '3VH', label: 'Moins-value nette', form: '2042' },
  case3SG: { code: '3SG', label: 'Abattement de droit commun', form: '2042' },
  option2OP: { code: '2OP', label: 'Option barème progressif', form: '2042' },
} as const satisfies Record<string, TaxCase>;

/**
 * Formulaire 2042-C — déclaration complémentaire (gains d'acquisition AGA Macron post-2015).
 *
 * ⚠️ Ne PAS confondre 1UZ (abattement 50% AGA Macron) avec 1WZ
 * (abattement fixe 500 000 € dirigeant partant en retraite, art. 150-0 D ter — cas totalement différent).
 */
export const FORM_2042C_AGA_MACRON = {
  case1TZ: { code: '1TZ', label: "Gain d'acquisition AGA (≤ 300k€, après abattement 50%)", form: '2042-C' },
  case1UZ: { code: '1UZ', label: 'Abattement 50% appliqué', form: '2042-C' },
  case1TT: { code: '1TT', label: "Gain d'acquisition AGA (fraction > 300k€)", form: '2042-C' },
} as const satisfies Record<string, TaxCase>;

/** Ligne du cadre 510 du formulaire 2074. */
export interface Form2074Line {
  /** Numéro de ligne tel qu'il apparaît dans le cadre 510. */
  line: string;
  /** Libellé court de la ligne. */
  label: string;
  /** Formule de calcul officielle, le cas échéant. */
  formula?: string;
}

/**
 * Formulaire 2074 — cadre 510 « Plus-values ou moins-values déterminées par vous-même ».
 *
 * Ordre & formules conformes à la notice 2074 (cf. impots.gouv.fr).
 */
export const FORM_2074_CADRE_510 = {
  designation:    { line: '511', label: 'Désignation des titres et des intermédiaires financiers' },
  saleDate:       { line: '512', label: 'Date de la cession ou du rachat' },
  unitSalePrice:  { line: '514', label: 'Valeur unitaire de cession' },
  quantity:       { line: '515', label: 'Nombre de titres cédés' },
  totalSale:      { line: '516', label: 'Montant global de cession', formula: '514 × 515' },
  saleFees:       { line: '517', label: 'Frais de cession' },
  netSale:        { line: '518', label: 'Prix de cession net', formula: '516 − 517' },
  unitAcqPrice:   { line: '520', label: "Prix ou valeur d'acquisition unitaire" },
  totalAcqPrice:  { line: '521', label: "Prix d'acquisition global", formula: '520 × 515' },
  acqFees:        { line: '522', label: "Frais d'acquisition" },
  costBasis:      { line: '523', label: 'Prix de revient', formula: '521 + 522' },
  result:         { line: '524', label: 'Résultat (PV/MV)', formula: '518 − 523' },
} as const satisfies Record<string, Form2074Line>;
