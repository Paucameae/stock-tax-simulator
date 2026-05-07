// Full-app backup: serialize and restore the user's simulation state
// (settings, positions, sold lots, saved simulations) as a single JSON file.
//
// Dates are stored as ISO strings and re-hydrated on import. Unknown/invalid
// fields are rejected to keep the runtime state consistent.

import type { AppSettings, Broker, GrantInfo, StockLot, SoldLot, SavedSimulation } from './types';
import { validateGrant, validateSettings } from './storage';

// v1: original schema (Fidelity-only, no `broker` field).
// v2: added `broker` on every StockLot and SoldLot. v1 backups are still
//     accepted; lots without a `broker` field are migrated as 'fidelity'.
// v3: added StockExport reconciliation fields (reconciled / grantIdHash /
//     awardType) on StockLot and SoldLot, and a top-level `grants` array
//     so the StockExport classification survives a backup round-trip.
const BACKUP_VERSION = 3;

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

export interface ImportResult {
  settings: AppSettings;
  lots: StockLot[];
  soldLots: SoldLot[];
  savedSimulations: SavedSimulation[];
  grants: GrantInfo[];
  warnings: string[];
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

// ---- Import / validation ----

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseDate(v: unknown): Date | undefined {
  if (typeof v !== 'string') return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

function validateLot(raw: unknown): StockLot | null {
  if (!isObj(raw)) return null;
  const acq = parseDate(raw.acquisitionDate);
  if (!acq) return null;
  if (typeof raw.id !== 'string' || typeof raw.quantity !== 'number' || raw.quantity <= 0) return null;
  if (typeof raw.origin !== 'string' || typeof raw.planType !== 'string') return null;

  return {
    id: raw.id,
    broker: validateBroker(raw.broker),
    acquisitionDate: acq,
    quantity: raw.quantity,
    costBasisPerShare: Number(raw.costBasisPerShare) || 0,
    totalCostBasis: Number(raw.totalCostBasis) || 0,
    currentValue: Number(raw.currentValue) || 0,
    unrealizedGainLoss: Number(raw.unrealizedGainLoss) || 0,
    availableForSaleDate: parseDate(raw.availableForSaleDate),
    availableForTransferDate: parseDate(raw.availableForTransferDate),
    grantDate: parseDate(raw.grantDate),
    origin: raw.origin as StockLot['origin'],
    holdingPeriod: (raw.holdingPeriod === 'Long' ? 'Long' : 'Short'),
    planType: raw.planType as StockLot['planType'],
    esppFmvPerShare: typeof raw.esppFmvPerShare === 'number' ? raw.esppFmvPerShare : undefined,
    esppFmvPerShareUsd: typeof raw.esppFmvPerShareUsd === 'number' ? raw.esppFmvPerShareUsd : undefined,
    costBasisPerShareUsd: typeof raw.costBasisPerShareUsd === 'number' ? raw.costBasisPerShareUsd : undefined,
    totalCostBasisUsd: typeof raw.totalCostBasisUsd === 'number' ? raw.totalCostBasisUsd : undefined,
    currentValueUsd: typeof raw.currentValueUsd === 'number' ? raw.currentValueUsd : undefined,
    eurUsdRate: typeof raw.eurUsdRate === 'number' ? raw.eurUsdRate : undefined,
    importCurrency: raw.importCurrency === 'USD' || raw.importCurrency === 'EUR' ? raw.importCurrency : undefined,
    // v3 — Microsoft StockExport reconciliation (absent on v1/v2 backups).
    reconciled: typeof raw.reconciled === 'boolean' ? raw.reconciled : undefined,
    grantIdHash: typeof raw.grantIdHash === 'string' ? raw.grantIdHash : undefined,
    awardType: typeof raw.awardType === 'string' ? raw.awardType : undefined,
    isReinvestedDividend: typeof raw.isReinvestedDividend === 'boolean' ? raw.isReinvestedDividend : undefined,
  };
}

function validateSoldLot(raw: unknown): SoldLot | null {
  if (!isObj(raw)) return null;
  const acq = parseDate(raw.acquisitionDate);
  const sale = parseDate(raw.saleDate);
  if (!acq || !sale) return null;
  if (typeof raw.id !== 'string' || typeof raw.quantity !== 'number' || raw.quantity <= 0) return null;
  if (typeof raw.origin !== 'string' || typeof raw.planType !== 'string') return null;

  return {
    id: raw.id,
    broker: validateBroker(raw.broker),
    acquisitionDate: acq,
    saleDate: sale,
    quantity: raw.quantity,
    proceeds: Number(raw.proceeds) || 0,
    costBasis: Number(raw.costBasis) || 0,
    gainLoss: Number(raw.gainLoss) || 0,
    holdingPeriod: (raw.holdingPeriod === 'Long' ? 'Long' : 'Short'),
    origin: raw.origin as SoldLot['origin'],
    planType: raw.planType as SoldLot['planType'],
    proceedsUsd: typeof raw.proceedsUsd === 'number' ? raw.proceedsUsd : undefined,
    costBasisUsd: typeof raw.costBasisUsd === 'number' ? raw.costBasisUsd : undefined,
    eurUsdRate: typeof raw.eurUsdRate === 'number' ? raw.eurUsdRate : undefined,
    importCurrency: raw.importCurrency === 'USD' || raw.importCurrency === 'EUR' ? raw.importCurrency : undefined,
    // v3 — Microsoft StockExport reconciliation (absent on v1/v2 backups).
    reconciled: typeof raw.reconciled === 'boolean' ? raw.reconciled : undefined,
    grantIdHash: typeof raw.grantIdHash === 'string' ? raw.grantIdHash : undefined,
    awardType: typeof raw.awardType === 'string' ? raw.awardType : undefined,
    isReinvestedDividend: typeof raw.isReinvestedDividend === 'boolean' ? raw.isReinvestedDividend : undefined,
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

  return { settings, lots, soldLots, savedSimulations, grants, warnings };
}
