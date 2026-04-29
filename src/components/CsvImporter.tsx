import React, { useCallback } from 'react';
import { Upload, FileText, RefreshCw, ShoppingCart, DollarSign, HelpCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { parseCsvFile, parseSalesCsvFile } from '../lib/csv-parser';
import { parseMsHoldingsCsv, parseMsSalesCsv, parseMsActivityXlsx } from '../lib/brokers/morgan-stanley';
import { useEcbConversion } from '../hooks/useEcbConversion';
import { BrokerExportGuide } from './guides/BrokerExportGuide';
import { brokerLabel } from '../lib/utils';
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

export const CsvImporter = React.memo(function CsvImporter({ broker = 'fidelity', onImport, onImportSales, onImportDividends, onClear, embedded = false }: CsvImporterProps) {
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
