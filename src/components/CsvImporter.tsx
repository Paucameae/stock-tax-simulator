import React, { useCallback } from 'react';
import { Upload, FileText, RefreshCw, ShoppingCart, DollarSign, HelpCircle, CheckCircle2, Trash2, Layers, TrendingUp } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { parseCsvFile, parseSalesCsvFile } from '../lib/csv-parser';
import { parseMsHoldingsCsv, parseMsSalesCsv, parseMsActivityXlsx } from '../lib/brokers/morgan-stanley';
import { useEcbConversion } from '../hooks/useEcbConversion';
import { BrokerExportGuide } from './guides/BrokerExportGuide';
import { brokerLabel, formatEUR, formatUSD, originLabel } from '../lib/utils';
import type { Broker, StockLot, SoldLot } from '../lib/types';
import type { DividendEvent } from '../lib/transaction-parser';

type ImportMode = 'positions' | 'sales';
type FileKind = 'positions' | 'sales' | 'activity';

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
   * When rendered inside a BrokerSection card, set this to true to drop the
   * outer Card wrapper and the redundant "Importer l'export ..." title.
   * The broker identity is already given by the parent section.
   */
  embedded?: boolean;
}

/**
 * Inspect the first few lines of a CSV to decide whether it is a Morgan
 * Stanley "Holdings by Lot" file or a "Share Sales" file. Returns null when
 * the format is not recognised.
 */
