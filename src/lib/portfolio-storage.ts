import type { StockLot, SoldLot } from './types';
import { validateLot, validateSoldLot } from './backup';
import { safeSetItem } from './storage';

export const PORTFOLIO_STORAGE_KEY = 'portfolio';

const PORTFOLIO_VERSION = 1;

export interface PersistedPortfolio {
  lots: StockLot[];
  soldLots: SoldLot[];
  /** ISO date of the last write, `null` when nothing was ever persisted. */
  savedAt: string | null;
  /** ISO date of the last positions import, used to date the fallback valuation. */
  importedAt: string | null;
  /** Rows dropped because they no longer passed validation. */
  rejected: number;
}

const EMPTY: PersistedPortfolio = {
  lots: [],
  soldLots: [],
  savedAt: null,
  importedAt: null,
  rejected: 0,
};

let lastSavedAt: string | null = null;
const saveListeners = new Set<() => void>();

function setLastSavedAt(value: string | null): void {
  if (value === lastSavedAt) return;
  lastSavedAt = value;
  for (const listener of saveListeners) listener();
}

/** `useSyncExternalStore` pair, so the UI can show when the last autosave ran. */
export function subscribeToPortfolioSaves(listener: () => void): () => void {
  saveListeners.add(listener);
  return () => {
    saveListeners.delete(listener);
  };
}

export function getLastPortfolioSave(): string | null {
  return lastSavedAt;
}

/**
 * Persist the imported positions and sales so a page refresh — or a PWA cold
 * start — does not send the user back to an empty app with a backup file to
 * reload. Reuses the backup validators, so the stored shape is exactly the one
 * the restore path already knows how to read.
 */
export function savePortfolio(
  lots: StockLot[],
  soldLots: SoldLot[],
  importedAt: string | null = null
): boolean {
  if (lots.length === 0 && soldLots.length === 0) {
    clearPortfolio();
    return true;
  }
  const savedAt = new Date().toISOString();
  const ok = safeSetItem(
    PORTFOLIO_STORAGE_KEY,
    JSON.stringify({ version: PORTFOLIO_VERSION, savedAt, importedAt, lots, soldLots })
  );
  if (ok) setLastSavedAt(savedAt);
  return ok;
}

export function loadPortfolio(): PersistedPortfolio {
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (!raw) return EMPTY;
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }

  if (!parsed || typeof parsed !== 'object') return EMPTY;
  const obj = parsed as Record<string, unknown>;

  const rawLots = Array.isArray(obj.lots) ? obj.lots : [];
  const rawSoldLots = Array.isArray(obj.soldLots) ? obj.soldLots : [];
  const lots = rawLots.map(validateLot).filter((l): l is StockLot => l !== null);
  const soldLots = rawSoldLots.map(validateSoldLot).filter((sl): sl is SoldLot => sl !== null);
  const savedAt = typeof obj.savedAt === 'string' ? obj.savedAt : null;
  setLastSavedAt(savedAt);

  return {
    lots,
    soldLots,
    savedAt,
    importedAt: typeof obj.importedAt === 'string' ? obj.importedAt : null,
    rejected: rawLots.length - lots.length + (rawSoldLots.length - soldLots.length),
  };
}

export function clearPortfolio(): void {
  setLastSavedAt(null);
  try {
    localStorage.removeItem(PORTFOLIO_STORAGE_KEY);
  } catch {
    // nothing to do: the data is already unreadable
  }
}
