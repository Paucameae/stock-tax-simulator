import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Layers, Plus, Trash2, ThumbsUp } from 'lucide-react';
import type { SaleLotEntry, AppSettings, TaxSimulationResult, SaleSimulation } from '../lib/types';
import { runSimulation } from '../lib/tax-engine';
import { formatEUR, formatPercent } from '../lib/utils';

interface ScenarioComparatorProps {
  baseLots: SaleLotEntry[];
  settings: AppSettings;
}

interface Scenario {
  id: string;
  name: string;
  salePrice: number;
  sellPercent: number; // 0-100
}

function generateScenarioId(): string {
  return Math.random().toString(36).substring(2, 8);
}

function runScenario(
  baseLots: SaleLotEntry[],
  scenario: Scenario,
  settings: AppSettings
): { pfu: TaxSimulationResult; bareme: TaxSimulationResult } {
  const adjustedLots: SaleLotEntry[] = baseLots.map((entry) => ({
    ...entry,
    quantitySold: entry.quantitySold * (scenario.sellPercent / 100),
    salePricePerShare: scenario.salePrice,
  }));

  const baseSim: SaleSimulation = {
    lots: adjustedLots,
    taxMode: 'pfu',
    otherTaxableIncome: settings.otherTaxableIncome,
    taxShares: settings.taxShares,
    familyStatus: settings.familyStatus,
    priorLosses: settings.priorLosses,
    fiscalYear: settings.fiscalYear,
  };

  return {
    pfu: runSimulation({ ...baseSim, taxMode: 'pfu' }),
    bareme: runSimulation({ ...baseSim, taxMode: 'bareme' }),
  };
}

