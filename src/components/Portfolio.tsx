import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert } from './ui/alert';
import { Tooltip } from './ui/tooltip';
import { Select } from './ui/select';
import { Briefcase, ChevronDown, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react';
import type { Broker, StockLot, StockOrigin, GrantInfo } from '../lib/types';
import type { DividendEvent, CashInterestEvent } from '../lib/transaction-parser';
import { brokerLabel, formatEUR, originLabel } from '../lib/utils';
import { safeSetItem } from '../lib/storage';
import { UnvestedView } from './UnvestedView';
import { DividendsView } from './DividendsView';
import { BulkQualifyPanel } from './BulkQualifyPanel';
import { countEligible, type BulkQualifyChoice, type BulkQualifyOptions } from '../lib/bulk-qualify';
import { useMsftPrice } from '../hooks/useMsftPrice';
import { lotMarketValue, lotUnrealizedGain, portfolioTotals } from '../lib/portfolio-value';
import { OriginCodesLegend, PortfolioTableAndCards, type PortfolioSortKey } from './PortfolioLotTable';

// recharts + d3 weigh ~250 kB for one decorative chart, so they are fetched
// only once a portfolio actually has several buckets to show.
const PortfolioTreemap = React.lazy(() => import('./PortfolioTreemap'));

interface PortfolioProps {
  lots: StockLot[];
  onLotsChange: (lots: StockLot[]) => void;
  grants?: GrantInfo[];
  dividends?: DividendEvent[];
  cashInterest?: CashInterestEvent[];
  /** Optional: opens a bulk-qualify panel when there are non-reconciled lots. */
  onBulkQualify?: (choice: BulkQualifyChoice, options: BulkQualifyOptions) => void;
  /** Whether the user has imported a StockExport file — drives the wording of the banner. */
  hasGrants?: boolean;
  /** ISO date of the last positions import, used to date the fallback valuation. */
  importedAt?: string | null;
  /** False while the tab is hidden: a chart measured inside `hidden` gets 0×0. */
  visible?: boolean;
}

// Threshold under which the lot table auto-opens — small portfolios fit on one
// screen so collapsing them by default is more friction than help.
const AUTO_OPEN_THRESHOLD = 10;
const TABLE_OPEN_KEY = 'portfolioTableOpen';

// Color map kept stable across the whole component (badges + treemap) so the
// visual code (DO=blue, FM=cyan, SP=amber, FQ=red) is consistent everywhere.
const ORIGIN_COLORS: Record<string, string> = {
  DO: 'var(--color-primary)',
  FM: '#50E6FF',
  SP: '#FFB900',
  FQ: '#E74856',
};
const HOLDING_COLORS: Record<string, string> = {
  Long: '#107C10',
  Short: '#FFB900',
};
const BROKER_COLORS: Record<string, string> = {
  fidelity: 'var(--color-primary)',
  morgan_stanley: '#50E6FF',
};

type GroupBy = 'origin' | 'holding' | 'broker';

const GROUP_BY_CAPTION: Record<GroupBy, string> = {
  origin: 'par origine',
  holding: 'par durée de détention',
  broker: 'par courtier',
};

export function Portfolio({ lots, onLotsChange, grants = [], dividends = [], cashInterest = [], onBulkQualify, hasGrants = false, importedAt = null, visible = true }: PortfolioProps) {
  const { eurPrice, lastUpdated, loading: priceLoading, error: priceError, retry: retryPrice } = useMsftPrice();
  const [filterOrigin, setFilterOrigin] = React.useState<StockOrigin | 'all'>('all');
  const [filterHolding, setFilterHolding] = React.useState<'all' | 'Short' | 'Long'>('all');
  const [filterBroker, setFilterBroker] = React.useState<Broker | 'all'>('all');
  // 'all' (default), 'drip' (DRIP only) or 'noDrip' (hide DRIP). Surfaced only
  // when at least one lot in the dataset is flagged as a reinvested dividend.
  const [filterDrip, setFilterDrip] = React.useState<'all' | 'drip' | 'noDrip'>('all');
  // Sortable columns: clicking a header cycles direction (desc → asc), clicking
  // another column resets to the column's natural default direction.
  const [sortKey, setSortKey] = React.useState<PortfolioSortKey>('date');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const handleSort = React.useCallback((key: PortfolioSortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDir('desc');
      return key;
    });
  }, []);
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
    if (filterDrip === 'drip') result = result.filter((l) => l.isReinvestedDividend === true);
    else if (filterDrip === 'noDrip') result = result.filter((l) => l.isReinvestedDividend !== true);

    const dir = sortDir === 'asc' ? 1 : -1;
    result.sort((a, b) => {
      switch (sortKey) {
        case 'date':
          return dir * (a.acquisitionDate.getTime() - b.acquisitionDate.getTime());
        case 'origin':
          return dir * a.origin.localeCompare(b.origin);
        case 'broker':
          return dir * a.broker.localeCompare(b.broker);
        case 'quantity':
          return dir * (a.quantity - b.quantity);
        case 'cost':
          return dir * (a.costBasisPerShare - b.costBasisPerShare);
        case 'fmv':
          return dir * ((a.esppFmvPerShare ?? 0) - (b.esppFmvPerShare ?? 0));
        case 'value':
          return dir * ((lotMarketValue(a, eurPrice) ?? 0) - (lotMarketValue(b, eurPrice) ?? 0));
        case 'gain':
          return dir * ((lotUnrealizedGain(a, eurPrice) ?? 0) - (lotUnrealizedGain(b, eurPrice) ?? 0));
        case 'holding':
          // Long > Short
          return dir * (a.holdingPeriod === b.holdingPeriod ? 0 : a.holdingPeriod === 'Long' ? 1 : -1);
        case 'available': {
          const ta = a.availableForSaleDate?.getTime() ?? 0;
          const tb = b.availableForSaleDate?.getTime() ?? 0;
          return dir * (ta - tb);
        }
      }
    });

    return result;
  }, [lots, filterOrigin, filterHolding, filterBroker, filterDrip, sortKey, sortDir, eurPrice]);

  const totalQuantity = lots.reduce((sum, l) => sum + l.quantity, 0);
  const totals = portfolioTotals(lots, eurPrice);

  // When the lot table is open AND filtered, swap the header KPIs to reflect
  // the filtered slice — that's the question the user is currently asking
  // ("how much weight do my Macron AGAs carry?"). When closed/unfiltered we
  // keep the global totals so the card is always a snapshot of the whole.
  const filteredQuantity = filteredLots.reduce((sum, l) => sum + l.quantity, 0);
  const filteredTotals = portfolioTotals(filteredLots, eurPrice);

  const [groupBy, setGroupBy] = React.useState<GroupBy>('origin');

  // Aggregate lots into buckets for the treemap. Buckets are sorted by value
  // desc so recharts' squarified layout puts the dominant category top-left.
  const treemapData = React.useMemo(() => {
    // recharts Treemap reads the bucket label from the `name` field; we keep
    // `code` as a short identifier (origin code, broker key) for tiny tiles.
    type Bucket = { key: string; name: string; label: string; code: string; value: number; count: number; shares: number; gainLoss: number; fill: string };
    const buckets = new Map<string, Bucket>();
    for (const lot of lots) {
      let key: string;
      let name: string;
      let label: string;
      let code: string;
      let fill: string;
      if (groupBy === 'origin') {
        key = lot.origin;
        name = lot.origin;
        label = originLabel(lot.origin);
        code = lot.origin;
        fill = ORIGIN_COLORS[lot.origin] ?? '#888';
      } else if (groupBy === 'holding') {
        key = lot.holdingPeriod;
        name = lot.holdingPeriod === 'Long' ? '≥ 2 ans' : '< 2 ans';
        label = name;
        code = lot.holdingPeriod === 'Long' ? 'LT' : 'CT';
        fill = HOLDING_COLORS[lot.holdingPeriod] ?? '#888';
      } else {
        key = lot.broker;
        name = brokerLabel(lot.broker);
        label = name;
        code = lot.broker === 'fidelity' ? 'FID' : 'MS';
        fill = BROKER_COLORS[lot.broker] ?? '#888';
      }
      const existing = buckets.get(key);
      const value = lotMarketValue(lot, eurPrice) ?? 0;
      const gainLoss = lotUnrealizedGain(lot, eurPrice) ?? 0;
      if (existing) {
        existing.value += value;
        existing.count += 1;
        existing.shares += lot.quantity;
        existing.gainLoss += gainLoss;
      } else {
        buckets.set(key, {
          key,
          name,
          label,
          code,
          value: Math.max(0, value),
          count: 1,
          shares: lot.quantity,
          gainLoss,
          fill,
        });
      }
    }
    return Array.from(buckets.values()).sort((a, b) => b.value - a.value);
  }, [lots, groupBy, eurPrice]);

  // Hide the treemap when it would degenerate to a single full-width tile —
  // it adds visual noise without conveying any breakdown.
  const showTreemap = visible && treemapData.length >= 2 && totals.value > 0;

  const handlePlanTypeChange = (lotId: string, planType: string) => {
    const updated = lots.map((l) => {
      if (l.id === lotId && l.origin === 'DO') {
        const newLot: StockLot = { ...l, planType: planType as StockLot['planType'], qualificationReason: 'manual' };
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
  const manualRateCount = lots.filter((l) => l.rateSource === 'manual').length;
  const hasEsppLots = lots.some((l) => l.origin === 'SP');
  const totalEligibleForBulk = countEligible(lots);
  const esppEligibleForBulk = countEligible(lots, { includeEspp: true }) - totalEligibleForBulk;
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const isFiltered = filterOrigin !== 'all' || filterHolding !== 'all' || filterBroker !== 'all' || filterDrip !== 'all';
  const resetFilters = () => {
    setFilterOrigin('all');
    setFilterHolding('all');
    setFilterBroker('all');
    setFilterDrip('all');
  };
  const hasDripLots = lots.some((l) => l.isReinvestedDividend === true);

  // Collapsible lot detail: persist user choice in localStorage; auto-open
  // for small portfolios where collapsing has no real benefit.
  const [tableOpen, setTableOpen] = React.useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(TABLE_OPEN_KEY);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    } catch {
      /* ignore */
    }
    return lots.length > 0 && lots.length <= AUTO_OPEN_THRESHOLD;
  });
  // Header KPIs reflect filters only when the lot table is open AND a filter is
  // active; otherwise the card stays a global snapshot of the whole portfolio.
  const showFilteredKpis = tableOpen && isFiltered;
  const displayed = showFilteredKpis ? filteredTotals : totals;
  const hasKnownValue = displayed.knownCount > 0;
  const unknownHint =
    displayed.unknownCount > 0
      ? `hors ${displayed.unknownCount} lot${displayed.unknownCount > 1 ? 's' : ''} sans valeur connue`
      : undefined;
  const toggleTable = () => {
    setTableOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(TABLE_OPEN_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Mon portefeuille
              </CardTitle>
              <p className="text-sm text-gray-500 mt-0.5">
                {showFilteredKpis ? (
                  <>
                    <span className="font-medium text-gray-700">
                      {filteredLots.length.toLocaleString('fr-FR')} / {lots.length.toLocaleString('fr-FR')}
                    </span>{' '}
                    lot{filteredLots.length > 1 ? 's' : ''} affiché{filteredLots.length > 1 ? 's' : ''} ·{' '}
                    {filteredQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} action
                    {filteredQuantity > 1 ? 's' : ''}
                  </>
                ) : (
                  <>
                    {lots.length.toLocaleString('fr-FR')} lot{lots.length > 1 ? 's' : ''} ·{' '}
                    {totalQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} action
                    {totalQuantity > 1 ? 's' : ''}
                  </>
                )}
              </p>
            </div>
          </div>
          {/* KPIs row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <Kpi
              label={showFilteredKpis ? 'Actions filtrées' : 'Actions totales'}
              value={(showFilteredKpis ? filteredQuantity : totalQuantity).toLocaleString('fr-FR', { maximumFractionDigits: 4 })}
            />
            <Kpi
              label={showFilteredKpis ? 'Valeur filtrée' : 'Valeur totale'}
              value={hasKnownValue ? formatEUR(displayed.value) : '—'}
              hint={unknownHint}
            />
            <Kpi
              label={
                <span className="flex items-center gap-1">
                  PV/MV latente
                  {hasUsdImport && (
                    <Tooltip content="La PV/MV en euros peut différer de celle affichée par Fidelity en dollars : le coût d'acquisition est converti au taux BCE historique de chaque date d'achat, tandis que la valeur actuelle est convertie au taux du jour." />
                  )}
                </span>
              }
              value={
                hasKnownValue
                  ? `${displayed.gainLoss >= 0 ? '+' : ''}${formatEUR(displayed.gainLoss)}`
                  : '—'
              }
              hint={unknownHint}
              valueClassName={
                !hasKnownValue
                  ? 'text-gray-400'
                  : displayed.gainLoss >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
              }
            />
          </div>

          <ValuationSource
            eurPrice={eurPrice}
            lastUpdated={lastUpdated}
            loading={priceLoading}
            error={priceError}
            onRetry={retryPrice}
            importedAt={importedAt}
          />

          {/* Allocation treemap */}
          {showTreemap && (
            <div className="mt-4 rounded-md bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-gray-600">Répartition par valeur</span>
                <Select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  className="h-8 text-xs w-36 px-2"
                  aria-label="Grouper la répartition par"
                >
                  <option value="origin">par Origine</option>
                  <option value="holding">par Détention</option>
                  {hasMultipleBrokers && <option value="broker">par Courtier</option>}
                </Select>
              </div>
              <div className="h-32 sm:h-36" aria-hidden="true">
                <React.Suspense fallback={null}>
                  <PortfolioTreemap data={treemapData} total={totals.value} />
                </React.Suspense>
              </div>
              {/* The chart itself carries no accessible text, and its tiles drop
                  labels when they get small — this table is the real content. */}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                  Voir les chiffres de la répartition
                </summary>
                <table className="mt-2 w-full text-xs">
                  <caption className="sr-only">
                    Répartition de la valeur du portefeuille {GROUP_BY_CAPTION[groupBy]}
                  </caption>
                  <thead>
                    <tr className="text-gray-500">
                      <th scope="col" className="py-1 text-left font-medium">Catégorie</th>
                      <th scope="col" className="py-1 text-right font-medium">Lots</th>
                      <th scope="col" className="py-1 text-right font-medium">Valeur</th>
                      <th scope="col" className="py-1 text-right font-medium">Part</th>
                    </tr>
                  </thead>
                  <tbody>
                    {treemapData.map((bucket) => (
                      <tr key={bucket.key} className="border-t border-gray-200">
                        <th scope="row" className="py-1 text-left font-normal text-gray-700">
                          {bucket.label}
                        </th>
                        <td className="py-1 text-right tabular-nums">{bucket.count}</td>
                        <td className="py-1 text-right tabular-nums">{formatEUR(bucket.value)}</td>
                        <td className="py-1 text-right tabular-nums">
                          {Math.round((bucket.value / totals.value) * 100)} %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          )}

          {/* Toggle row */}
          <button
            type="button"
            onClick={toggleTable}
            className="mt-3 -mx-2 -mb-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            aria-expanded={tableOpen}
            aria-controls="portfolio-lot-detail"
          >
            <span className="flex items-center gap-1.5 font-medium">
              {tableOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {tableOpen ? 'Masquer le détail' : `Voir le détail des ${lots.length} lot${lots.length > 1 ? 's' : ''}`}
            </span>
            {isFiltered && tableOpen && (
              <span className="text-xs text-gray-500">
                {filteredLots.length} / {lots.length} affiché{filteredLots.length > 1 ? 's' : ''}
              </span>
            )}
          </button>
        </CardHeader>
        {tableOpen && (
          <CardContent id="portfolio-lot-detail" className="pt-0 space-y-4">
            {/* DO lots info */}
            {hasDOLots && totalEligibleForBulk > 0 && (
              <Alert>
                <div className="flex flex-col gap-2">
                  <div>
                    Les lots <strong>DO</strong> n'indiquent pas le régime fiscal. Les lots <strong>FM</strong> et <strong>FQ</strong> sont automatiquement qualifiés.
                    {hasGrants
                      ? ' Vérifiez le régime de vos lots DO restants ci-dessous.'
                      : ' Importez votre StockExport pour qualifier automatiquement les lots, ou utilisez la qualification en lot.'}
                  </div>
                  {onBulkQualify && totalEligibleForBulk > 1 && (
                    <button
                      type="button"
                      onClick={() => setBulkOpen((v) => !v)}
                      className="self-start text-xs font-medium text-primary hover:underline"
                    >
                      {bulkOpen ? 'Masquer la qualification en lot' : `Qualifier en lot ${totalEligibleForBulk} lots non reconciliés`}
                    </button>
                  )}
                </div>
              </Alert>
            )}
            {onBulkQualify && bulkOpen && (totalEligibleForBulk > 0 || esppEligibleForBulk > 0) && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <BulkQualifyPanel
                  eligibleCount={totalEligibleForBulk}
                  esppEligibleCount={esppEligibleForBulk}
                  onApply={(choice, options) => {
                    onBulkQualify(choice, options);
                    setBulkOpen(false);
                  }}
                  compact
                />
              </div>
            )}

            {/* Filters — sticky so they remain reachable while scrolling lots */}
            <div className="sticky top-0 z-20 -mx-6 px-6 py-2 bg-white/95 backdrop-blur border-b border-gray-100 flex flex-wrap items-center gap-3">
              {hasMultipleBrokers && (
                <Select value={filterBroker} onChange={(e) => setFilterBroker(e.target.value as Broker | 'all')} className="w-44" aria-label="Filtrer par courtier">
                  <option value="all">Tous courtiers</option>
                  {presentBrokers.map((b) => (
                    <option key={b} value={b}>{brokerLabel(b)}</option>
                  ))}
                </Select>
              )}
              <Select value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value as StockOrigin | 'all')} className="w-40" aria-label="Filtrer par type">
                <option value="all">Tous types</option>
                <option value="SP">ESPP (SP)</option>
                <option value="DO">Stock Award (DO)</option>
                <option value="FM">AGA Macron (FM)</option>
                <option value="FQ">AGA pré-Macron (FQ)</option>
              </Select>
              <Select value={filterHolding} onChange={(e) => setFilterHolding(e.target.value as 'all' | 'Short' | 'Long')} className="w-40" aria-label="Filtrer par période de détention">
                <option value="all">Toute période</option>
                <option value="Short">Court terme</option>
                <option value="Long">Long terme</option>
              </Select>
              {hasDripLots && (
                <Select
                  value={filterDrip}
                  onChange={(e) => setFilterDrip(e.target.value as 'all' | 'drip' | 'noDrip')}
                  className="w-64"
                  aria-label="Filtrer les dividendes réinvestis"
                  title="Les dividendes réinvestis (DRIP) génèrent de nombreux petits lots fractionnaires classés automatiquement."
                >
                  <option value="all">Toutes les lignes</option>
                  <option value="drip">Dividendes réinvestis seulement</option>
                  <option value="noDrip">Masquer les dividendes réinvestis</option>
                </Select>
              )}
              {isFiltered && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline self-center"
                >
                  Réinitialiser
                </button>
              )}
              <OriginCodesLegend />
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

            {manualRateCount > 0 && (
              <p className="mb-3 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  {manualRateCount} lot{manualRateCount > 1 ? 's' : ''} converti
                  {manualRateCount > 1 ? 's' : ''} avec un taux de change saisi manuellement, non issu du flux
                  BCE. Vérifiez ces montants avant de les reporter sur votre déclaration.
                </span>
              </p>
            )}

            <PortfolioTableAndCards
              filteredLots={filteredLots}
              hasMultipleBrokers={hasMultipleBrokers}
              hasUsdImport={hasUsdImport}
              hasEsppLots={hasEsppLots}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              showFxDetails={showFxDetails}
              eurPrice={eurPrice}
              onPlanTypeChange={handlePlanTypeChange}
            />
          </CardContent>
        )}
      </Card>

      <UnvestedView grants={grants} />
      <DividendsView dividends={dividends} cashInterest={cashInterest} />
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-base font-semibold ${valueClassName ?? ''}`}>{value}</div>
      {hint && <div className="text-[11px] text-amber-700">{hint}</div>}
    </div>
  );
}

/**
 * States where the valuation comes from: the live MSFT quote, or the amounts
 * frozen in the broker export. Always visible so the figures above are never
 * mistaken for a real-time portfolio.
 */
function ValuationSource({
  eurPrice,
  lastUpdated,
  loading,
  error,
  onRetry,
  importedAt,
}: {
  eurPrice: number | null;
  lastUpdated: Date | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  importedAt: string | null;
}) {
  const importDate = importedAt ? new Date(importedAt) : null;
  const importLabel =
    importDate && !isNaN(importDate.getTime())
      ? `de votre import du ${importDate.toLocaleDateString('fr-FR')}`
      : 'de votre dernier import';

  if (eurPrice !== null) {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-500">
        <span>
          Valorisé au cours MSFT de {formatEUR(eurPrice)}
          {lastUpdated ? ` (${lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})` : ''}.
        </span>
        <button
          type="button"
          onClick={onRetry}
          disabled={loading}
          className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Actualiser
        </button>
      </p>
    );
  }

  if (loading) {
    return <p className="mt-2 text-xs text-gray-500">Récupération du cours MSFT…</p>;
  }

  return (
    <p className="mt-2 flex flex-wrap items-start gap-x-1.5 gap-y-1 text-xs text-amber-700">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        Cours MSFT indisponible{error ? ` (${error})` : ''} — montants figés, issus {importLabel}.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 font-medium text-amber-800 underline-offset-2 hover:underline"
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        Réessayer
      </button>
    </p>
  );
}