function detectMsCsvKind(text: string): FileKind | null {
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

interface ImportedFile {
  name: string;
  kind: FileKind;
  /** Optional human-readable summary appended to the kind tag (e.g. "30 positions, 12 ventes, 8 dividendes"). */
  summary?: string;
}

interface SummaryProps {
  broker: Broker;
  lots?: StockLot[];
  soldLots?: SoldLot[];
  dividendsCount: number;
  dividendsGrossUsd: number;
}

/**
 * Aggregated, persistence-backed summary of what is currently loaded for a
 * given broker. Mirrors the StockExport importer's success card so all four
 * "Mes données" blocks expose the same kind of post-import feedback. Hides
 * itself when no data is loaded.
 */
function BrokerImportSummary({ broker, lots, soldLots, dividendsCount, dividendsGrossUsd }: SummaryProps) {
  const hasLots = !!(lots && lots.length > 0);
  const hasSales = !!(soldLots && soldLots.length > 0);
  const hasDividends = dividendsCount > 0;
  if (!hasLots && !hasSales && !hasDividends) return null;

  const lotsTotalShares = hasLots ? lots!.reduce((s, l) => s + l.quantity, 0) : 0;
  // Prefer EUR market value when available; fall back to USD or to cost basis
  // when the lot was imported without a market price (Morgan Stanley Holdings
  // by Lot reuses the cost basis as current value by design).
  const lotsTotalEur = hasLots
    ? lots!.reduce((s, l) => {
        if (l.currentValue && l.currentValue > 0) return s + l.currentValue;
        if (l.totalCostBasis && l.totalCostBasis > 0) return s + l.totalCostBasis;
        return s;
      }, 0)
    : 0;
  const lotsTotalUsd = hasLots
    ? lots!.reduce((s, l) => s + (l.currentValueUsd ?? l.totalCostBasisUsd ?? 0), 0)
    : 0;

  const salesQty = hasSales ? soldLots!.reduce((s, sl) => s + sl.quantity, 0) : 0;
  const salesProceedsEur = hasSales ? soldLots!.reduce((s, sl) => s + sl.proceeds, 0) : 0;
  const salesProceedsUsd = hasSales ? soldLots!.reduce((s, sl) => s + (sl.proceedsUsd ?? 0), 0) : 0;
  const salesYears = hasSales
    ? Array.from(new Set(soldLots!.map((sl) => sl.saleDate.getFullYear()))).sort((a, b) => b - a)
    : [];

  // Per-origin tally for the lot list so users see at a glance the spread
  // between Stock Awards / AGA / ESPP without scrolling to the portfolio tab.
  const originCounts = hasLots
    ? lots!.reduce<Record<string, number>>((acc, l) => {
        acc[l.origin] = (acc[l.origin] ?? 0) + l.quantity;
        return acc;
      }, {})
    : {};
  const originList = Object.entries(originCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
        <span className="font-medium text-blue-800">
          Données {brokerLabel(broker)} chargées
        </span>
      </div>

      {(hasLots || hasSales) && (
        <div className="grid grid-cols-3 gap-3 mb-3">
          {hasLots && (
            <SummaryCell
              icon={<Layers className="h-3.5 w-3.5" />}
              label={`Lot${lots!.length > 1 ? 's' : ''} ouvert${lots!.length > 1 ? 's' : ''}`}
              value={lots!.length.toLocaleString('fr-FR')}
              detail={`${lotsTotalShares.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions`}
            />
          )}
          {hasLots && (
            <SummaryCell
              icon={<DollarSign className="h-3.5 w-3.5" />}
              label="Valeur portefeuille"
              value={lotsTotalEur > 0 ? formatEUR(lotsTotalEur) : formatUSD(lotsTotalUsd)}
              detail={lotsTotalEur > 0 && lotsTotalUsd > 0 ? formatUSD(lotsTotalUsd) : undefined}
            />
          )}
          {hasSales && (
            <SummaryCell
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label={`Vente${soldLots!.length > 1 ? 's' : ''} ${salesYears.length === 1 ? salesYears[0] : ''}`}
              value={soldLots!.length.toLocaleString('fr-FR')}
              detail={
                salesProceedsEur > 0
                  ? `${formatEUR(salesProceedsEur)} · ${salesQty.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions`
                  : salesProceedsUsd > 0
                  ? `${formatUSD(salesProceedsUsd)} · ${salesQty.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions`
                  : `${salesQty.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions`
              }
            />
          )}
        </div>
      )}

      {originList.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-700 pt-2 border-t border-blue-100">
          <span className="text-gray-500">Origines :</span>
          {originList.map(([origin, qty]) => (
            <span
              key={origin}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-blue-100"
            >
              <strong>{originLabel(origin)}</strong>
              <span className="text-gray-500">·&nbsp;{qty.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</span>
            </span>
          ))}
        </div>
      )}

      {hasSales && salesYears.length > 1 && (
        <p className="mt-2 text-xs text-gray-600">
          Années couvertes : <strong>{salesYears.join(', ')}</strong>.
        </p>
      )}

      {hasDividends && (
        <p className="mt-2 text-xs text-gray-600">
          Dividendes réinvestis (DRIP) : <strong>{dividendsCount}</strong> évènement{dividendsCount > 1 ? 's' : ''}
          {dividendsGrossUsd > 0 ? <> · brut <strong>{formatUSD(dividendsGrossUsd)}</strong></> : null}.
        </p>
      )}
    </div>
  );
}

function SummaryCell({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className="bg-white rounded border border-blue-100 p-2">
      <div className="flex items-center gap-1 text-[11px] text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-base font-semibold text-gray-900 tabular-nums leading-tight mt-0.5">{value}</div>
      {detail && <div className="text-[11px] text-gray-500 tabular-nums mt-0.5">{detail}</div>}
    </div>
  );
}

export const CsvImporter = React.memo(function CsvImporter({ broker = 'fidelity', onImport, onImportSales, onImportDividends, onClear, lots, soldLots, dividendsCount = 0, dividendsGrossUsd = 0, embedded = false }: CsvImporterProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [importedFiles, setImportedFiles] = React.useState<ImportedFile[]>([]);
  const [importMode, setImportMode] = React.useState<ImportMode>('positions');
  const [showGuide, setShowGuide] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { convertLots, convertSoldLots, loading, error: ecbError } = useEcbConversion();

  // Morgan Stanley exports bundle holdings + sales in a single archive: we
  // route each dropped file by content (no positions/sales toggle).
  const isAutoDetect = broker === 'morgan_stanley';
  const accept = isAutoDetect ? '.csv,.xlsx' : '.csv';

  const readAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('Lecture impossible.'));
      r.readAsText(file, 'utf-8');
    });

  const readAsArrayBuffer = (file: File) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(new Error('Lecture impossible.'));
      r.readAsArrayBuffer(file);
    });

  const handleFiles = useCallback(
    async (files: File[]) => {
      setError(null);

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

        if (collectedLots.length > 0) {
          const { converted } = await convertLots(collectedLots);
          onImport(converted);
        }
        if (collectedSold.length > 0) {
          const { converted } = await convertSoldLots(collectedSold);
          onImportSales?.(converted);
        }
        if (collectedDividends.length > 0) {
          onImportDividends?.(collectedDividends);
        }
        setImportedFiles(processed);
      } catch (err) {
        setError('Erreur lors de la lecture du fichier : ' + (err as Error).message);
      }
    },
    [onImport, onImportSales, onImportDividends, importMode, convertLots, convertSoldLots, isAutoDetect]
  );

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
      onClick={handleClear}
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
        />

        {(error || ecbError) && (
          <p
            className="mt-3 text-sm text-red-600"
            role="alert"
            aria-live="assertive"
          >
            {error || ecbError}
          </p>
        )}

        <BrokerExportGuide open={showGuide && guideAvailable} onClose={() => setShowGuide(false)} />
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
