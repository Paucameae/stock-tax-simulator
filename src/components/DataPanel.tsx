import { Database, Award, Building2 } from 'lucide-react';
import { CsvImporter } from './CsvImporter';
import { StockExportImporter } from './StockExportImporter';
import { DividendsImporter } from './DividendsImporter';
import { DividendsSummary } from './DividendsSummary';
import { brokerLabel, brokerBadgeClass } from '../lib/utils';
import type { AppSettings, Broker, GrantInfo, StockLot, SoldLot } from '../lib/types';
import type { DividendEvent, CashInterestEvent } from '../lib/transaction-parser';

interface DataPanelProps {
  settings: AppSettings;
  grants: GrantInfo[];
  onGrantsChange: (grants: GrantInfo[]) => void;
  dividends: DividendEvent[];
  cashInterest: CashInterestEvent[];
  onDividendsChange: (p: { dividends: DividendEvent[]; cashInterest: CashInterestEvent[] }) => void;
  /** Merge dividends extracted from a Morgan Stanley activity report (replaces the MS subset only). */
  onImportMsDividends: (dividends: DividendEvent[]) => void;
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

/** Top-level section heading. */
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

interface BrokerSectionProps {
  broker: Broker;
  description: string;
  children: React.ReactNode;
}

/** Sub-section grouping all imports for a single broker. */
function BrokerSection({ broker, description, children }: BrokerSectionProps) {
  return (
    <div className={`rounded-xl border ${brokerBadgeClass(broker)} bg-white p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4" />
        <h4 className="text-sm font-semibold uppercase tracking-wide">
          {brokerLabel(broker)}
        </h4>
      </div>
      <p className="text-xs text-gray-600 -mt-1">{description}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

interface SubLabelProps {
  label: string;
}

function SubLabel({ label }: SubLabelProps) {
  return (
    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
      {label}
    </div>
  );
}

/**
 * Data hub for broker / employer imports. Organised so that each courtier
 * has its own self-contained section: re-importing one courtier never
 * affects data already loaded from another.
 *
 *   1. Attributions & vesting (Microsoft StockExport, employer-wide and
 *      transverse to courtiers).
 *   2. Mes données par courtier — one card per courtier, grouping that
 *      courtier's positions, sales and dividends.
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
  onImportMsDividends,
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
            Importez les fichiers nécessaires à votre déclaration. Chaque
            courtier a sa propre section{'\u00A0'}: vous pouvez les combiner
            librement, l'agrégation (positions, ventes, dividendes) se fait
            automatiquement.
          </p>
        </div>
      </header>

      {/* 1. Grants & vesting (transverse) */}
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

      {/* 2. Per-broker data */}
      <section className="space-y-3">
        <SectionHeader
          step={2}
          icon={<Building2 className="h-5 w-5" />}
          title="Mes données par courtier"
          description="Importez positions, ventes et dividendes depuis chacun de vos courtiers. Re-importer un courtier ne touche pas aux données déjà chargées des autres."
        />

        <BrokerSection
          broker="fidelity"
          description="Trois fichiers distincts : positions (snapshot du portefeuille), ventes (réalisations de l'année), et historique des transactions (dividendes & intérêts)."
        >
          <div className="space-y-2">
            <SubLabel label="Positions & ventes" />
            <CsvImporter broker="fidelity" onImport={onImportLots} onImportSales={onImportSales} />
          </div>
          <div className="space-y-2">
            <SubLabel label="Dividendes & intérêts" />
            <DividendsImporter
              broker="fidelity"
              dividends={dividends.filter((d) => d.broker === 'fidelity')}
              cashInterest={cashInterest.filter((c) => c.broker === 'fidelity')}
              onDividendsChange={onDividendsChange}
            />
          </div>
        </BrokerSection>

        <BrokerSection
          broker="morgan_stanley"
          description="Un seul rapport « Participant Share Sales Report » (XLSX ou CSV) regroupe positions, ventes et dividendes réinvestis (DRIP)."
        >
          <div className="space-y-2">
            <SubLabel label="Rapport d'activité" />
            <CsvImporter
              broker="morgan_stanley"
              onImport={onImportLots}
              onImportSales={onImportSales}
              onImportDividends={onImportMsDividends}
            />
          </div>
          <div className="space-y-2">
            <SubLabel label="Dividendes réinvestis (DRIP)" />
            {dividends.some((d) => d.broker === 'morgan_stanley') ? (
              <DividendsSummary
                dividends={dividends.filter((d) => d.broker === 'morgan_stanley')}
                footnote={
                  <>
                    Hypothèse retenue{'\u00A0'}: la colonne «{'\u00A0'}Cash{'\u00A0'}»
                    du rapport est nette de la retenue à la source US de
                    15{'\u00A0'}%, le brut et le crédit d'impôt conventionnel
                    sont reconstruits en conséquence.
                  </>
                }
              />
            ) : (
              <p className="text-xs text-gray-500 leading-relaxed">
                Importez le rapport ci-dessus pour extraire automatiquement les
                dividendes réinvestis. Hypothèse retenue{'\u00A0'}: la colonne «{'\u00A0'}Cash{'\u00A0'}»
                est nette de la retenue à la source US de 15{'\u00A0'}%.
              </p>
            )}
          </div>
        </BrokerSection>
      </section>
    </div>
  );
}
