import type { DividendEvent, CashInterestEvent } from './transaction-parser';

/** A dividend event enriched with EUR amounts at the ECB rate of the payment date. */
export interface DividendEventEur extends DividendEvent {
  grossEur: number;
  taxWithheldEur: number;
  netEur: number;
  eurUsdRate: number;
}

export interface DividendYearSummary {
  year: number;
  grossUsd: number;
  taxWithheldUsd: number;
  netUsd: number;
  grossEur: number;
  taxWithheldEur: number;
  netEur: number;
  /** Number of payment events in the year. */
  count: number;
  events: DividendEventEur[];
}

/**
 * Enrich dividend events with EUR amounts using provided ECB rates.
 * `rates` is a map "YYYY-MM-DD" -> EUR/USD rate (1 EUR = rate USD).
 */
export function enrichDividendsWithEur(
  events: DividendEvent[],
  rates: Record<string, number>,
): { enriched: DividendEventEur[]; missingDates: string[] } {
  const missingDates: string[] = [];
  const enriched: DividendEventEur[] = [];
  for (const ev of events) {
    const key = formatKey(ev.date);
    const rate = rates[key];
    if (!rate || !Number.isFinite(rate) || rate <= 0) {
      missingDates.push(key);
      continue;
    }
    enriched.push({
      ...ev,
      eurUsdRate: rate,
      grossEur: round2(ev.grossUsd / rate),
      taxWithheldEur: round2(ev.taxWithheldUsd / rate),
      netEur: round2(ev.netUsd / rate),
    });
  }
  return { enriched, missingDates };
}

/** Group enriched dividend events by calendar year, sorted ascending. */
export function groupDividendsByYear(events: DividendEventEur[]): DividendYearSummary[] {
  const byYear = new Map<number, DividendEventEur[]>();
  for (const ev of events) {
    const y = ev.date.getFullYear();
    const arr = byYear.get(y);
    if (arr) arr.push(ev);
    else byYear.set(y, [ev]);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, evs]) => ({
      year,
      count: evs.length,
      grossUsd: round2(sum(evs.map((e) => e.grossUsd))),
      taxWithheldUsd: round2(sum(evs.map((e) => e.taxWithheldUsd))),
      netUsd: round2(sum(evs.map((e) => e.netUsd))),
      grossEur: round2(sum(evs.map((e) => e.grossEur))),
      taxWithheldEur: round2(sum(evs.map((e) => e.taxWithheldEur))),
      netEur: round2(sum(evs.map((e) => e.netEur))),
      events: evs,
    }));
}

/**
 * French tax declaration lines for a given year's dividends.
 * See: https://www.impots.gouv.fr (formulaire 2042 / 2047)
 *
 *   2DC = dividendes bruts (avant retenue à la source US)
 *   2AB = crédit d'impôt = retenue US, utilisable contre l'IR français
 *   2BH = montant éligible à l'abattement de 40 % si option barème
 *         (= 2DC pour dividendes US conventionnels éligibles)
 */
export interface DividendDeclarationLines {
  year: number;
  box2DC: number;
  box2AB: number;
  box2BH: number;
}

export function buildDeclarationLines(summary: DividendYearSummary): DividendDeclarationLines {
  return {
    year: summary.year,
    box2DC: summary.grossEur,
    box2AB: summary.taxWithheldEur,
    box2BH: summary.grossEur,
  };
}

export function totalCashInterestUsd(events: CashInterestEvent[]): number {
  return round2(sum(events.map((e) => e.amountUsd)));
}

function formatKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sum(arr: number[]): number {
  return arr.reduce((s, n) => s + n, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
