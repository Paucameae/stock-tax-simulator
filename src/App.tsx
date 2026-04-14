import React from 'react';
import { Briefcase, Calculator, FileText, Settings as SettingsIcon, AlertTriangle, RefreshCw, Loader2, Check, Upload } from 'lucide-react';
import { CsvImporter } from './components/CsvImporter';
import { SaleSimulator } from './components/SaleSimulator';
import { TaxCalculator } from './components/TaxCalculator';
import { DeclarationGuide } from './components/DeclarationGuide';
import { PfuVsBaremeComparator } from './components/PfuVsBaremeComparator';
import { runSimulation } from './lib/tax-engine';
import { loadVersionedSettings } from './lib/storage';
import type { StockLot, SaleLotEntry, AppSettings, TaxSimulationResult, TaxMode, SavedSimulation } from './lib/types';
import { generateId } from './lib/utils';

// Lazy-load heavy components (pdfjs-dist via Settings, recharts via Portfolio)
const Portfolio = React.lazy(() =>
  import('./components/Portfolio').then((m) => ({ default: m.Portfolio }))
);
const Settings = React.lazy(() =>
  import('./components/Settings').then((m) => ({ default: m.Settings }))
);

function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin mr-2" />
      Chargement…
    </div>
  );
}

const DEFAULT_SETTINGS: AppSettings = {
  fiscalYear: new Date().getFullYear() - 1,
  familyStatus: 'single',
  numberOfChildren: 0,
  taxShares: 1,
  taxSharesManual: false,
  otherTaxableIncome: 0,
  defaultPlanType: 'qualified_macron',
  priorLosses: 0,
};

type Tab = 'portfolio' | 'simulator' | 'declaration' | 'settings';

