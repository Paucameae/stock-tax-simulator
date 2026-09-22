import React from 'react';
import { BookOpen, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Tab } from '../lib/tabs';

export interface TabDescriptor {
  id: Tab;
  step: number;
  label: string;
  icon: LucideIcon;
  /** Renders a green tick instead of the step number once the step is fulfilled. */
  done: boolean;
}

/** Title, legal disclaimer and the step tablist driving the whole workflow. */
export function AppHeader({
  tabs,
  activeTab,
  onSelectTab,
  onShowRules,
  taxDataVerifiedOn,
}: {
  tabs: TabDescriptor[];
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  onShowRules: () => void;
  taxDataVerifiedOn: string;
}) {
  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const offsets: Record<string, number | 'first' | 'last'> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: 'first',
      End: 'last',
    };
    const move = offsets[e.key];
    if (move === undefined) return;
    e.preventDefault();
    const next =
      move === 'first' ? 0
      : move === 'last' ? tabs.length - 1
      : (index + move + tabs.length) % tabs.length;
    onSelectTab(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  };

  return (
    <>
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
            <span
              className="text-xs text-gray-400"
              title="Date du dernier recoupement des barèmes, seuils et numéros de case avec impots.gouv.fr."
            >
              Données fiscales vérifiées le {taxDataVerifiedOn}
            </span>
          </div>
        </div>
      </header>

      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-7xl mx-auto px-4 py-2 text-xs text-amber-700">
          ⚠️ Cet outil est un simulateur indicatif. Il ne constitue pas un conseil fiscal. Consultez un conseiller fiscal ou référez-vous aux instructions de KPMG Avocats fournies par votre employeur.
        </div>
      </div>

      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex items-center gap-1 overflow-x-auto">
            <div role="tablist" aria-label="Étapes de la déclaration" className="flex items-center gap-1">
              {tabs.map((tab, index) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => onSelectTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, index)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isActive
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    {tab.done && !isActive ? (
                      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-green-100 text-green-600 shrink-0">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        <span className="sr-only">Étape {tab.step}, terminée :</span>
                      </span>
                    ) : (
                      <span
                        className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 ${
                          isActive
                            ? 'bg-primary text-white'
                            : 'bg-gray-200 text-gray-500'
                        }`}
                        aria-hidden="true"
                      >
                        {tab.step}
                      </span>
                    )}
                    <Icon className="h-4 w-4 sm:hidden" aria-hidden="true" />
                    {/* The label is icon-only below `sm`, so name the tab explicitly. */}
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sr-only sm:hidden">{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="ml-auto">
              <button
                onClick={onShowRules}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-primary transition-colors whitespace-nowrap"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Règles fiscales</span>
              </button>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
