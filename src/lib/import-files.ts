import { decodeTextFile } from './text-decoding';
import type { StockLot, SoldLot } from './types';
import type { DividendEvent } from './transaction-parser';

export type FileKind = 'positions' | 'sales' | 'activity';

export interface ImportedFile {
  name: string;
  kind: FileKind;
  /** Optional human-readable summary appended to the kind tag (e.g. "30 positions, 12 ventes, 8 dividendes"). */
  summary?: string;
}

/**
 * A fully parsed and converted batch waiting for the user's go-ahead. Imports
 * replace the whole broker slice, so nothing reaches the portfolio until this
 * is confirmed.
 */
export type PendingImport = {
  lots: StockLot[];
  sold: SoldLot[];
  dividends: DividendEvent[];
  files: ImportedFile[];
};

export function readAsArrayBuffer(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(new Error('Lecture impossible.'));
    r.readAsArrayBuffer(file);
  });
}

export async function readAsText(file: File) {
  return decodeTextFile(await readAsArrayBuffer(file));
}

/**
 * Inspect the first few lines of a CSV to decide whether it is a Morgan
 * Stanley "Holdings by Lot" file or a "Share Sales" file. Returns null when
 * the format is not recognised.
 */
export function detectMsCsvKind(text: string): FileKind | null {
  // Read the first ~10 non-empty lines so we tolerate the small title row
  // before the column header.
  const head = text.split(/\r?\n/).slice(0, 10).map(l => l.trim()).filter(Boolean);
  for (const line of head) {
    if (line.startsWith('Holdings by Lot')) return 'positions';
    if (line.startsWith('Acquisition Date,Savings Plan Name')) return 'positions';
    // Share Sales header: Date,Plan Name,Fund Name,Type,Order Status,Sale Price,...
    if (line.startsWith('Date,Plan Name,Fund Name')) return 'sales';
  }
  return null;
}
