// Full-app backup: serialize and restore the user's simulation state
// (settings, positions, sold lots, saved simulations) as a single JSON file.
//
// Dates are stored as ISO strings and re-hydrated on import. Unknown/invalid
// fields are rejected to keep the runtime state consistent.

import type { AppSettings, Broker, GrantInfo, QualificationReason, RateSource, StockLot, SoldLot, SavedSimulation } from './types';
import { isValidOrigin, isValidPlanType, validateGrant, validateSettings } from './storage';

const KNOWN_QUALIFICATION_REASONS: QualificationReason[] = [
  'broker_default',
  'broker_plan_name',
  'reconciled_unique',
  'reconciled_by_quantity',
  'reconciled_by_agreement',
  'nq_via_withholding',
  'manual',
  'bulk_qualify',
];

function validateQualificationReason(raw: unknown): QualificationReason | undefined {
  return typeof raw === 'string' && (KNOWN_QUALIFICATION_REASONS as string[]).includes(raw)
    ? (raw as QualificationReason)
    : undefined;
}

// v1: original schema (Fidelity-only, no `broker` field).
// v2: added `broker` on every StockLot and SoldLot. v1 backups are still
//     accepted; lots without a `broker` field are migrated as 'fidelity'.
// v3: added StockExport reconciliation fields (reconciled / grantIdHash /
//     awardType) on StockLot and SoldLot, and a top-level `grants` array
//     so the StockExport classification survives a backup round-trip.
// v4: added `rateSource` on StockLot and SoldLot to distinguish an ECB rate
//     from one the user typed in. Absent on v1-v3 backups → read as 'ecb'.
const BACKUP_VERSION = 4;

const VALID_BROKERS: readonly Broker[] = ['fidelity', 'morgan_stanley'];

function validateBroker(raw: unknown): Broker {
  return typeof raw === 'string' && (VALID_BROKERS as readonly string[]).includes(raw)
    ? (raw as Broker)
    : 'fidelity';
}

export interface BackupPayload {
  version: number;
  exportedAt: string;
  app: 'stock-tax-simulator';
  settings: AppSettings;
  lots: StockLot[];
  soldLots: SoldLot[];
  savedSimulations: SavedSimulation[];
  /** Microsoft StockExport grants (since v3). Optional in input/output to keep
   *  v1/v2 backups roundtrippable. */
  grants?: GrantInfo[];
}

export interface BackupInput {
  settings: AppSettings;
  lots: StockLot[];
  soldLots: SoldLot[];
  savedSimulations: SavedSimulation[];
  grants?: GrantInfo[];
}

export interface ImportCounts {
  lotsKept: number;
  lotsRejected: number;
  soldLotsKept: number;
  soldLotsRejected: number;
  grantsKept: number;
  grantsRejected: number;
  savedSimulations: number;
  /** Rows kept but whose indicative amounts had to be recomputed. */
  degraded: number;
}

export interface ImportResult {
  settings: AppSettings;
  lots: StockLot[];
  soldLots: SoldLot[];
  savedSimulations: SavedSimulation[];
  grants: GrantInfo[];
  warnings: string[];
  /** Structured tallies so the UI can show a before/after preview. */
  counts: ImportCounts;
  /** Backup format version the file was written with. */
  version: number;
  /** When the backup was exported, when the file carries a valid date. */
  exportedAt?: Date;
}

/**
 * Serialize the app state to a JSON-safe object. Date instances on lots,
 * sold lots, and grants are converted to ISO strings by JSON.stringify
 * (the on-the-wire shape for grants matches `saveGrants` in storage.ts so
 * that `validateGrant` can re-hydrate them).
 */
export function buildBackup(input: BackupInput): BackupPayload {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'stock-tax-simulator',
    settings: input.settings,
    lots: input.lots,
    soldLots: input.soldLots,
    savedSimulations: input.savedSimulations,
    // Always emit `grants` (possibly []) so v3 readers can distinguish
    // "no grants imported" from "older backup that didn't carry grants".
    grants: input.grants ?? [],
  };
}

/** Produce a JSON string suitable for file download. */
export function exportToJsonString(input: BackupInput): string {
  return JSON.stringify(buildBackup(input), null, 2);
}

/** Suggest a filename for the download (ISO-date stamped). */
export function buildBackupFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `stock-tax-simulator-backup-${y}-${m}-${d}.json`;
}

