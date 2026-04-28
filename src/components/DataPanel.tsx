import { Database, Building2 } from 'lucide-react';
import { CsvImporter } from './CsvImporter';
import { StockExportImporter } from './StockExportImporter';
import { DividendsImporter } from './DividendsImporter';
import { brokerLabel } from '../lib/utils';
import type { AppSettings, Broker, GrantInfo, StockLot, SoldLot } from '../lib/types';
import type { DividendEvent, CashInterestEvent } from '../lib/transaction-parser';

interface DataPanelProps {
  settings: AppSettings;
  grants: GrantInfo[];
  onGrantsChange: (grants: GrantInfo[]) => void;
  dividends: DividendEvent[];
  cashInterest: CashInterestEvent[];
  onDividendsChange: (p: { dividends: DividendEvent[]; cashInterest: CashInterestEvent[] }) => void;
  onDefaultPlanTypeChange: (v: AppSettings['defaultPlanType']) => void;
  onImportLots: (lots: StockLot[]) => void;
  onImportSales: (soldLots: SoldLot[]) => void;
}

interface BrokerSectionHeaderProps {
  broker: Broker;
}

function BrokerSectionHeader({ broker }: BrokerSectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 mt-2 mb-1">
      <Building2 className="h-4 w-4 text-gray-500" />
      <h3 className="text-sm font-semibold text-gray-800">{brokerLabel(broker)}</h3>
    </div>
  );
}

/**
 * Data hub for broker / employer imports. Organised top-down:
 *   1. Microsoft StockExport (grants metadata, used to reconcile lot origins).
 *   2. Per-broker imports (positions / sales / transactions). Fidelity supports
 *      CSV positions/sales + transactions (dividends). Morgan Stanley supports
 *      its "Holdings by Lot" CSV (positions) and "Participant Share Sales
 *      Report" CSV/XLSX (sales).
 *
 * Tax notice PDF and backup/restore live in Settings since they configure
 * the app itself rather than import external broker data.
 */
export function DataPanel({
  settings,
  grants,
  onGrantsChange,
  dividends,
  cashInterest,
  onDividendsChange,
  onDefaultPlanTypeChange,
  onImportLots,
  onImportSales,
}: DataPanelProps) {
  return (
    <div className="space-y-6 max-w-2xl pb-6">
      <header className="flex items-start gap-3">
        <Database className="h-5 w-5 text-primary mt-1 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold">Mes données</h2>
          <p className="text-sm text-gray-600">
            Importez vos fichiers Microsoft (StockExport) et de vos courtiers
            (positions, ventes, transactions). Vous pouvez combiner plusieurs
            courtiers : votre portefeuille et votre déclaration agrègent
            automatiquement toutes les sources.
          </p>
        </div>
      </header>

      <StockExportImporter
        grants={grants}
        onGrantsChange={onGrantsChange}
        defaultPlanType={settings.defaultPlanType}
        onDefaultPlanTypeChange={onDefaultPlanTypeChange}
      />

      <BrokerSectionHeader broker="fidelity" />
      <CsvImporter broker="fidelity" onImport={onImportLots} onImportSales={onImportSales} />
      <DividendsImporter
        broker="fidelity"
        dividends={dividends}
        cashInterest={cashInterest}
        onDividendsChange={onDividendsChange}
      />

      <BrokerSectionHeader broker="morgan_stanley" />
      <CsvImporter broker="morgan_stanley" onImport={onImportLots} onImportSales={onImportSales} />
      <p className="text-xs text-gray-500 -mt-3 ml-1">
        Morgan Stanley n'expose pas d'historique de dividendes exploitable&nbsp;:
        l'éventuel cash en attente apparaît dans les positions et n'est pas importé.
      </p>
    </div>
  );
}