export function ScenarioComparator({ baseLots, settings }: ScenarioComparatorProps) {
  const basePrice = baseLots.length > 0 ? baseLots[0].salePricePerShare : 400;

  const [scenarios, setScenarios] = React.useState<Scenario[]>([
    { id: generateScenarioId(), name: 'Vente 25%', salePrice: basePrice, sellPercent: 25 },
    { id: generateScenarioId(), name: 'Vente 50%', salePrice: basePrice, sellPercent: 50 },
    { id: generateScenarioId(), name: 'Vente 100%', salePrice: basePrice, sellPercent: 100 },
  ]);

  // Sync base price when baseLots change
  React.useEffect(() => {
    if (baseLots.length > 0) {
      const p = baseLots[0].salePricePerShare;
      setScenarios((prev) =>
        prev.map((s) => ({ ...s, salePrice: s.salePrice === 0 ? p : s.salePrice }))
      );
    }
  }, [baseLots]);

  const addScenario = () => {
    if (scenarios.length >= 6) return;
    setScenarios((prev) => [
      ...prev,
      {
        id: generateScenarioId(),
        name: `Scénario ${prev.length + 1}`,
        salePrice: basePrice,
        sellPercent: 100,
      },
    ]);
  };

  const removeScenario = (id: string) => {
    if (scenarios.length <= 1) return;
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  };

  const updateScenario = (id: string, patch: Partial<Scenario>) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  if (baseLots.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          Lancez d'abord une simulation pour comparer des scénarios.
        </CardContent>
      </Card>
    );
  }

  const results = scenarios.map((s) => ({
    scenario: s,
    ...runScenario(baseLots, s, settings),
  }));

  // Find best scenario (lowest tax, best net for PFU)
  const bestNet = Math.max(...results.map((r) => Math.max(r.pfu.netAmount, r.bareme.netAmount)));
  const bestEffRate = Math.min(
    ...results.map((r) => Math.min(r.pfu.effectiveTaxRate, r.bareme.effectiveTaxRate))
  );

  const totalBaseQuantity = baseLots.reduce((sum, e) => sum + e.quantitySold, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Comparaison multi-scénarios
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={addScenario}
            disabled={scenarios.length >= 6}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Scenario inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {scenarios.map((s) => (
            <div key={s.id} className="border rounded-lg p-3 bg-gray-50 space-y-2">
              <div className="flex items-center justify-between">
                <Input
                  value={s.name}
                  onChange={(e) => updateScenario(s.id, { name: e.target.value })}
                  className="h-7 text-sm font-medium bg-transparent border-0 p-0 focus:ring-0"
                />
                {scenarios.length > 1 && (
                  <button
                    onClick={() => removeScenario(s.id)}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Prix (€)</label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={s.salePrice || ''}
                    onChange={(e) =>
                      updateScenario(s.id, { salePrice: parseFloat(e.target.value) || 0 })
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs text-gray-500">Vente (%)</label>
                  <Input
                    type="number"
                    step="5"
                    min="1"
                    max="100"
                    value={s.sellPercent}
                    onChange={(e) =>
                      updateScenario(s.id, {
                        sellPercent: Math.min(100, Math.max(1, parseInt(e.target.value) || 100)),
                      })
                    }
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">
                {(totalBaseQuantity * s.sellPercent / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} actions à {formatEUR(s.salePrice)}
              </p>
            </div>
          ))}
        </div>

        {/* Results table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-2 font-medium"></th>
                {results.map((r) => (
                  <th key={r.scenario.id} className="text-center p-2 font-medium" colSpan={1}>
                    {r.scenario.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="p-2 text-gray-600">Produit brut</td>
                {results.map((r) => (
                  <td key={r.scenario.id} className="p-2 text-center font-medium">
                    {formatEUR(r.pfu.totalProceeds)}
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-2 text-gray-600">Gain d'acquisition</td>
                {results.map((r) => (
                  <td key={r.scenario.id} className="p-2 text-center">
                    {formatEUR(r.pfu.totalAcquisitionGain)}
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-2 text-gray-600">Plus-value cession</td>
                {results.map((r) => (
                  <td
                    key={r.scenario.id}
                    className={`p-2 text-center ${r.pfu.totalCapitalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {r.pfu.totalCapitalGain >= 0 ? '+' : ''}
                    {formatEUR(r.pfu.totalCapitalGain)}
                  </td>
                ))}
              </tr>

              {/* PFU row */}
              <tr className="border-b bg-blue-50">
                <td className="p-2 font-medium text-blue-800">Impôts (PFU)</td>
                {results.map((r) => (
                  <td key={r.scenario.id} className="p-2 text-center text-red-600 font-medium">
                    {formatEUR(r.pfu.totalTax)}
                  </td>
                ))}
              </tr>
              <tr className="border-b bg-blue-50">
                <td className="p-2 font-medium text-blue-800">Net (PFU)</td>
                {results.map((r) => {
                  const isBest = r.pfu.netAmount === bestNet;
                  return (
                    <td key={r.scenario.id} className="p-2 text-center">
                      <span className={`font-bold ${isBest ? 'text-green-700' : 'text-gray-900'}`}>
                        {formatEUR(r.pfu.netAmount)}
                      </span>
                      {isBest && <Badge variant="success" className="ml-1 text-[10px]">Best</Badge>}
                    </td>
                  );
                })}
              </tr>

              {/* Bareme row */}
              <tr className="border-b bg-purple-50">
                <td className="p-2 font-medium text-purple-800">Impôts (Barème)</td>
                {results.map((r) => (
                  <td key={r.scenario.id} className="p-2 text-center text-red-600 font-medium">
                    {formatEUR(r.bareme.totalTax)}
                  </td>
                ))}
              </tr>
              <tr className="border-b bg-purple-50">
                <td className="p-2 font-medium text-purple-800">Net (Barème)</td>
                {results.map((r) => {
                  const isBest = r.bareme.netAmount === bestNet;
                  return (
                    <td key={r.scenario.id} className="p-2 text-center">
                      <span className={`font-bold ${isBest ? 'text-green-700' : 'text-gray-900'}`}>
                        {formatEUR(r.bareme.netAmount)}
                      </span>
                      {isBest && <Badge variant="success" className="ml-1 text-[10px]">Best</Badge>}
                    </td>
                  );
                })}
              </tr>

              {/* Effective rates */}
              <tr className="border-b">
                <td className="p-2 text-gray-600">Taux effectif (PFU)</td>
                {results.map((r) => {
                  const isBest = r.pfu.effectiveTaxRate === bestEffRate;
                  return (
                    <td key={r.scenario.id} className={`p-2 text-center ${isBest ? 'font-bold text-green-700' : ''}`}>
                      {formatPercent(r.pfu.effectiveTaxRate)}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-b">
                <td className="p-2 text-gray-600">Taux effectif (Barème)</td>
                {results.map((r) => {
                  const isBest = r.bareme.effectiveTaxRate === bestEffRate;
                  return (
                    <td key={r.scenario.id} className={`p-2 text-center ${isBest ? 'font-bold text-green-700' : ''}`}>
                      {formatPercent(r.bareme.effectiveTaxRate)}
                    </td>
                  );
                })}
              </tr>

              {/* Best option per scenario */}
              <tr className="bg-gray-50">
                <td className="p-2 font-medium">Meilleur régime</td>
                {results.map((r) => {
                  const pfuBetter = r.pfu.totalTax <= r.bareme.totalTax;
                  return (
                    <td key={r.scenario.id} className="p-2 text-center">
                      <Badge variant={pfuBetter ? 'default' : 'secondary'}>
                        {pfuBetter ? 'PFU' : 'Barème'}
                      </Badge>
                      <span className="block text-xs text-gray-500 mt-1">
                        Économie {formatEUR(Math.abs(r.pfu.totalTax - r.bareme.totalTax))}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Summary */}
        {results.length > 1 && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
            <ThumbsUp className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">
              {(() => {
                const best = results.reduce((a, b) => {
                  const aNet = Math.max(a.pfu.netAmount, a.bareme.netAmount);
                  const bNet = Math.max(b.pfu.netAmount, b.bareme.netAmount);
                  return aNet >= bNet ? a : b;
                });
                const bestRegime = best.pfu.netAmount >= best.bareme.netAmount ? 'PFU' : 'Barème';
                const bestNetAmount = Math.max(best.pfu.netAmount, best.bareme.netAmount);
                return (
                  <>
                    Meilleur scénario : <strong>{best.scenario.name}</strong> en{' '}
                    <strong>{bestRegime}</strong> → net de{' '}
                    <strong>{formatEUR(bestNetAmount)}</strong>
                  </>
                );
              })()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