/** Serialize the current state and trigger a browser download. */
export function downloadBackup(input: BackupInput): void {
  const blob = new Blob([exportToJsonString(input)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildBackupFilename();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- Import / validation ----

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseDate(v: unknown): Date | undefined {
  if (typeof v !== 'string') return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * JSON.parse accepts `1e999` and yields Infinity, so `typeof === 'number'`
 * alone is not enough to trust a value coming from a file.
 */
function finiteOrUndefined(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function validateRateSource(raw: unknown): RateSource | undefined {
  // Absent on v1-v3 backups: those rates always came from the ECB feed.
  if (raw === undefined) return undefined;
  return raw === 'manual' || raw === 'ecb' ? raw : undefined;
}

export function validateLot(raw: unknown): StockLot | null {
  if (!isObj(raw)) return null;
  const acq = parseDate(raw.acquisitionDate);
  if (!acq) return null;
  if (typeof raw.id !== 'string' || typeof raw.quantity !== 'number' || raw.quantity <= 0) return null;
  if (!isValidOrigin(raw.origin) || !isValidPlanType(raw.planType)) return null;

  // Amounts feeding the tax computation: a non-numeric value would silently
  // become a plausible-looking 0 €, so the whole lot is rejected instead.
  const costBasisPerShare = finiteOrUndefined(raw.costBasisPerShare);
  const totalCostBasis = finiteOrUndefined(raw.totalCostBasis);
  if (costBasisPerShare === undefined || totalCostBasis === undefined) return null;

  // Indicative amounts: recomputed from a live quote, so they are degraded
  // and flagged rather than costing the user the whole position.
  const rawCurrentValue = finiteOrUndefined(raw.currentValue);
  const rawUnrealized = finiteOrUndefined(raw.unrealizedGainLoss);
  const currentValue = rawCurrentValue ?? 0;
  const unrealizedGainLoss = rawUnrealized ?? currentValue - totalCostBasis;

  return {
    id: raw.id,
    broker: validateBroker(raw.broker),
    acquisitionDate: acq,
    quantity: raw.quantity,
    costBasisPerShare,
    totalCostBasis,
    currentValue,
    unrealizedGainLoss,
    hasUnreliableAmounts:
      rawCurrentValue === undefined || rawUnrealized === undefined ? true : undefined,
    availableForSaleDate: parseDate(raw.availableForSaleDate),
    availableForTransferDate: parseDate(raw.availableForTransferDate),
    grantDate: parseDate(raw.grantDate),
    origin: raw.origin,
    holdingPeriod: (raw.holdingPeriod === 'Long' ? 'Long' : 'Short'),
    planType: raw.planType,
    esppFmvPerShare: finiteOrUndefined(raw.esppFmvPerShare),
    esppFmvPerShareUsd: finiteOrUndefined(raw.esppFmvPerShareUsd),
    costBasisPerShareUsd: finiteOrUndefined(raw.costBasisPerShareUsd),
    totalCostBasisUsd: finiteOrUndefined(raw.totalCostBasisUsd),
    currentValueUsd: finiteOrUndefined(raw.currentValueUsd),
    eurUsdRate: finiteOrUndefined(raw.eurUsdRate),
    rateSource: validateRateSource(raw.rateSource),
    importCurrency: raw.importCurrency === 'USD' || raw.importCurrency === 'EUR' ? raw.importCurrency : undefined,
    // v3 — Microsoft StockExport reconciliation (absent on v1/v2 backups).
    reconciled: typeof raw.reconciled === 'boolean' ? raw.reconciled : undefined,
    grantIdHash: typeof raw.grantIdHash === 'string' ? raw.grantIdHash : undefined,
    awardType: typeof raw.awardType === 'string' ? raw.awardType : undefined,
    isReinvestedDividend: typeof raw.isReinvestedDividend === 'boolean' ? raw.isReinvestedDividend : undefined,
    qualificationReason: validateQualificationReason(raw.qualificationReason),
  };
}

export function validateSoldLot(raw: unknown): SoldLot | null {
  if (!isObj(raw)) return null;
  const acq = parseDate(raw.acquisitionDate);
  const sale = parseDate(raw.saleDate);
  if (!acq || !sale) return null;
  if (typeof raw.id !== 'string' || typeof raw.quantity !== 'number' || raw.quantity <= 0) return null;
  if (!isValidOrigin(raw.origin) || !isValidPlanType(raw.planType)) return null;

  // Proceeds and cost basis drive the capital-gain tax: reject rather than zero.
  const proceeds = finiteOrUndefined(raw.proceeds);
  const costBasis = finiteOrUndefined(raw.costBasis);
  if (proceeds === undefined || costBasis === undefined) return null;

  const rawGainLoss = finiteOrUndefined(raw.gainLoss);

  return {
    id: raw.id,
    broker: validateBroker(raw.broker),
    acquisitionDate: acq,
    saleDate: sale,
    quantity: raw.quantity,
    proceeds,
    costBasis,
    gainLoss: rawGainLoss ?? proceeds - costBasis,
    hasUnreliableAmounts: rawGainLoss === undefined ? true : undefined,
    holdingPeriod: (raw.holdingPeriod === 'Long' ? 'Long' : 'Short'),
    origin: raw.origin,
    planType: raw.planType,
    proceedsUsd: finiteOrUndefined(raw.proceedsUsd),
    costBasisUsd: finiteOrUndefined(raw.costBasisUsd),
    eurUsdRate: finiteOrUndefined(raw.eurUsdRate),
    rateSource: validateRateSource(raw.rateSource),
    importCurrency: raw.importCurrency === 'USD' || raw.importCurrency === 'EUR' ? raw.importCurrency : undefined,
    // v3 — Microsoft StockExport reconciliation (absent on v1/v2 backups).
    reconciled: typeof raw.reconciled === 'boolean' ? raw.reconciled : undefined,
    grantIdHash: typeof raw.grantIdHash === 'string' ? raw.grantIdHash : undefined,
    awardType: typeof raw.awardType === 'string' ? raw.awardType : undefined,
    isReinvestedDividend: typeof raw.isReinvestedDividend === 'boolean' ? raw.isReinvestedDividend : undefined,
    qualificationReason: validateQualificationReason(raw.qualificationReason),
  };
}

/**
 * Parse and validate a backup JSON string. Throws on malformed input;
 * silently drops individual invalid lots while collecting warnings.
 */
export function importFromJsonString(text: string, defaults: AppSettings): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Fichier JSON invalide.');
  }

  if (!isObj(parsed)) {
    throw new Error('Format de sauvegarde non reconnu.');
  }
  if (parsed.app !== 'stock-tax-simulator') {
    throw new Error('Ce fichier ne provient pas du simulateur fiscal.');
  }
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    throw new Error(`Version de sauvegarde non supportée (v${parsed.version}).`);
  }

  const warnings: string[] = [];

  const settings = validateSettings(parsed.settings, defaults);

  const rawLots = Array.isArray(parsed.lots) ? parsed.lots : [];
  const lots: StockLot[] = [];
  for (const raw of rawLots) {
    const lot = validateLot(raw);
    if (lot) lots.push(lot);
  }
  if (lots.length < rawLots.length) {
    warnings.push(`${rawLots.length - lots.length} position(s) ignorée(s) car invalide(s).`);
  }

  const rawSold = Array.isArray(parsed.soldLots) ? parsed.soldLots : [];
  const soldLots: SoldLot[] = [];
  for (const raw of rawSold) {
    const sl = validateSoldLot(raw);
    if (sl) soldLots.push(sl);
  }
  if (soldLots.length < rawSold.length) {
    warnings.push(`${rawSold.length - soldLots.length} vente(s) ignorée(s) car invalide(s).`);
  }

  // SavedSimulations are advisory history; we accept them as-is if they look
  // like objects with an id, since they're not used for calculations.
  const rawSims = Array.isArray(parsed.savedSimulations) ? parsed.savedSimulations : [];
  const savedSimulations = rawSims.filter(
    (s): s is SavedSimulation => isObj(s) && typeof (s as { id?: unknown }).id === 'string'
  );

  // v3+: StockExport grants. Re-validated with the same shape used by storage.ts.
  // Absent on v1/v2 backups → empty array.
  const rawGrants = Array.isArray(parsed.grants) ? parsed.grants : [];
  const grants: GrantInfo[] = [];
  for (const raw of rawGrants) {
    const g = validateGrant(raw);
    if (g) grants.push(g);
  }
  if (grants.length < rawGrants.length) {
    warnings.push(`${rawGrants.length - grants.length} grant(s) ignoré(s) car invalide(s).`);
  }

  const degraded =
    lots.filter((l) => l.hasUnreliableAmounts).length +
    soldLots.filter((sl) => sl.hasUnreliableAmounts).length;
  if (degraded > 0) {
    warnings.push(
      `${degraded} ligne(s) conservée(s) avec des montants indicatifs recalculés (valeur actuelle / plus-value).`
    );
  }

  return {
    settings,
    lots,
    soldLots,
    savedSimulations,
    grants,
    warnings,
    counts: {
      lotsKept: lots.length,
      lotsRejected: rawLots.length - lots.length,
      soldLotsKept: soldLots.length,
      soldLotsRejected: rawSold.length - soldLots.length,
      grantsKept: grants.length,
      grantsRejected: rawGrants.length - grants.length,
      savedSimulations: savedSimulations.length,
      degraded,
    },
    version: parsed.version,
    exportedAt: parseDate(parsed.exportedAt),
  };
}
