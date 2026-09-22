import React, { useCallback } from 'react';
import { Upload, FileText, RefreshCw, ShoppingCart, DollarSign, HelpCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Alert } from './ui/alert';
import { parseCsvFile, parseSalesCsvFile } from '../lib/csv-parser';
import { parseMsHoldingsCsv, parseMsSalesCsv, parseMsActivityXlsx } from '../lib/brokers/morgan-stanley';
import { useEcbConversion } from '../hooks/useEcbConversion';
import {
  formatDateKey,
  nearestRate,
  convertLotWithRate,
  convertSoldLotWithRate,
  type RateCache,
} from '../lib/ecb-rates';
import { ManualRateDialog, type MissingRateEntry } from './ManualRateDialog';
import { BrokerImportSummary, ClearConfirmDialog } from './CsvImportSummary';
import { ImportPreviewDialog } from './CsvImportPreviewDialog';
import { BrokerExportGuide } from './guides/BrokerExportGuide';
import { brokerLabel } from '../lib/utils';
import { detectMsCsvKind, readAsArrayBuffer, readAsText, type ImportedFile, type PendingImport } from '../lib/import-files';
import type { Broker, StockLot, SoldLot } from '../lib/types';
import type { DividendEvent } from '../lib/transaction-parser';

type ImportMode = 'positions' | 'sales';

interface CsvImporterProps {
  /**
   * Broker the CSV is being imported from. Selects the broker-specific
   * parser. Currently supports 'fidelity' (CSV only, with positions/sales
   * toggle since these are two distinct exports) and 'morgan_stanley' (a
   * single MS export bundles holdings and sales for the period; auto-detected
   * here with no toggle, accepts CSV + XLSX, multi-file).
   */
  broker?: Broker;
  onImport: (lots: StockLot[]) => void;
  onImportSales?: (soldLots: SoldLot[]) => void;
  /**
   * Optional callback invoked when the imported file also contains dividend
   * events (currently the case for the Morgan Stanley "Participant Share
   * Sales Report" XLSX, which bundles DRIP rows alongside positions and
   * sales). Receives only the dividends from this import; merging with any
   * previously-stored dividends from other brokers is the caller's
   * responsibility.
   */
  onImportDividends?: (dividends: DividendEvent[]) => void;
  /**
   * Optional callback invoked when the user clicks the "Supprimer" button.
   * The parent is expected to drop all positions / sales (and dividends, for
   * Morgan Stanley) belonging to this broker. Without this prop the clear
   * affordance is hidden.
   */
  onClear?: () => void;
  /**
   * Persistent positions belonging to this broker (already filtered by the
   * parent). Used to render an aggregated summary card mirroring the one
   * the StockExport importer exposes. Optional: when omitted, no summary is
   * shown (legacy callers).
   */
  lots?: StockLot[];
  /** Persistent sales belonging to this broker (already filtered by the parent). */
  soldLots?: SoldLot[];
  /**
   * Optional dividend tally to surface alongside positions / sales (used by
   * the Morgan Stanley card whose activity report bundles DRIP rows).
   */
  dividendsCount?: number;
  dividendsGrossUsd?: number;
  /**
   * Fine-grained clear callbacks scoped to a single data slice for this
   * broker. Each is independent so the user can drop just their dividends
   * without touching positions/sales (the original asymmetric concern that
   * led to these props). When omitted the corresponding "Effacer" affordance
   * is hidden.
   */
  onClearLots?: () => void;
  onClearSales?: () => void;
  onClearDividends?: () => void;
  /**
   * When rendered inside a BrokerSection card, set this to true to drop the
   * outer Card wrapper and the redundant "Importer l'export ..." title.
   * The broker identity is already given by the parent section.
   */
  embedded?: boolean;
}

