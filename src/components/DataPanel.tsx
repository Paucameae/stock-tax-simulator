import { Database } from 'lucide-react';
import { StockExportImporter } from './StockExportImporter';
import { DividendsImporter } from './DividendsImporter';
import type { AppSettings, GrantInfo } from '../lib/types';
import type { DividendEvent, CashInterestEvent } from '../lib/transaction-parser';

interface DataPanelProps {
  settings: AppSettings;
  grants: GrantInfo[];
  onGrantsChange: (grants: GrantInfo[]) => void;
  dividends: DividendEvent[];
  cashInterest: CashInterestEvent[];
  onDividendsChange: (p: { dividends: DividendEvent[]; cashInterest: CashInterestEvent[] }) => void;
  onDefaultPlanTypeChange: (v: AppSettings['defaultPlanType']) => void;
}

/**
 * Data hub focused on broker / employer imports (Microsoft StockExport,
 * Fidelity transaction history). Tax notice PDF and backup/restore live in
 * Settings since they are about configuring the app itself rather than
 * importing external stock/dividend data.
 */
export function DataPanel({
  settings,
  grants,
  onGrantsChange,
  dividends,
  cashInterest,
  onDividendsChange,
  onDefaultPlanTypeChange,
}: DataPanelProps) {
  return (
    <div className="space-y-6 max-w-2xl pb-6">
      <header className="flex items-start gap-3">
        <Database className="h-5 w-5 text-primary mt-1 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold">Mes données</h2>
          <p className="text-sm text-gray-600">
            Importez vos fichiers Microsoft (StockExport) et Fidelity (historique des
            transactions) pour enrichir votre portefeuille et suivre vos dividendes.
          </p>
        </div>
      </header>

      <StockExportImporter
        grants={grants}
        onGrantsChange={onGrantsChange}
        defaultPlanType={settings.defaultPlanType}
        onDefaultPlanTypeChange={onDefaultPlanTypeChange}
      />
      <DividendsImporter
        dividends={dividends}
        cashInterest={cashInterest}
        onDividendsChange={onDividendsChange}
      />
    </div>
  );
}
