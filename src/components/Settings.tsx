import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Button } from './ui/button';
import { Settings as SettingsIcon, Save, AlertTriangle } from 'lucide-react';
import type { AppSettings, FamilyStatus, StockLot, SoldLot, SavedSimulation } from '../lib/types';
import { Tooltip } from './ui/tooltip';
import { saveVersionedSettings } from '../lib/storage';
import { TaxNoticeImporter } from './TaxNoticeImporter';
import { BackupPanel } from './BackupPanel';
import type { ImportResult } from '../lib/backup';

interface SettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  defaults?: AppSettings;
  lots?: StockLot[];
  soldLots?: SoldLot[];
  savedSimulations?: SavedSimulation[];
  onBackupImport?: (result: ImportResult) => void;
}

function calculateTaxShares(familyStatus: FamilyStatus, numberOfChildren: number): number {
  let shares = familyStatus === 'couple' ? 2 : 1;
  if (numberOfChildren <= 2) {
    shares += numberOfChildren * 0.5;
  } else {
    shares += 1; // 2 first children = 1
    shares += (numberOfChildren - 2) * 1; // 1 per additional child
  }
  return shares;
}

export function Settings({ settings, onSettingsChange, defaults, lots = [], soldLots = [], savedSimulations = [], onBackupImport }: SettingsProps) {
  const [local, setLocal] = React.useState(settings);
  const [saved, setSaved] = React.useState(false);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...local, ...patch };

    // Auto-calculate tax shares unless manual
    if (!next.taxSharesManual && ('familyStatus' in patch || 'numberOfChildren' in patch)) {
      next.taxShares = calculateTaxShares(next.familyStatus, next.numberOfChildren);
    }

    setLocal(next);
  };

  // Sync when settings prop changes (e.g. tax notice import from Data tab)
  React.useEffect(() => {
    setLocal(settings);
  }, [settings]);

  const handleSave = () => {
    onSettingsChange(local);
    saveVersionedSettings('appSettings', local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isDirty = JSON.stringify(local) !== JSON.stringify(settings);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-6">
      <TaxNoticeImporter settings={settings} onSettingsChange={onSettingsChange} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Paramètres fiscaux
          </CardTitle>
          <CardDescription>
            Configurez vos paramètres pour une estimation plus précise.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Section: Foyer fiscal */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Foyer fiscal</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Situation familiale</label>
                <Select
                  value={local.familyStatus}
                  onChange={(e) => update({ familyStatus: e.target.value as FamilyStatus })}
                >
                  <option value="single">Célibataire</option>
                  <option value="couple">Couple (marié / pacsé)</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Enfants à charge</label>
                <Input
                  type="number"
                  min="0"
                  max="20"
                  value={local.numberOfChildren}
                  onChange={(e) => update({ numberOfChildren: Math.max(0, parseInt(e.target.value) || 0) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parts fiscales
                  <span className="text-gray-400 font-normal ml-1 text-xs">
                    {local.taxSharesManual ? '(manuel)' : '(auto)'}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.5"
                    min="1"
                    max="30"
                    value={local.taxShares}
                    onChange={(e) => update({ taxShares: Math.max(1, parseFloat(e.target.value) || 1), taxSharesManual: true })}
                  />
                  {local.taxSharesManual && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() =>
                        update({
                          taxSharesManual: false,
                          taxShares: calculateTaxShares(local.familyStatus, local.numberOfChildren),
                        })
                      }
                    >
                      Recalculer
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Section: Revenus et reports */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Revenus et reports</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  Revenu imposable hors actions (€/an)
                  <Tooltip content="Salaires, pensions, revenus fonciers… hors plus-values mobilières. Correspond au revenu imposable de votre dernier avis d'imposition." />
                </label>
                <Input
                  type="number"
                  step="100"
                  min="0"
                  value={local.otherTaxableIncome}
                  onChange={(e) => update({ otherTaxableIncome: Math.max(0, parseFloat(e.target.value) || 0) })}
                  placeholder="Ex: 80 000"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  Moins-values reportables (€)
                  <Tooltip content="Montant total des moins-values nettes des 10 années précédentes, non encore imputées sur des plus-values." />
                </label>
                <Input
                  type="number"
                  step="100"
                  min="0"
                  value={local.priorLosses}
                  onChange={(e) => update({ priorLosses: Math.max(0, parseFloat(e.target.value) || 0) })}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        </CardContent>

        {/* Save bar — inside the card, visible only when dirty or just saved */}
        {(isDirty || saved) && (
          <div className="border-t bg-amber-50/50 px-6 py-3 flex items-center gap-4 rounded-b-lg">
            {isDirty && (
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Modifications non enregistrées
              </div>
            )}
            <div className="ml-auto">
              <Button onClick={handleSave} className="gap-2">
                <Save className="h-4 w-4" />
                {saved ? 'Enregistré !' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {onBackupImport && defaults && (
        <BackupPanel
          current={{ settings, lots, soldLots, savedSimulations }}
          defaults={defaults}
          onImport={onBackupImport}
        />
      )}
    </div>
  );
}
