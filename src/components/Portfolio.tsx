import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert } from './ui/alert';
import { Tooltip } from './ui/tooltip';
import { Select } from './ui/select';
import { BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import type { Broker, StockLot, StockOrigin, GrantInfo } from '../lib/types';
import type { DividendEvent, CashInterestEvent } from '../lib/transaction-parser';
import { brokerBadgeClass, brokerLabel, formatEUR, formatUSD, formatDate, originLabel, planTypeLabel } from '../lib/utils';
import { safeSetItem } from '../lib/storage';
import { UnvestedView } from './UnvestedView';
import { DividendsView } from './DividendsView';

interface PortfolioProps {
  lots: StockLot[];
  onLotsChange: (lots: StockLot[]) => void;
  grants?: GrantInfo[];
  dividends?: DividendEvent[];
  cashInterest?: CashInterestEvent[];
}

export function Portfolio({ lots, onLotsChange, grants = [], dividends = [], cashInterest = [] }: PortfolioProps) {
  const [filterOrigin, setFilterOrigin] = React.useState<StockOrigin | 'all'>('all');
  const [filterHolding, setFilterHolding] = React.useState<'all' | 'Short' | 'Long'>('all');
  const [filterBroker, setFilterBroker] = React.useState<Broker | 'all'>('all');
  const [sortBy, setSortBy] = React.useState<'date' | 'type' | 'gain'>('date');
  // Currency-conversion details (Prix USD / Taux BCE) are hidden by default to
  // keep the table compact; user can opt in when she needs to audit FX rates.
  const [showFxDetails, setShowFxDetails] = React.useState(false);

  const presentBrokers = React.useMemo(() => {
    return Array.from(new Set(lots.map((l) => l.broker))) as Broker[];
  }, [lots]);
  const hasMultipleBrokers = presentBrokers.length > 1;

  const filteredLots = React.useMemo(() => {
    let result = [...lots];
    if (filterOrigin !== 'all') result = result.filter((l) => l.origin === filterOrigin);
    if (filterHolding !== 'all') result = result.filter((l) => l.holdingPeriod === filterHolding);
    if (filterBroker !== 'all') result = result.filter((l) => l.broker === filterBroker);

    result.sort((a, b) => {
      if (sortBy === 'date') return b.acquisitionDate.getTime() - a.acquisitionDate.getTime();
      if (sortBy === 'type') return a.origin.localeCompare(b.origin);
      return b.unrealizedGainLoss - a.unrealizedGainLoss;
    });

    return result;
  }, [lots, filterOrigin, filterHolding, filterBroker, sortBy]);

  const totalQuantity = lots.reduce((sum, l) => sum + l.quantity, 0);
  const totalValue = lots.reduce((sum, l) => sum + l.currentValue, 0);
  const totalGainLoss = lots.reduce((sum, l) => sum + l.unrealizedGainLoss, 0);

  const byOrigin = lots.reduce<Record<string, number>>((acc, l) => {
    acc[l.origin] = (acc[l.origin] || 0) + l.currentValue;
    return acc;
  }, {});

  const pieData = Object.entries(byOrigin).map(([origin, value]) => ({
    name: originLabel(origin),
    value: Math.round(value * 100) / 100,
  }));

  const COLORS = ['var(--color-primary)', '#50E6FF', '#FFB900', '#E74856'];

  const handlePlanTypeChange = (lotId: string, planType: string) => {
    const updated = lots.map((l) => {
      if (l.id === lotId && l.origin === 'DO') {
        const newLot = { ...l, planType: planType as StockLot['planType'] };
        // Persist in localStorage
        const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') || '{}');
        overrides[lotId] = planType;
        safeSetItem('planTypeOverrides', JSON.stringify(overrides));
        return newLot;
      }
      return l;
    });
    onLotsChange(updated);
  };

  const hasDOLots = lots.some((l) => l.origin === 'DO');
  const hasUsdImport = lots.some((l) => l.importCurrency === 'USD');
  const hasEsppLots = lots.some((l) => l.origin === 'SP');

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Actions totales</p>
            <p className="text-2xl font-bold">{totalQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Valeur totale</p>
            <p className="text-2xl font-bold">{formatEUR(totalValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 flex items-center gap-1">
              PV/MV latente
              {hasUsdImport && (
                <Tooltip content="La PV/MV en euros peut différer de celle affichée par Fidelity en dollars : le coût d'acquisition est converti au taux BCE historique de chaque date d'achat, tandis que la valeur actuelle est convertie au taux du jour." />
              )}
            </p>
            <p className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalGainLoss >= 0 ? '+' : ''}{formatEUR(totalGainLoss)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Nombre de lots</p>
            <p className="text-2xl font-bold">{lots.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pie chart */}
      {pieData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Répartition par type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}>
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DO lots info */}
      {hasDOLots && (
        <Alert>
          Les lots <strong>DO</strong> n'indiquent pas le régime fiscal. Les lots <strong>FM</strong> et <strong>FQ</strong> sont automatiquement qualifiés.
          Vérifiez le régime de vos lots DO auprès de votre RH. Vous pouvez modifier le régime lot par lot ci-dessous.
        </Alert>
      )}

      {/* Origin codes legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
        <span><Badge variant="default">SP</Badge> ESPP — Employee Stock Purchase Plan</span>
        <span><Badge variant="default">DO</Badge> Stock Award — RSU / Discretionary Award</span>
        <span><Badge variant="default">FM</Badge> AGA Macron — Attribution gratuite qualifiée (post-2018)</span>
        <span><Badge variant="default">FQ</Badge> AGA pré-Macron — Attribution gratuite qualifiée (pré-2018)</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {hasMultipleBrokers && (
          <Select value={filterBroker} onChange={(e) => setFilterBroker(e.target.value as Broker | 'all')} className="w-44" aria-label="Filtrer par courtier">
            <option value="all">Tous courtiers</option>
            {presentBrokers.map((b) => (
              <option key={b} value={b}>{brokerLabel(b)}</option>
            ))}
          </Select>
        )}
        <Select value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value as StockOrigin | 'all')} className="w-40">
          <option value="all">Tous types</option>
          <option value="SP">ESPP (SP)</option>
          <option value="DO">Stock Award (DO)</option>
          <option value="FM">AGA Macron (FM)</option>
          <option value="FQ">AGA pré-Macron (FQ)</option>
        </Select>
        <Select value={filterHolding} onChange={(e) => setFilterHolding(e.target.value as 'all' | 'Short' | 'Long')} className="w-40">
          <option value="all">Toute période</option>
          <option value="Short">Court terme</option>
          <option value="Long">Long terme</option>
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'type' | 'gain')} className="w-40">
          <option value="date">Tri par date</option>
          <option value="type">Tri par type</option>
          <option value="gain">Tri par gain</option>
        </Select>
        {hasUsdImport && (
          <button
            type="button"
            onClick={() => setShowFxDetails((v) => !v)}
            className="ml-auto text-xs text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline self-center"
          >
            {showFxDetails ? 'Masquer' : 'Afficher'} les détails de change
          </button>
        )}
      </div>

      {/* Table — desktop */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                  <th className="text-left px-2.5 py-2 font-medium sticky left-0 z-10 bg-gray-50 shadow-[1px_0_0_0_rgb(229,231,235)]">Date</th>
                  {hasMultipleBrokers && <th className="text-center px-2.5 py-2 font-medium">Courtier</th>}
                  <th className="text-right px-2.5 py-2 font-medium">Qté</th>
                  <th className="text-right px-2.5 py-2 font-medium">Prix/act.</th>
                  {hasUsdImport && showFxDetails && (
                    <>
                      <th className="text-right px-2.5 py-2 font-medium">Prix USD</th>
                      <th className="text-right px-2.5 py-2 font-medium">Taux BCE</th>
                    </>
                  )}
                  {hasEsppLots && (
                    <th className="text-right px-2.5 py-2 font-medium">
                      FMV acq.
                      <Tooltip content="Valeur de marché à la date d'achat ESPP (avant décote 10 %). Utilisée comme prix de revient fiscal pour le calcul de la plus-value de cession." />
                    </th>
                  )}
                  <th className="text-right px-2.5 py-2 font-medium">Valeur</th>
                  <th className="text-right px-2.5 py-2 font-medium">PV/MV</th>
                  <th className="text-center px-2.5 py-2 font-medium">Origine</th>
                  <th className="text-center px-2.5 py-2 font-medium">
                    Régime
                    <Tooltip content="Le régime fiscal détermine le traitement de votre gain d'acquisition. Les lots FM/FQ sont automatiquement qualifiés." />
                  </th>
                  <th className="text-center px-2.5 py-2 font-medium">Détention</th>
                  <th className="text-left px-2.5 py-2 font-medium">Dispo.</th>
                </tr>
              </thead>
              <tbody>
                {filteredLots.map((lot) => {
                  const notYetAvailable = lot.availableForSaleDate && lot.availableForSaleDate > new Date();
                  return (
                    <tr key={lot.id} className="border-b hover:bg-gray-50 group">
                      <td className="px-2.5 py-2 sticky left-0 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_rgb(229,231,235)]">{formatDate(lot.acquisitionDate)}</td>
                      {hasMultipleBrokers && (
                        <td className="px-2.5 py-2 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border ${brokerBadgeClass(lot.broker)}`}>
                            {brokerLabel(lot.broker)}
                          </span>
                        </td>
                      )}
                      <td className="px-2.5 py-2 text-right">{lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</td>
                      <td className="px-2.5 py-2 text-right">{formatEUR(lot.costBasisPerShare)}</td>
                      {hasUsdImport && showFxDetails && (
                        <>
                          <td className="px-2.5 py-2 text-right text-gray-500">
                            {lot.costBasisPerShareUsd ? formatUSD(lot.costBasisPerShareUsd) : '—'}
                          </td>
                          <td className="px-2.5 py-2 text-right text-gray-500 font-mono text-xs">
                            {lot.eurUsdRate ? lot.eurUsdRate.toFixed(4) : '—'}
                          </td>
                        </>
                      )}
                      {hasEsppLots && (
                        <td className="px-2.5 py-2 text-right">
                          {lot.origin === 'SP' ? formatEUR(lot.esppFmvPerShare ?? 0) : '—'}
                        </td>
                      )}
                      <td className="px-2.5 py-2 text-right">{formatEUR(lot.currentValue)}</td>
                      <td className={`px-2.5 py-2 text-right ${lot.unrealizedGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <span className="inline-flex items-center gap-1">
                          {lot.unrealizedGainLoss >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {formatEUR(Math.abs(lot.unrealizedGainLoss))}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <Badge variant={lot.origin === 'SP' ? 'secondary' : lot.origin === 'FM' ? 'success' : 'default'}>
                          {originLabel(lot.origin)}
                        </Badge>
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        {lot.origin === 'DO' ? (
                          <Select
                            value={lot.planType}
                            onChange={(e) => handlePlanTypeChange(lot.id, e.target.value)}
                            className="w-44 text-xs h-8"
                          >
                            <option value="qualified_macron">Qualifié (Macron)</option>
                            <option value="non_qualified">Non qualifié</option>
                          </Select>
                        ) : (
                          <span className="text-xs">{planTypeLabel(lot.planType)}</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <Badge variant={lot.holdingPeriod === 'Long' ? 'success' : 'outline'}>
                          {lot.holdingPeriod === 'Long' ? '≥ 2 ans' : '< 2 ans'}
                        </Badge>
                      </td>
                      <td className="px-2.5 py-2">
                        {notYetAvailable ? (
                          <span className="text-amber-600 text-xs font-medium">
                            ⚠️ {formatDate(lot.availableForSaleDate)}
                          </span>
                        ) : (
                          <span className="text-green-600 text-xs">Disponible</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Cards — mobile (< md) */}
      <div className="md:hidden space-y-2">
        {filteredLots.length === 0 && (
          <Card>
            <CardContent className="p-4 text-center text-sm text-gray-500">
              Aucun lot à afficher avec les filtres actuels.
            </CardContent>
          </Card>
        )}
        {filteredLots.map((lot) => {
          const notYetAvailable = lot.availableForSaleDate && lot.availableForSaleDate > new Date();
          return (
            <Card key={lot.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{formatDate(lot.acquisitionDate)}</div>
                    <div className="text-xs text-gray-500">
                      {lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions · {formatEUR(lot.costBasisPerShare)}/action
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={lot.origin === 'SP' ? 'secondary' : lot.origin === 'FM' ? 'success' : 'default'}>
                      {originLabel(lot.origin)}
                    </Badge>
                    {hasMultipleBrokers && (
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded border ${brokerBadgeClass(lot.broker)}`}>
                        {brokerLabel(lot.broker)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500">Valeur</div>
                    <div className="font-medium">{formatEUR(lot.currentValue)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">PV/MV</div>
                    <div className={`font-medium inline-flex items-center gap-1 ${lot.unrealizedGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {lot.unrealizedGainLoss >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {formatEUR(Math.abs(lot.unrealizedGainLoss))}
                    </div>
                  </div>
                  {hasEsppLots && lot.origin === 'SP' && (
                    <div className="col-span-2">
                      <div className="text-gray-500">FMV acq.</div>
                      <div className="font-medium">{formatEUR(lot.esppFmvPerShare ?? 0)}</div>
                    </div>
                  )}
                  {hasUsdImport && lot.costBasisPerShareUsd && (
                    <div className="col-span-2 text-gray-500">
                      {formatUSD(lot.costBasisPerShareUsd)} · taux BCE {lot.eurUsdRate?.toFixed(4)}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={lot.holdingPeriod === 'Long' ? 'success' : 'outline'}>
                      {lot.holdingPeriod === 'Long' ? '≥ 2 ans' : '< 2 ans'}
                    </Badge>
                    {notYetAvailable ? (
                      <span className="text-amber-600 text-xs font-medium">
                        ⚠️ dispo {formatDate(lot.availableForSaleDate)}
                      </span>
                    ) : (
                      <span className="text-green-600 text-xs">Disponible</span>
                    )}
                  </div>
                  {lot.origin === 'DO' ? (
                    <Select
                      value={lot.planType}
                      onChange={(e) => handlePlanTypeChange(lot.id, e.target.value)}
                      className="text-xs h-8 max-w-[8.5rem]"
                      aria-label="Statut fiscal"
                    >
                      <option value="qualified_macron">Qualifié</option>
                      <option value="non_qualified">Non qualifié</option>
                    </Select>
                  ) : (
                    <span className="text-xs text-gray-600">{planTypeLabel(lot.planType)}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <UnvestedView grants={grants} />
      <DividendsView dividends={dividends} cashInterest={cashInterest} />
    </div>
  );
}
