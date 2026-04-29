import React from 'react';
import { Upload, RefreshCw, Trash2, AlertTriangle, Coins, HelpCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Alert } from './ui/alert';
import { BrokerExportGuide } from './guides/BrokerExportGuide';
import { transactionHistoryGuide } from './guides/transaction-history-steps';
import { DividendsSummary } from './DividendsSummary';
import { parseTransactionHistoryCsv, type DividendEvent, type CashInterestEvent } from '../lib/transaction-parser';
import { brokerLabel } from '../lib/utils';
import type { Broker } from '../lib/types';

interface DividendsImporterProps {
  /** Broker the transactions CSV is being imported from. Defaults to Fidelity. */
  broker?: Broker;
  dividends: DividendEvent[];
  cashInterest: CashInterestEvent[];
  onDividendsChange: (payload: { dividends: DividendEvent[]; cashInterest: CashInterestEvent[] }) => void;
}

/**
 * Import panel for the broker's Transaction History CSV. Currently only the
 * Fidelity format is parsed; other brokers will plug in via a registry in lot 3.
 * Extracts MSFT dividends + US withholding tax; interest from the cash sweep is
 * surfaced separately. Fail-soft: errors are displayed inline, existing data is
 * left untouched.
 */
export function DividendsImporter({ broker = 'fidelity', dividends, cashInterest, onDividendsChange }: DividendsImporterProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [showGuide, setShowGuide] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setWarnings([]);
    setFileName(file.name);
    setLoading(true);
    try {
      const content = await file.text();
      const parsed = parseTransactionHistoryCsv(content);
      if (parsed.dividends.length === 0 && parsed.cashInterest.length === 0) {
        setError(`Aucun dividende reconnu dans ce fichier. Vérifiez qu'il s'agit bien d'un historique des transactions ${brokerLabel(broker)}.`);
        return;
      }
      // Persistence is handled by the parent via onDividendsChange so that
      // the merged multi-broker state stays consistent.
      onDividendsChange({ dividends: parsed.dividends, cashInterest: parsed.cashInterest });
      setWarnings(parsed.warnings);
    } catch (err) {
      setError('Impossible de lire le fichier : ' + (err as Error).message);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleClear = () => {
    onDividendsChange({ dividends: [], cashInterest: [] });
    setFileName(null);
    setWarnings([]);
    setError(null);
  };

  return (
    <Card>
      <CardContent className="pt-5 pb-4 space-y-4">
        <div className="flex items-start gap-3">
          <Coins className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm text-gray-600">
            <p>
              Importez votre <strong>historique des transactions {brokerLabel(broker)}</strong> (CSV) pour extraire
              vos dividendes MSFT et la retenue à la source US. Indispensable pour pré-remplir les cases
              <strong> 2DC / 2AB / 2BH</strong> de la déclaration.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Sans cet import, les dividendes ne sont pas suivis. Exporter <strong>l'année civile complète</strong>
              (par exemple 2025 entière pour la déclaration 2026) pour obtenir des totaux corrects.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {loading ? 'Analyse…' : 'Choisir un fichier'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGuide(true)}
            className="gap-1.5"
            aria-label="Afficher le guide d'export de l'historique des transactions"
          >
            <HelpCircle className="h-4 w-4" />
            Comment l'exporter ?
          </Button>
          {dividends.length + cashInterest.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="gap-1.5 text-red-600 hover:text-red-700 ml-auto"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </Button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFile}
        />

        <BrokerExportGuide
          open={showGuide}
          onClose={() => setShowGuide(false)}
          guides={[transactionHistoryGuide]}
          title="Comment exporter votre historique des transactions"
        />

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {dividends.length > 0 && !error && (
          <DividendsSummary
            dividends={dividends}
            cashInterest={cashInterest}
            fileName={fileName}
          />
        )}

        {warnings.length > 0 && (
          <Alert>
            <div className="space-y-1">
              <p className="font-medium">Avertissements à la lecture du fichier :</p>
              <ul className="list-disc ml-5 text-xs">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