function isSettingsConfigured(s: AppSettings, defaults: AppSettings): boolean {
  return s.otherTaxableIncome !== defaults.otherTaxableIncome
    || s.taxShares !== defaults.taxShares
    || s.familyStatus !== defaults.familyStatus
    || s.numberOfChildren !== defaults.numberOfChildren;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
            <h2 className="text-lg font-bold text-gray-900">Une erreur est survenue</h2>
            <p className="text-sm text-gray-600">
              L'application a rencontré un problème inattendu. Vos données sont sauvegardées dans le navigateur.
            </p>
            <pre className="text-xs text-left bg-red-50 text-red-700 p-3 rounded-lg overflow-auto max-h-32">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [activeTab, setActiveTab] = React.useState<Tab>(() => {
    const saved = loadVersionedSettings('appSettings', DEFAULT_SETTINGS);
    return isSettingsConfigured(saved, DEFAULT_SETTINGS) ? 'portfolio' : 'settings';
  });
  const [lots, setLots] = React.useState<StockLot[]>([]);
  const [saleEntries, setSaleEntries] = React.useState<SaleLotEntry[]>([]);
  const [taxMode, setTaxMode] = React.useState<TaxMode>('pfu');
  const [result, setResult] = React.useState<TaxSimulationResult | null>(null);
  const [settings, setSettings] = React.useState<AppSettings>(() => {
    return loadVersionedSettings('appSettings', DEFAULT_SETTINGS);
  });
  const [savedSimulations, setSavedSimulations] = React.useState<SavedSimulation[]>(() => {
    try {
      const saved = localStorage.getItem('savedSimulations');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleImport = React.useCallback((importedLots: StockLot[]) => {
    try {
      const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') || '{}');
      const lotsWithOverrides = importedLots.map((lot) => {
        if (lot.origin === 'DO' && overrides[lot.id]) {
          return { ...lot, planType: overrides[lot.id] };
        }
        if (lot.origin === 'DO') {
          return { ...lot, planType: settings.defaultPlanType === 'non_qualified' ? 'non_qualified' as const : 'qualified_macron' as const };
        }
        return lot;
      });
      setLots(lotsWithOverrides);
    } catch {
      setLots(importedLots);
    }
  }, [settings.defaultPlanType]);

  const handleSimulate = React.useCallback((entries: SaleLotEntry[]) => {
    setSaleEntries(entries);
    const simulation = {
      lots: entries,
      taxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: settings.fiscalYear,
    };
    const res = runSimulation(simulation);
    setResult(res);

    const saved: SavedSimulation = {
      id: generateId(),
      date: new Date().toISOString(),
      name: `Simulation du ${new Date().toLocaleDateString('fr-FR')}`,
      result: res,
      settings,
      lots: entries,
    };
    const updatedSimulations = [saved, ...savedSimulations].slice(0, 20);
    setSavedSimulations(updatedSimulations);
    localStorage.setItem('savedSimulations', JSON.stringify(updatedSimulations));

    setActiveTab('simulator');
  }, [taxMode, settings, savedSimulations]);

  const handleTaxModeChange = React.useCallback((mode: TaxMode) => {
    setTaxMode(mode);
    if (saleEntries.length > 0) {
      const simulation = {
        lots: saleEntries,
        taxMode: mode,
        otherTaxableIncome: settings.otherTaxableIncome,
        taxShares: settings.taxShares,
        familyStatus: settings.familyStatus,
        priorLosses: settings.priorLosses,
        fiscalYear: settings.fiscalYear,
      };
      setResult(runSimulation(simulation));
    }
  }, [saleEntries, settings]);

  const settingsDone = isSettingsConfigured(settings, DEFAULT_SETTINGS);
  const portfolioDone = lots.length > 0;
  const simulationDone = result !== null;

  const tabs = [
    { id: 'settings' as const, step: 1, label: 'Paramètres', icon: SettingsIcon, done: settingsDone },
    { id: 'portfolio' as const, step: 2, label: 'Mon portefeuille', icon: Briefcase, done: portfolioDone },
    { id: 'simulator' as const, step: 3, label: 'Simuler une vente', icon: Calculator, done: simulationDone },
    { id: 'declaration' as const, step: 4, label: 'Ma déclaration', icon: FileText, done: simulationDone },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Simulateur fiscal — Actions Microsoft
              </h1>
              <p className="text-sm text-gray-500">
                Calculez vos impôts sur la vente d'actions MSFT acquises via ESPP et Stock Awards
              </p>
            </div>
            <span className="text-xs text-gray-400">
              Année fiscale {settings.fiscalYear}
            </span>
          </div>
        </div>
      </header>

      {/* Disclaimer banner */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-7xl mx-auto px-4 py-2 text-xs text-amber-700">
          ⚠️ Cet outil est un simulateur indicatif. Il ne constitue pas un conseil fiscal. Consultez un conseiller fiscal ou référez-vous aux instructions de KPMG Avocats fournies par votre employeur.
        </div>
      </div>

      {/* Navigation tabs with workflow indicators */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  {tab.done && !isActive ? (
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-green-100 text-green-600 shrink-0">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <span
                      className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {tab.step}
                    </span>
                  )}
                  <Icon className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div hidden={activeTab !== 'portfolio'}>
          <div className="space-y-6">
            {!settingsDone && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3 text-sm">
                <SettingsIcon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-blue-800">
                    <strong>Conseil :</strong> configurez d'abord vos paramètres fiscaux (situation familiale, revenus, parts) pour des calculs précis.
                  </p>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="mt-2 inline-flex items-center gap-1 text-primary font-medium hover:underline"
                  >
                    Configurer mes paramètres →
                  </button>
                </div>
              </div>
            )}
            <CsvImporter onImport={handleImport} />
            {lots.length > 0 && (
              <React.Suspense fallback={<LazyFallback />}>
                <Portfolio lots={lots} onLotsChange={setLots} />
              </React.Suspense>
            )}
          </div>
        </div>

        <div hidden={activeTab !== 'simulator'}>
          <div className="space-y-6">
            {lots.length === 0 ? (
              <div className="text-center py-16">
                <Briefcase className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-600 font-medium">Aucun portefeuille importé</p>
                <p className="text-sm text-gray-500 mt-1 mb-4">
                  Importez votre fichier CSV Morgan Stanley pour commencer une simulation de vente.
                </p>
                <button
                  onClick={() => setActiveTab('portfolio')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Importer mon portefeuille
                </button>
              </div>
            ) : (
              <>
                <SaleSimulator lots={lots} settings={settings} onSimulate={handleSimulate} />
                <TaxCalculator result={result} taxMode={taxMode} onTaxModeChange={handleTaxModeChange} fiscalYear={settings.fiscalYear} />
                {saleEntries.length > 0 && (
                  <>
                    <PfuVsBaremeComparator lots={saleEntries} settings={settings} />
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div hidden={activeTab !== 'declaration'}>
          {result ? (
            <DeclarationGuide result={result} lots={saleEntries} fiscalYear={settings.fiscalYear} />
          ) : (
            <div className="text-center py-16">
              <Calculator className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-600 font-medium">Aucune simulation effectuée</p>
              <p className="text-sm text-gray-500 mt-1 mb-4">
                {lots.length === 0
                  ? 'Importez votre portefeuille puis lancez une simulation pour obtenir les instructions de déclaration.'
                  : 'Lancez une simulation de vente pour obtenir les formulaires et montants à déclarer.'
                }
              </p>
              <button
                onClick={() => setActiveTab(lots.length === 0 ? 'portfolio' : 'simulator')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
              >
                {lots.length === 0 ? (
                  <>
                    <Upload className="h-4 w-4" />
                    Importer mon portefeuille
                  </>
                ) : (
                  <>
                    <Calculator className="h-4 w-4" />
                    Simuler une vente
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div hidden={activeTab !== 'settings'}>
          <React.Suspense fallback={<LazyFallback />}>
            <Settings settings={settings} onSettingsChange={setSettings} />
          </React.Suspense>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-gray-400">
          ⚠️ Cet outil est un simulateur indicatif. Il ne constitue pas un conseil fiscal. Les calculs sont basés sur la législation fiscale française en vigueur et peuvent évoluer. Pour votre déclaration officielle, consultez un conseiller fiscal ou référez-vous aux instructions de KPMG Avocats fournies par votre employeur.
        </div>
      </footer>
    </div>
  );
}

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
