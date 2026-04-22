import { Database } from 'lucide-react';
import { StockExportImporter } from './StockExportImporter';
import { DividendsImporter } from './DividendsImporter';
import { TaxNoticeImporter } from './TaxNoticeImporter';
import { BackupPanel } from './BackupPanel';
import type { AppSettings, GrantInfo, StockLot, SoldLot, SavedSimulation } from '../lib/types';
import type { DividendEvent, CashInterestEvent } from '../lib/transaction-parser';
import type { ImportResult } from '../lib/backup';

interface DataPanelProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  defaults: AppSettings;
  grants: GrantInfo[];
  onGrantsChange: (grants: GrantInfo[]) => void;
  dividends: DividendEvent[];
  cashInterest: CashInterestEvent[];
  onDividendsChange: (p: { dividends: DividendEvent[]; cashInterest: CashInterestEvent[] }) => void;
  lots: StockLot[];
  soldLots: SoldLot[];
  savedSimulations: SavedSimulation[];
  onBackupImport: (result: ImportResult) => void;
  onDefaultPlanTypeChange: (v: AppSettings['defaultPlanType']) => void;
}

/**
 * Data hub: groups every file-based import (Microsoft StockExport, Fidelity
 * transaction history, tax notice PDF) and the backup/restore controls.
 * Separated from fiscal Settings for clearer user mental model: data in, then
 * tune the tax-related knobs next door.
 */
export function DataPanel({
  settings,
  onSettingsChange,
  defaults,
  grants,
  onGrantsChange,
  dividends,
  cashInterest,
  onDividendsChange,
  lots,
  soldLots,
  savedSimulations,
  onBackupImport,
  onDefaultPlanTypeChange,
}: DataPanelProps) {
  return (
    <div className="space-y-6 max-w-2xl pb-6">
      <header className="flex items-start gap-3">
        <Database className="h-5 w-5 text-primary mt-1 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold">Mes données</h2>
          <p className="text-sm text-gray-600">
            Importez vos fichiers Microsoft / Fidelity, pré-remplissez vos paramètres depuis
            votre avis d'imposition, et gérez la sauvegarde de toutes vos données locales.
          </p>
        </div>
      </header>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Données Microsoft / Fidelity
        </h3>
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
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Avis d'imposition
        </h3>
        <TaxNoticeImporter settings={settings} onSettingsChange={onSettingsChange} />
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Sauvegarde et restauration
        </h3>
        <BackupPanel
          current={{ settings, lots, soldLots, savedSimulations }}
          defaults={defaults}
          onImport={onBackupImport}
        />
      </section>
    </div>
  );
}
