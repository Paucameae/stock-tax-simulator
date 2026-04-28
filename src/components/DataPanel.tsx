import { Database, Award, Briefcase, Coins, Lock, Building2 } from 'lucide-react';
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

interface SectionHeaderProps {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}

/** Top-level section heading. Sections group imports by *type of data*. */
function SectionHeader({ step, icon, title, description }: SectionHeaderProps) {
  return (
    <div className="flex items-start gap-3 pt-4 first:pt-0">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-base font-semibold text-gray-900 leading-tight">
          <span className="text-gray-400 mr-1.5">{step}.</span>
          {title}
        </h3>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
  );
}

interface BrokerSubheaderProps {
  broker: Broker;
}

/** Subheading inside a section to identify the broker source of an importer. */
function BrokerSubheader({ broker }: BrokerSubheaderProps) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <Building2 className="h-3.5 w-3.5 text-gray-400" />
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {brokerLabel(broker)}
      </span>
    </div>
  );
}

/**
 * Data hub for broker / employer imports. Organised by type of data rather
 * than by broker, mirroring the French tax declaration structure:
 *
 *   1. Grants & vesting (Microsoft StockExport) — needed for plan-type
 *      classification and to project future vesting income.
 *   2. Mes actions — open positions and realised sales, agnostic of broker.
 *      Fidelity exports them as two distinct files (positions vs sales,
 *      hence the toggle); Morgan Stanley bundles both in a single export
 *      and is auto-detected.
 *   3. Dividendes & intérêts — Fidelity transaction history. Morgan Stanley
 *      does not currently expose a usable history.
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
            Importez les fichiers nécessaires à votre déclaration. Les sections
            ci-dessous suivent la structure de la déclaration : attributions,
            actions (positions et ventes), puis revenus de capitaux mobiliers.
            Vous pouvez combiner plusieurs courtiers : tout est agrégé
            automatiquement.
          </p>
        </div>
      </header>

      {/* 1. Grants & vesting */}
      <section className="space-y-3">
        <SectionHeader
          step={1}
          icon={<Award className="h-5 w-5" />}
          title="Attributions & vesting"
          description="Métadonnées d'attribution exportées par Microsoft (plan, date, calendrier de vesting). Indispensable pour classer vos lots et projeter les vestings à venir."
        />
        <StockExportImporter
          grants={grants}
          onGrantsChange={onGrantsChange}
          defaultPlanType={settings.defaultPlanType}
          onDefaultPlanTypeChange={onDefaultPlanTypeChange}
        />
      </section>

      {/* 2. Mes actions */}
      <section className="space-y-3">
        <SectionHeader
          step={2}
          icon={<Briefcase className="h-5 w-5" />}
          title="Mes actions"
          description="Positions ouvertes (pour simuler une vente) et ventes effectuées (pour calculer l'impôt et déclarer). Importez depuis chacun de vos courtiers ; les données sont agrégées."
        />
        <div className="space-y-3">
          <BrokerSubheader broker="fidelity" />
          <CsvImporter broker="fidelity" onImport={onImportLots} onImportSales={onImportSales} />
        </div>
        <div className="space-y-3">
          <BrokerSubheader broker="morgan_stanley" />
          <CsvImporter broker="morgan_stanley" onImport={onImportLots} onImportSales={onImportSales} />
        </div>
      </section>

      {/* 3. Dividendes & intérêts */}
      <section className="space-y-3">
        <SectionHeader
          step={3}
          icon={<Coins className="h-5 w-5" />}
          title="Dividendes & intérêts"
          description="Revenus de capitaux mobiliers à reporter en cases 2DC, 2AB et 2BH. Récupérés depuis l'historique des transactions du courtier."
        />
        <div className="space-y-3">
          <BrokerSubheader broker="fidelity" />
          <DividendsImporter
            broker="fidelity"
            dividends={dividends}
            cashInterest={cashInterest}
            onDividendsChange={onDividendsChange}
          />
        </div>
        <div className="space-y-3">
          <BrokerSubheader broker="morgan_stanley" />
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 flex items-start gap-2.5">
            <Lock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
            <p>
              <span className="font-medium text-gray-800">Non disponible.</span>{' '}
              Morgan Stanley n'expose pas d'historique de dividendes exploitable&nbsp;:
              l'éventuel cash en attente apparaît directement dans les positions.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
