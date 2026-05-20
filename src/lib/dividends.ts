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
 * Cases de la déclaration française pour les dividendes de l'année.
 *
 * Codes officiels — cf. `src/lib/tax-forms.ts` (FORM_2042_DIVIDENDS), notice 2047
 * (revenus de source étrangère, p. 3 et 5) et KPMG Avocats « Obligations fiscales
 * Microsoft » (mai 2026, slides 38–44).
 *
 *   2DC = montant brut des dividendes (avant retenue à la source US).
 *   2CG = SI PFU → même montant que 2DC (ces revenus ont déjà supporté les PS via PFNL).
 *   2BH = SI option barème (case 2OP) → même montant que 2DC.
 *         ⚠️ 2BH et 2CG sont mutuellement exclusifs : on ne renseigne que l'un des deux.
 *   2AB = crédit d'impôt sur valeurs étrangères. ⚠️ Réservé aux revenus
 *         **encaissés en France** via un dépositaire français qui a calculé
 *         le crédit (notice 2047, p. 3). Pour des dividendes encaissés à
 *         l'étranger (Fidelity US, Morgan Stanley US), on passe par la 2047
 *         et le crédit est porté en **8VL** : laisser 2AB à 0 pour éviter
 *         la double imputation du crédit d'impôt.
 *   2CK = PFNL trimestriel déjà versé via formulaires 2778-DIV (s'impute sur l'IR).
 *         0 si l'utilisateur a bénéficié de la dispense (RFR N-2 < 50k€ / 75k€).
 *   8VL = impôt payé à l'étranger ouvrant droit à crédit d'impôt, **plafonné
 *         à 15 % du montant brut** (taux conventionnel France–USA, notice 2047
 *         p. 5). Si le broker a retenu davantage (ex. W-8BEN non transmis →
 *         30 %), seuls 15 % sont récupérables côté français.
 *   8PL = revenus nets imposables étrangers **après abattement éventuel mais
 *         SANS déduction de l'impôt étranger** (libellé officiel cadre 2047).
 *         → PFU : 8PL = brut (pas d'abattement).
 *         → Barème : 8PL = brut × 60 % (abattement 40 % art. 158-3-2° CGI).
 *         ⚠️ NE PAS soustraire la retenue à la source US.
 */
export interface DividendDeclarationLines {
  year: number;
  taxMode: 'pfu' | 'bareme';
  box2DC: number;
  box2CG: number;
  box2BH: number;
  box2AB: number;
  box2CK: number;
  box8VL: number;
  box8PL: number;
}

export interface BuildDeclarationLinesOptions {
  /**
   * Mode d'imposition global (case 2OP). Par défaut PFU.
   * En cas d'option barème, l'option s'applique à TOUS les revenus mobiliers
   * (intérêts, dividendes, plus-values) du foyer.
   */
  taxMode?: 'pfu' | 'bareme';
  /**
   * Montant cumulé du PFNL trimestriel déjà versé en N via les 2778-DIV (case IL).
   * Laisser à 0 si vous bénéficiez de la dispense (RFR N-2 sous seuil) ou si vous
   * ne déposez pas les 2778-DIV.
   */
  pfnlAlreadyPaidEur?: number;
}

export function buildDeclarationLines(
  summary: DividendYearSummary,
  options: BuildDeclarationLinesOptions = {},
): DividendDeclarationLines {
  const taxMode = options.taxMode ?? 'pfu';
  const pfnl = round2(options.pfnlAlreadyPaidEur ?? 0);
  const gross = summary.grossEur;
  const tax = summary.taxWithheldEur;
  // Plafond conventionnel France–USA : crédit d'impôt limité à 15 % du brut
  // (notice 2047 p. 5, art. 24 §1 de la convention fiscale du 31/08/1994).
  // Si le broker a retenu plus (W-8BEN non transmis → 30 %), seul 15 %
  // est récupérable côté français.
  const FRANCE_US_DIVIDEND_CREDIT_CAP = 0.15;
  const creditCap = round2(gross * FRANCE_US_DIVIDEND_CREDIT_CAP);
  const cappedCredit = Math.min(tax, creditCap);
  // 8PL — libellé officiel DGFiP (cadre 2047 « Revenus de source étrangère
  // ouvrant droit à un crédit d'impôt », ligne « revenus de capitaux mobiliers
  // et plus-values ») : « revenus nets imposables étrangers APRÈS ABATTEMENT
  // éventuel MAIS SANS DÉDUCTION de l'impôt étranger ».
  //   - En PFU (par défaut) : aucun abattement → 8PL = brut.
  //   - En option barème (case 2OP cochée) : abattement 40 % de l'art.
  //     158-3-2° CGI s'applique (société conventionnée soumise à un impôt
  //     équivalent à l'IS) → 8PL = 60 % × brut.
  // ⚠️ NE PAS confondre avec le bloc « Revenus autres que valeurs mobilières »
  // (8VM/8WM/8UM/8PM) qui a un libellé proche mais distinct.
  const DIVIDEND_BAREME_ABATEMENT = 0.4;
  const box8PL = taxMode === 'bareme'
    ? round2(gross * (1 - DIVIDEND_BAREME_ABATEMENT))
    : gross;
  return {
    year: summary.year,
    taxMode,
    box2DC: gross,
    box2CG: taxMode === 'pfu' ? gross : 0,
    box2BH: taxMode === 'bareme' ? gross : 0,
    // 2AB est réservé aux dividendes encaissés en France via un dépositaire
    // français. Pour Fidelity US / Morgan Stanley US, le crédit est déclaré
    // via la 2047 → case 8VL. Renseigner les deux conduirait à imputer
    // deux fois le crédit d'impôt.
    box2AB: 0,
    box2CK: pfnl,
    box8VL: cappedCredit,
    box8PL,
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