/** Group the rows still missing a rate by the date whose rate is missing. */
function buildMissingRateEntries(
  lots: StockLot[],
  sold: SoldLot[],
  rates: RateCache
): MissingRateEntry[] {
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const l of lots) if (!l.eurUsdRate) bump(formatDateKey(l.acquisitionDate));
  for (const s of sold) if (!s.eurUsdRate) bump(formatDateKey(s.saleDate));
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, rowCount]) => ({
      dateKey,
      rowCount,
      suggested: nearestRate(rates, new Date(dateKey)),
    }));
}

export const CsvImporter = React.memo(function CsvImporter({ broker = 'fidelity', onImport, onImportSales, onImportDividends, onClear, onClearLots, onClearSales, onClearDividends, lots, soldLots, dividendsCount = 0, dividendsGrossUsd = 0, embedded = false }: CsvImporterProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [importedFiles, setImportedFiles] = React.useState<ImportedFile[]>([]);
  const [importMode, setImportMode] = React.useState<ImportMode>('positions');
  const [showGuide, setShowGuide] = React.useState(false);
  const [confirmClearAll, setConfirmClearAll] = React.useState(false);
  // Rows held back because their EUR/USD rate could not be resolved. They are
  // NOT published until the user supplies a rate: publishing them would show
  // 0 € amounts that look legitimate on the declaration.
  const [pendingRates, setPendingRates] = React.useState<{
    lots: StockLot[];
    sold: SoldLot[];
    dividends: DividendEvent[];
    files: ImportedFile[];
    entries: MissingRateEntry[];
  } | null>(null);
  // Parsed, converted rows awaiting the user's go-ahead. Nothing is published
  // before `confirmImport`: an import overwrites the broker slice, and the
  // files are picked from a file dialog where a mis-click is cheap.
  const [preview, setPreview] = React.useState<PendingImport | null>(null);
  // Total count of lots whose ECB rate could not be resolved during the
  // most recent import. Drives the destructive alert + retry button: a
  // failed BCE lookup leaves proceeds/costBasis at 0, which is what users
  // see as "all zeros" on the sales tab. Reset on each new file pick.
  const [ecbMissingCount, setEcbMissingCount] = React.useState(0);
  // Keep the most recent raw batch so the user can retry the BCE
  // conversion without having to re-pick the file (typical cause:
  // transient network failure when fetching ECB rates).
  const lastBatchRef = React.useRef<{ lots: StockLot[]; sold: SoldLot[]; dividends: DividendEvent[]; files: ImportedFile[] } | null>(null);
  const [hasRetryableBatch, setHasRetryableBatch] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { convertLots, convertSoldLots, loading, error: ecbError } = useEcbConversion();

  // Morgan Stanley exports bundle holdings + sales in a single archive: we
  // route each dropped file by content (no positions/sales toggle).
  const isAutoDetect = broker === 'morgan_stanley';
  const accept = isAutoDetect ? '.csv,.xlsx' : '.csv';

  const handleFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setEcbMissingCount(0);
      setPreview(null);

      const MAX_FILE_SIZE = 5 * 1024 * 1024;
      for (const f of files) {
        if (f.size > MAX_FILE_SIZE) {
          setError(`Fichier trop volumineux (${(f.size / 1024 / 1024).toFixed(1)} Mo). Taille maximale : 5 Mo.`);
          return;
        }
        if (f.size === 0) {
          setError(`Le fichier ${f.name} est vide.`);
          return;
        }
      }

      const collectedLots: StockLot[] = [];
      const collectedSold: SoldLot[] = [];
      const collectedDividends: DividendEvent[] = [];
      const processed: ImportedFile[] = [];

      try {
        for (const file of files) {
          const isXlsx = /\.xlsx$/i.test(file.name);

          if (isAutoDetect) {
            // Morgan Stanley: detect kind per file and route.
            if (isXlsx) {
              // The Participant Share Sales Report bundles up to three
              // sections in a single XLSX: sales, positions, and dividend
              // reinvestment activity. Any of them may be empty.
              const buf = await readAsArrayBuffer(file);
              const result = await parseMsActivityXlsx(buf);
              if (result.soldLots.length === 0 && result.lots.length === 0 && result.dividends.length === 0) {
                throw new Error(`Aucune donnée exploitable dans ${file.name} (ni vente, ni position, ni dividende).`);
              }
              collectedSold.push(...result.soldLots);
              collectedLots.push(...result.lots);
              collectedDividends.push(...result.dividends);
              const parts: string[] = [];
              if (result.lots.length > 0) parts.push(`${result.lots.length} positions`);
              if (result.soldLots.length > 0) parts.push(`${result.soldLots.length} ventes`);
              if (result.dividends.length > 0) parts.push(`${result.dividends.length} dividendes`);
              processed.push({ name: file.name, kind: 'activity', summary: parts.join(', ') });
            } else {
              const text = await readAsText(file);
              const kind = detectMsCsvKind(text);
              if (kind === null) {
                throw new Error(`Format Morgan Stanley non reconnu pour ${file.name}. Attendu : « Holdings by Lot » ou « Share Sales ».`);
              }
              if (kind === 'positions') {
                const lots = parseMsHoldingsCsv(text);
                if (lots.length === 0) throw new Error(`Aucun lot valide dans ${file.name}.`);
                collectedLots.push(...lots);
              } else {
                const sold = parseMsSalesCsv(text);
                if (sold.length === 0) throw new Error(`Aucune vente trouvée dans ${file.name}.`);
                collectedSold.push(...sold);
              }
              processed.push({ name: file.name, kind });
            }
          } else {
            // Fidelity: explicit toggle.
            if (isXlsx) {
              throw new Error('Le format XLSX n\u2019est pas accepté pour Fidelity. Utilisez le CSV.');
            }
            const text = await readAsText(file);
            if (importMode === 'sales') {
              const sold = parseSalesCsvFile(text);
              if (sold.length === 0) throw new Error(`Aucune vente trouvée dans ${file.name}.`);
              collectedSold.push(...sold);
              processed.push({ name: file.name, kind: 'sales' });
            } else {
              const lots = parseCsvFile(text);
              if (lots.length === 0) throw new Error(`Aucun lot valide dans ${file.name}.`);
              collectedLots.push(...lots);
              processed.push({ name: file.name, kind: 'positions' });
            }
          }
        }

        let totalMissing = 0;
        let convertedLots: StockLot[] = [];
        let convertedSold: SoldLot[] = [];
        let rates: RateCache = {};
        if (collectedLots.length > 0) {
          const r = await convertLots(collectedLots);
          convertedLots = r.converted;
          totalMissing += r.missingCount;
          rates = { ...rates, ...r.rates };
        }
        if (collectedSold.length > 0) {
          const r = await convertSoldLots(collectedSold);
          convertedSold = r.converted;
          totalMissing += r.missingCount;
          rates = { ...rates, ...r.rates };
        }
        setEcbMissingCount(totalMissing);
        // Stash the raw batch for the retry button: convertLots /
        // convertSoldLots are pure w.r.t. the input lots, so re-running
        // them on the same raw data after a successful BCE fetch will
        // produce correctly-converted lots that overwrite the broker
        // slice (handlers use mergeByBroker).
        lastBatchRef.current = {
          lots: collectedLots,
          sold: collectedSold,
          dividends: collectedDividends,
          files: processed,
        };
        setHasRetryableBatch(collectedLots.length > 0 || collectedSold.length > 0);

        if (totalMissing > 0) {
          // Hold the whole batch back: mergeByBroker replaces the broker slice
          // wholesale, so a partial publish would be undone by the second one.
          setPendingRates({
            lots: convertedLots,
            sold: convertedSold,
            dividends: collectedDividends,
            files: processed,
            entries: buildMissingRateEntries(convertedLots, convertedSold, rates),
          });
          return;
        }
        setPreview({
          lots: convertedLots,
          sold: convertedSold,
          dividends: collectedDividends,
          files: processed,
        });
      } catch (err) {
        setError('Erreur lors de la lecture du fichier : ' + (err as Error).message);
      }
    },
    [importMode, convertLots, convertSoldLots, isAutoDetect]
  );

  /** Write the confirmed batch to the portfolio. The only place that publishes. */
  const confirmImport = useCallback(() => {
    if (!preview) return;
    if (preview.dividends.length > 0) onImportDividends?.(preview.dividends);
    if (preview.lots.length > 0) onImport(preview.lots);
    if (preview.sold.length > 0) onImportSales?.(preview.sold);
    setImportedFiles(preview.files);
    setPreview(null);
  }, [preview, onImport, onImportSales, onImportDividends]);

  /** Discard the batch: nothing reaches the portfolio. */
  const cancelImport = useCallback(() => {
    setPreview(null);
    setError('Import annulé : aucune ligne n\u2019a été enregistrée.');
  }, []);

  /** Move the held-back batch to the preview once the missing rates are in. */
  const applyManualRates = useCallback(
    (manual: Record<string, number>) => {
      if (!pendingRates) return;
      const lots = pendingRates.lots.map((lot) => {
        if (lot.eurUsdRate) return lot;
        const rate = manual[formatDateKey(lot.acquisitionDate)];
        return rate ? convertLotWithRate(lot, rate, rate, 'manual') : lot;
      });
      const sold = pendingRates.sold.map((sl) => {
        if (sl.eurUsdRate) return sl;
        const rate = manual[formatDateKey(sl.saleDate)];
        return rate ? convertSoldLotWithRate(sl, rate, rate, 'manual') : sl;
      });
      setPreview({ lots, sold, dividends: pendingRates.dividends, files: pendingRates.files });
      setPendingRates(null);
      setEcbMissingCount(0);
    },
    [pendingRates]
  );

  /** Drop the held-back batch: nothing reaches the portfolio. */
  const cancelManualRates = useCallback(() => {
    setPendingRates(null);
    setImportedFiles([]);
    setError(
      'Import annulé : aucun taux de change n\u2019a été appliqué, donc aucune ligne n\u2019a été enregistrée.'
    );
  }, []);

  /**
   * Re-run the ECB conversion on the most recent raw batch. Used when the
   * initial import couldn't resolve some EUR/USD rates (typically a transient
   * network failure on the BCE feed) and the lots show up with
   * proceeds/costBasis at 0. The result goes back through the preview.
   */
  const handleRetryEcb = useCallback(async () => {
    const batch = lastBatchRef.current;
    if (!batch) return;
    setRetrying(true);
    try {
      let totalMissing = 0;
      let lots: StockLot[] = [];
      let sold: SoldLot[] = [];
      let rates: RateCache = {};
      if (batch.lots.length > 0) {
        const r = await convertLots(batch.lots);
        lots = r.converted;
        totalMissing += r.missingCount;
        rates = { ...rates, ...r.rates };
      }
      if (batch.sold.length > 0) {
        const r = await convertSoldLots(batch.sold);
        sold = r.converted;
        totalMissing += r.missingCount;
        rates = { ...rates, ...r.rates };
      }
      setEcbMissingCount(totalMissing);
      if (totalMissing > 0) {
        setPendingRates({
          lots,
          sold,
          dividends: batch.dividends,
          files: batch.files,
          entries: buildMissingRateEntries(lots, sold, rates),
        });
        return;
      }
      setPreview({ lots, sold, dividends: batch.dividends, files: batch.files });
    } finally {
      setRetrying(false);
    }
  }, [convertLots, convertSoldLots]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleFiles(files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) handleFiles(files);
    },
    [handleFiles]
  );

  const guideAvailable = broker === 'fidelity';
  const helpButton = guideAvailable ? (
    <button
      type="button"
      onClick={() => setShowGuide(true)}
      aria-label="Voir le guide d'export"
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-primary transition-colors whitespace-nowrap shrink-0"
    >
      <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Voir le guide d&rsquo;export
    </button>
  ) : (
    <span
      role="note"
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-gray-300 text-gray-400 whitespace-nowrap shrink-0 cursor-not-allowed"
      title="Le guide d'export pour ce courtier sera ajouté prochainement"
    >
      <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Guide à venir
    </span>
  );

  const handleClear = useCallback(() => {
    setImportedFiles([]);
    setError(null);
    onClear?.();
  }, [onClear]);

  const hasImports = importedFiles.length > 0;
  const clearButton = hasImports && onClear ? (
    <button
      type="button"
      onClick={() => setConfirmClearAll(true)}
      aria-label="Supprimer les données importées"
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors whitespace-nowrap shrink-0"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      Supprimer
    </button>
  ) : null;

  const body = (
    <>
      {/* Import mode selector — only when explicit positions/sales separation
          makes sense. Morgan Stanley exports bundle both, so we hide it. */}
      {!isAutoDetect && (
        <div className="flex w-full gap-3 mb-4">
          <button
            type="button"
            className={`flex-1 flex flex-col items-center gap-1 px-4 py-3 rounded-lg border-2 transition-all ${
              importMode === 'positions'
                ? 'bg-primary/5 border-primary'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => { setImportMode('positions'); setImportedFiles([]); setError(null); }}
          >
            <span className={`flex items-center gap-2 text-sm font-medium ${
              importMode === 'positions' ? 'text-primary' : 'text-gray-700'
            }`}>
              <FileText className="h-4 w-4" />
              Positions ouvertes
            </span>
            <span className={`text-xs ${importMode === 'positions' ? 'text-primary/70' : 'text-gray-400'}`}>
              Simuler une vente future
            </span>
          </button>
          <button
            type="button"
            className={`flex-1 flex flex-col items-center gap-1 px-4 py-3 rounded-lg border-2 transition-all ${
              importMode === 'sales'
                ? 'bg-primary/5 border-primary'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => { setImportMode('sales'); setImportedFiles([]); setError(null); }}
          >
            <span className={`flex items-center gap-2 text-sm font-medium ${
              importMode === 'sales' ? 'text-primary' : 'text-gray-700'
            }`}>
              <ShoppingCart className="h-4 w-4" />
              Ventes effectuées
            </span>
            <span className={`text-xs ${importMode === 'sales' ? 'text-primary/70' : 'text-gray-400'}`}>
              Calculer l{'\u2019'}impôt et déclarer
            </span>
          </button>
        </div>
        )}

        {/* Prerequisite banner — canonical structure shared with the other
            importers: icon + concise sentence on a coloured background. */}
        <div className="flex items-start gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <DollarSign className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {isAutoDetect ? (
              <>
                Rapport <strong>Participant Share Sales Report</strong> Morgan Stanley en{' '}
                <strong>USD</strong> (XLSX ou CSV). Positions, ventes et dividendes
                réinvestis (DRIP) sont détectés automatiquement.
              </>
            ) : (
              <>
                Fichier en <strong>dollars (USD)</strong>. Les taux de change BCE seront
                récupérés automatiquement pour chaque date.
                {broker === 'fidelity' && <> Exportez depuis Fidelity avec l&rsquo;option «&nbsp;USD&nbsp;».</>}
              </>
            )}
          </span>
        </div>

        {loading && (
          <div
            className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700"
            role="status"
            aria-live="polite"
          >
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            Récupération des taux de change BCE en cours…
          </div>
        )}

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-primary bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          role="button"
          tabIndex={0}
          aria-label="Zone d'import. Glissez un fichier CSV ou appuyez sur Entrée pour parcourir."
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <Upload className="h-10 w-10 mx-auto mb-3 text-gray-400" aria-hidden="true" />
          <p className="text-sm text-gray-600 mb-2">
            {importedFiles.length > 0 ? (
              <span className="flex flex-col items-center gap-1">
                {importedFiles.map((f, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    <strong>{f.name}</strong>
                    <span className="text-xs text-gray-500">
                      ({f.summary ?? (f.kind === 'positions' ? 'positions' : 'ventes')})
                    </span>
                  </span>
                ))}
              </span>
            ) : (
              isAutoDetect
                ? 'Glissez vos fichiers (CSV ou XLSX) ici ou cliquez pour parcourir'
                : 'Glissez votre fichier CSV ici ou cliquez pour parcourir'
            )}
          </p>
          <Button variant="outline" size="sm" type="button">
            Choisir un fichier
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple={isAutoDetect}
            className="hidden"
            onChange={handleInputChange}
          />
        </div>

        <BrokerImportSummary
          broker={broker}
          lots={lots}
          soldLots={soldLots}
          dividendsCount={dividendsCount}
          dividendsGrossUsd={dividendsGrossUsd}
          onClearLots={onClearLots}
          onClearSales={onClearSales}
          onClearDividends={onClearDividends}
        />

        {error && (
          <p
            className="mt-3 text-sm text-red-600"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </p>
        )}

        {(ecbError || ecbMissingCount > 0) && (
          <div className="mt-3">
            <Alert variant="destructive">
              <div className="flex flex-col gap-2">
                <div>
                  <p className="font-medium">
                    Conversion EUR indisponible
                    {ecbMissingCount > 0 && ` pour ${ecbMissingCount} lot${ecbMissingCount > 1 ? 's' : ''}`}.
                  </p>
                  <p className="text-xs mt-1">
                    Les taux de change BCE n'ont pas pu être récupérés (problème réseau ou indisponibilité du flux BCE).
                    Ces lignes ne sont pas enregistrées tant qu'aucun taux n'est appliqué — réessayez la conversion ou
                    saisissez le taux manuellement.
                  </p>
                </div>
                {hasRetryableBatch && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetryEcb}
                    disabled={retrying || loading}
                    className="self-start"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
                    {retrying ? 'Reconversion en cours…' : 'Réessayer la conversion BCE'}
                  </Button>
                )}
              </div>
            </Alert>
          </div>
        )}

        <BrokerExportGuide open={showGuide && guideAvailable} onClose={() => setShowGuide(false)} />

        <ManualRateDialog
          open={pendingRates !== null}
          entries={pendingRates?.entries ?? []}
          onCancel={cancelManualRates}
          onConfirm={applyManualRates}
        />

        <ImportPreviewDialog
          pending={preview}
          broker={broker}
          currentLots={lots?.length ?? 0}
          currentSold={soldLots?.length ?? 0}
          currentDividends={dividendsCount}
          onCancel={cancelImport}
          onConfirm={confirmImport}
        />

        <ClearConfirmDialog
          target={confirmClearAll ? 'all' : null}
          broker={broker}
          recap={[
            lots && lots.length > 0
              ? `${lots.length.toLocaleString('fr-FR')} lot${lots.length > 1 ? 's' : ''} ouvert${lots.length > 1 ? 's' : ''}`
              : null,
            soldLots && soldLots.length > 0
              ? `${soldLots.length.toLocaleString('fr-FR')} vente${soldLots.length > 1 ? 's' : ''}`
              : null,
            dividendsCount > 0
              ? `${dividendsCount.toLocaleString('fr-FR')} évènement${dividendsCount > 1 ? 's' : ''} de dividende`
              : null,
            `${importedFiles.length.toLocaleString('fr-FR')} fichier${importedFiles.length > 1 ? 's' : ''} importé${importedFiles.length > 1 ? 's' : ''}`,
          ].filter((x): x is string => x !== null)}
          onCancel={() => setConfirmClearAll(false)}
          onConfirm={() => {
            setConfirmClearAll(false);
            handleClear();
          }}
        />
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-end gap-2">{clearButton}{helpButton}</div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Importer l{'\u2019'}export {brokerLabel(broker)}
            </CardTitle>
            <CardDescription>
              {isAutoDetect
                ? <>Déposez le ou les fichiers issus de l{'\u2019'}export Morgan Stanley (CSV ou XLSX). Positions et ventes sont détectées automatiquement.</>
                : <>Glissez-déposez votre fichier d{'\u2019'}export CSV {brokerLabel(broker)} ou cliquez pour sélectionner.</>}
            </CardDescription>
          </div>
          {helpButton}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
});
