import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
