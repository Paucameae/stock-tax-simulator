import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { QualificationReason, StockOrigin } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * True when the lot looks like shares received from a reinvested dividend
 * (DRIP). Vests of any plan (DO / FM / FQ) always come in whole shares, so
 * a fractional quantity on a vest-origin lot is the unambiguous signature
 * of a DRIP.
 *
 * ESPP-tagged lots (origin SP) can legitimately be fractional too (the
 * quantity = contribution / discounted price), so we don't auto-detect on
 * SP — the user can opt in via the bulk-qualify panel if a particular SP
 * lot is actually a mislabelled DRIP.
 *
 * Tolerance: treat anything within 1e-6 of an integer as a whole share to
 * absorb floating-point rounding from CSV/XLSX parsers.
 */
export function isLikelyReinvestedDividend(origin: StockOrigin, quantity: number): boolean {
  if (origin === 'SP') return false;
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  return Math.abs(quantity - Math.round(quantity)) > 1e-6;
}

/**
 * Human-readable explanation of why a lot carries its current
 * (origin, planType). Used as the title of the origin badge so users can
 * understand a classification at a glance.
 */
export function qualificationReasonLabel(reason: QualificationReason | undefined): string {
  switch (reason) {
    case 'broker_default':
      return 'Valeur par défaut du courtier (aucune information de plan dans le relevé).';
    case 'broker_plan_name':
      return 'Origine déduite du libellé du plan transmis par le courtier.';
    case 'reconciled_unique':
      return 'Rapproché avec un grant Microsoft StockExport identifié sans ambiguïté (un seul plan vestait à cette date).';
    case 'reconciled_by_quantity':
      return 'Rapproché avec un grant Microsoft StockExport ; ambiguïté de date levée par le nombre net d\u2019actions livrées.';
    case 'reconciled_by_agreement':
      return 'Rapproché avec plusieurs grants Microsoft StockExport candidats partageant la même classification fiscale.';
    case 'nq_via_withholding':
      return 'Reclassé en plan non qualifié grâce à la retenue d\u2019actions pour impôt observée sur l\u2019export Microsoft (signature d\u2019un Stock Award).';
    case 'manual':
      return 'Choix manuel via le menu déroulant sur cette ligne.';
    case 'bulk_qualify':
      return 'Choix appliqué via le panneau de qualification en lot.';
    case undefined:
      return 'Origine et régime non documentés (importation antérieure à la traçabilité, ou source inconnue).';
  }
}

/**
 * True when a lot is marked as a reinvested dividend (DRIP) but carries a
 * qualified plan type — fiscally inconsistent (a DRIP cannot bénéficier of
 * the AGA Macron / pré-Macron favorable regime). Pure check; surfaced as a
 * UI warning by the lot tables.
 */
export function isDripQualifiedInconsistent(lot: {
  isReinvestedDividend?: boolean;
  planType: string;
}): boolean {
  if (!lot.isReinvestedDividend) return false;
  return lot.planType === 'qualified_macron' || lot.planType === 'qualified_pre_macron';
}

export function formatEUR(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}

export function formatPercent(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + ' %';
}

export function originLabel(origin: string): string {
  const labels: Record<string, string> = {
    SP: 'ESPP',
    DO: 'Stock Award',
    FM: 'AGA Macron',
    FQ: 'AGA pré-Macron',
  };
  return labels[origin] || origin;
}

export function planTypeLabel(planType: string): string {
  const labels: Record<string, string> = {
    qualified_macron: 'Qualifié (Macron)',
    qualified_pre_macron: 'Qualifié (pré-Macron)',
    non_qualified: 'Non qualifié',
  };
  return labels[planType] || planType;
}

export function brokerLabel(broker: string): string {
  const labels: Record<string, string> = {
    fidelity: 'Fidelity',
    morgan_stanley: 'Morgan Stanley',
  };
  return labels[broker] || broker;
}

/**
 * Tailwind class fragment to style a broker badge. Colours are stable per
 * broker so users can quickly distinguish lots/sales coming from each source.
 */
export function brokerBadgeClass(broker: string): string {
  const map: Record<string, string> = {
    fidelity: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    morgan_stanley: 'bg-sky-50 text-sky-700 border-sky-200',
  };
  return map[broker] || 'bg-gray-50 text-gray-700 border-gray-200';
}

/**
 * Replace one broker's slice of a broker-tagged list while preserving the
 * others. Used by import handlers so that re-importing data from one
 * courtier never wipes the data already loaded from another courtier.
 *
 * The broker is inferred from the first incoming item; callers must guard
 * against an empty `incoming` array (typically by skipping the call), since
 * we cannot tell which slice to replace otherwise.
 */
export function mergeByBroker<T extends { broker: string }>(
  prev: T[],
  incoming: T[],
): T[] {
  if (incoming.length === 0) return prev;
  const broker = incoming[0].broker;
  return [...prev.filter((x) => x.broker !== broker), ...incoming];
}

export function formatDate(date: Date | undefined): string {
  if (!date) return '—';
  return date.toLocaleDateString('fr-FR');
}

export function formatUSD(value: number): string {
  return '$' + value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}
