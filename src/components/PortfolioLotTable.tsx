import React from 'react';
import { ArrowUpRight, ArrowDownRight, ArrowUp, ArrowDown, Info, X, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Tooltip } from './ui/tooltip';
import { Select } from './ui/select';
import { Dialog, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { BrokerLogo } from './BrokerLogo';
import type { StockLot } from '../lib/types';
import { formatEUR, formatUSD, formatDate, originLabel, planTypeLabel, qualificationReasonLabel, qualificationReasonShort, isDripQualifiedInconsistent, DERIVED_PLAN_TYPE_HINT } from '../lib/utils';
import { lotMarketValue, lotUnrealizedGain } from '../lib/portfolio-value';

interface PortfolioTableAndCardsProps {
  filteredLots: StockLot[];
  hasMultipleBrokers: boolean;
  hasUsdImport: boolean;
  hasEsppLots: boolean;
  showFxDetails: boolean;
  sortKey: PortfolioSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: PortfolioSortKey) => void;
  /** Live MSFT price in EUR, or `null` to fall back to the exported amounts. */
  eurPrice: number | null;
  onPlanTypeChange: (lotId: string, planType: string) => void;
}

// Mirror of the inner SortKey type — exposed at module level so the helper
// component below can be typed without a circular reference.
export type PortfolioSortKey =
  | 'date'
  | 'origin'
  | 'quantity'
  | 'cost'
  | 'value'
  | 'gain'
  | 'holding'
  | 'available'
  | 'broker'
  | 'fmv';

export function PortfolioTableAndCards({
  filteredLots,
  hasMultipleBrokers,
  hasUsdImport,
  hasEsppLots,
  showFxDetails,
  sortKey,
  sortDir,
  onSort,
  eurPrice,
  onPlanTypeChange: handlePlanTypeChange,
}: PortfolioTableAndCardsProps) {
  return (
    <>
      {/* Table — desktop */}
      <div className="hidden md:block -mx-6">
        <div className="overflow-x-auto border-y border-gray-200">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
                <tr className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="date" align="left" className="sticky left-0 z-10 bg-gray-50 shadow-[1px_0_0_0_rgb(229,231,235)]">Date</SortableTh>
                  {hasMultipleBrokers && (
                    <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="broker" align="center">Courtier</SortableTh>
                  )}
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="quantity" align="right">Qté</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="cost" align="right">Prix/act.</SortableTh>
                  {hasUsdImport && showFxDetails && (
                    <>
                      <th className="text-right px-2.5 py-2 font-medium">Prix USD</th>
                      <th className="text-right px-2.5 py-2 font-medium">Taux BCE</th>
                    </>
                  )}
                  {hasEsppLots && (
                    <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="fmv" align="right">
                      <span className="inline-flex items-center gap-1">
                        FMV acq.
                        <Tooltip content="Valeur de marché à la date d'achat ESPP (avant décote 10 %). Utilisée comme prix de revient fiscal pour le calcul de la plus-value de cession." />
                      </span>
                    </SortableTh>
                  )}
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="value" align="right">Valeur</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="gain" align="right">PV/MV</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="origin" align="center">Origine</SortableTh>
                  <th className="text-center px-2.5 py-2 font-medium">
                    Régime
                    <Tooltip content="Le régime fiscal détermine le traitement de votre gain d'acquisition. Les lots FM/FQ sont automatiquement qualifiés." />
                  </th>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="holding" align="center">Détention</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="available" align="left">Dispo.</SortableTh>
                </tr>
              </thead>
              <tbody>
                {filteredLots.map((lot) => {
                  const notYetAvailable = lot.availableForSaleDate && lot.availableForSaleDate > new Date();
                  const value = lotMarketValue(lot, eurPrice);
                  const gain = lotUnrealizedGain(lot, eurPrice);
                  return (
                    <tr key={lot.id} className="border-b hover:bg-gray-50 group">
                      <td className="px-2.5 py-2 sticky left-0 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_rgb(229,231,235)]">{formatDate(lot.acquisitionDate)}</td>
                      {hasMultipleBrokers && (
                        <td className="px-2.5 py-2 text-center">
                          <BrokerLogo broker={lot.broker} className="h-5" />
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
                            {lot.rateSource === 'manual' && (
                              <span
                                className="ml-1 px-1 rounded bg-amber-100 text-amber-800 font-sans not-italic"
                                title="Taux saisi manuellement, non issu du flux BCE"
                              >
                                manuel
                              </span>
                            )}
                          </td>
                        </>
                      )}
                      {hasEsppLots && (
                        <td className="px-2.5 py-2 text-right">
                          {lot.origin === 'SP' ? formatEUR(lot.esppFmvPerShare ?? 0) : '—'}
                        </td>
                      )}
                      <td className="px-2.5 py-2 text-right">
                        {value === null ? '—' : formatEUR(value)}
                        {eurPrice === null && lot.hasUnreliableAmounts && (
                          <span
                            className="ml-1 align-middle text-amber-600"
                            title="Montant indicatif recalculé lors d'une restauration de sauvegarde : à vérifier"
                          >
                            <AlertTriangle className="inline h-3 w-3" aria-hidden="true" />
                            <span className="sr-only">Montant indicatif à vérifier</span>
                          </span>
                        )}
                      </td>
                      <td className={`px-2.5 py-2 text-right ${gain === null ? 'text-gray-400' : gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {gain === null ? (
                          '—'
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            {gain >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {formatEUR(Math.abs(gain))}
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <div className="inline-flex items-center gap-1">
                          <Badge
                            variant={lot.origin === 'SP' ? 'secondary' : lot.origin === 'FM' ? 'success' : 'default'}
                            title={qualificationReasonLabel(lot.qualificationReason, lot.awardType)}
                          >
                            {originLabel(lot.origin)}
                          </Badge>
                          {lot.isReinvestedDividend && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal"
                              title="Actions issues d'un dividende réinvesti (quantité fractionnaire)"
                            >
                              DRIP
                            </Badge>
                          )}
                          {isDripQualifiedInconsistent(lot) && (
                            <span
                              role="img"
                              aria-label="Incohérence : un dividende réinvesti ne peut pas bénéficier d'un régime qualifié"
                              title="Incohérence : un dividende réinvesti ne peut pas bénéficier du régime qualifié français. Reclassez ce lot en non qualifié."
                              className="text-amber-600"
                            >
                              ⚠
                            </span>
                          )}
                          </div>
                          {qualificationReasonShort(lot.qualificationReason, lot.awardType) && (
                            <span
                              className="text-[10px] leading-tight text-gray-500 italic max-w-[160px] truncate"
                              title={qualificationReasonLabel(lot.qualificationReason, lot.awardType)}
                            >
                              {qualificationReasonShort(lot.qualificationReason, lot.awardType)}
                            </span>
                          )}
                        </div>
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
                          <span className="text-xs text-gray-600 underline decoration-dotted underline-offset-2 cursor-help" title={DERIVED_PLAN_TYPE_HINT}>
                            {planTypeLabel(lot.planType)}
                          </span>
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
        </div>

      {/* Cards — mobile (< md) */}
      <div className="md:hidden space-y-2">
        {filteredLots.length === 0 && (
          <Card>
            <CardContent className="p-4 text-center text-sm text-gray-500">
              Aucun lot à afficher avec les filtres actuels.
            </CardContent>
          </Card>
        )}
        {filteredLots.map((lot) => (
          <MobileLotCard
            key={lot.id}
            lot={lot}
            hasMultipleBrokers={hasMultipleBrokers}
            hasUsdImport={hasUsdImport}
            hasEsppLots={hasEsppLots}
            eurPrice={eurPrice}
            onPlanTypeChange={handlePlanTypeChange}
          />
        ))}
      </div>
    </>
  );
}

// Pulled out so it can host the "Détails" dialog state per-card without
// polluting PortfolioTableAndCards' render scope.
function MobileLotCard({
  lot,
  hasMultipleBrokers,
  hasUsdImport,
  hasEsppLots,
  eurPrice,
  onPlanTypeChange: handlePlanTypeChange,
}: {
  lot: StockLot;
  hasMultipleBrokers: boolean;
  hasUsdImport: boolean;
  hasEsppLots: boolean;
  eurPrice: number | null;
  onPlanTypeChange: (lotId: string, planType: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const notYetAvailable = lot.availableForSaleDate && lot.availableForSaleDate > new Date();
  const value = lotMarketValue(lot, eurPrice);
  const gain = lotUnrealizedGain(lot, eurPrice);

  return (
    <>
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{formatDate(lot.acquisitionDate)}</div>
              <div className="text-xs text-gray-500">
                {lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions · {formatEUR(lot.costBasisPerShare)}/action
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1">
                <Badge
                  variant={lot.origin === 'SP' ? 'secondary' : lot.origin === 'FM' ? 'success' : 'default'}
                  title={qualificationReasonLabel(lot.qualificationReason, lot.awardType)}
                >
                  {originLabel(lot.origin)}
                </Badge>
                {lot.isReinvestedDividend && (
                  <Badge variant="outline" className="text-[10px] font-normal" title="Dividende réinvesti">
                    DRIP
                  </Badge>
                )}
                {isDripQualifiedInconsistent(lot) && (
                  <span
                    role="img"
                    aria-label="Incohérence DRIP / qualifié"
                    title="Incohérence : un dividende réinvesti ne peut pas bénéficier du régime qualifié français."
                    className="text-amber-600"
                  >
                    ⚠
                  </span>
                )}
              </div>
              {qualificationReasonShort(lot.qualificationReason, lot.awardType) && (
                <span
                  className="text-[10px] leading-tight text-gray-500 italic text-right max-w-[180px] truncate"
                  title={qualificationReasonLabel(lot.qualificationReason, lot.awardType)}
                >
                  {qualificationReasonShort(lot.qualificationReason, lot.awardType)}
                </span>
              )}
              {hasMultipleBrokers && (
                <BrokerLogo broker={lot.broker} className="h-5" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-gray-500">Valeur</div>
              <div className="font-medium">{value === null ? '—' : formatEUR(value)}</div>
            </div>
            <div>
              <div className="text-gray-500">PV/MV</div>
              <div className={`font-medium inline-flex items-center gap-1 ${gain === null ? 'text-gray-400' : gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {gain === null ? (
                  '—'
                ) : (
                  <>
                    {gain >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {formatEUR(Math.abs(gain))}
                  </>
                )}
              </div>
            </div>
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
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="text-xs text-primary hover:underline"
            >
              Détails
            </button>
          </div>
        </CardContent>
      </Card>

      <LotDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        lot={lot}
        hasUsdImport={hasUsdImport}
        hasEsppLots={hasEsppLots}
        eurPrice={eurPrice}
        onPlanTypeChange={handlePlanTypeChange}
      />
    </>
  );
}

// Sortable column header used inside the desktop lot table. Renders a button
// element so the entire cell is clickable and announces aria-sort to assistive
// tech. Direction icon is only drawn for the active column.
function SortableTh({
  columnKey,
  sortKey,
  sortDir,
  onSort,
  align,
  children,
  className,
}: {
  columnKey: PortfolioSortKey;
  sortKey: PortfolioSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: PortfolioSortKey) => void;
  align: 'left' | 'right' | 'center';
  children: React.ReactNode;
  className?: string;
}) {
  const active = sortKey === columnKey;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  const justifyClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`${alignClass} px-2.5 py-2 font-medium ${className ?? ''}`}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`flex w-full items-center gap-1 ${justifyClass} font-medium uppercase tracking-wide text-xs hover:text-gray-900 ${active ? 'text-gray-900' : 'text-gray-600'}`}
      >
        {children}
        {active ? (
          sortDir === 'asc'
            ? <ArrowUp className="h-3 w-3" aria-hidden="true" />
            : <ArrowDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3 w-3 opacity-0 group-hover:opacity-30" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

// Compact button + popover legend explaining the SP/DO/FM/FQ origin codes.
// Keeps the filter bar tidy compared to the previous always-visible legend row.
export function OriginCodesLegend() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline self-center"
        aria-label="Que veulent dire SP, DO, FM, FQ ?"
      >
        <Info className="h-3.5 w-3.5" />
        Codes origine
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Codes d'origine des lots" className="max-w-lg">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-base font-semibold">Codes d'origine des lots</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2"><Badge variant="default">SP</Badge> <span><strong>ESPP</strong> — Employee Stock Purchase Plan : achat d'actions avec décote 10 %.</span></li>
          <li className="flex items-start gap-2"><Badge variant="default">DO</Badge> <span><strong>Stock Award</strong> — RSU / Discretionary Award. Le régime fiscal n'est pas indiqué : à confirmer auprès de votre RH.</span></li>
          <li className="flex items-start gap-2"><Badge variant="default">FM</Badge> <span><strong>AGA Macron</strong> — Attribution gratuite d'actions qualifiée (post-2018).</span></li>
          <li className="flex items-start gap-2"><Badge variant="default">FQ</Badge> <span><strong>AGA pré-Macron</strong> — Attribution gratuite d'actions qualifiée (pré-2018).</span></li>
        </ul>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Fermer</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

// Full-detail dialog used on mobile so the compact card can stay scannable
// while still giving access to FX, regime, and plan-type controls on demand.
function LotDetailsDialog({
  open,
  onClose,
  lot,
  hasUsdImport,
  hasEsppLots,
  eurPrice,
  onPlanTypeChange,
}: {
  open: boolean;
  onClose: () => void;
  lot: StockLot;
  hasUsdImport: boolean;
  hasEsppLots: boolean;
  eurPrice: number | null;
  onPlanTypeChange: (lotId: string, planType: string) => void;
}) {
  const value = lotMarketValue(lot, eurPrice);
  const gain = lotUnrealizedGain(lot, eurPrice);
  return (
    <Dialog open={open} onClose={onClose} label={`Détail du lot du ${formatDate(lot.acquisitionDate)}`} className="max-w-md">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold">Lot du {formatDate(lot.acquisitionDate)}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions ·{' '}
            <Badge variant={lot.origin === 'SP' ? 'secondary' : lot.origin === 'FM' ? 'success' : 'default'}>{originLabel(lot.origin)}</Badge>
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fermer">
          <X className="h-5 w-5" />
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500">Prix de revient</dt>
        <dd className="text-right font-medium">{formatEUR(lot.costBasisPerShare)}/act.</dd>

        {hasEsppLots && lot.origin === 'SP' && (
          <>
            <dt className="text-gray-500">FMV à l'acquisition</dt>
            <dd className="text-right font-medium">{formatEUR(lot.esppFmvPerShare ?? 0)}</dd>
          </>
        )}

        <dt className="text-gray-500">Valeur actuelle</dt>
        <dd className="text-right font-medium">{value === null ? '—' : formatEUR(value)}</dd>

        <dt className="text-gray-500">PV/MV latente</dt>
        <dd className={`text-right font-medium ${gain === null ? 'text-gray-400' : gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {gain === null ? '—' : `${gain >= 0 ? '+' : ''}${formatEUR(gain)}`}
        </dd>

        {hasUsdImport && lot.costBasisPerShareUsd && (
          <>
            <dt className="text-gray-500">Prix USD</dt>
            <dd className="text-right font-mono text-xs">{formatUSD(lot.costBasisPerShareUsd)}</dd>
            <dt className="text-gray-500">{lot.rateSource === 'manual' ? 'Taux manuel' : 'Taux BCE'}</dt>
            <dd className="text-right font-mono text-xs">{lot.eurUsdRate?.toFixed(4) ?? '—'}</dd>
          </>
        )}

        <dt className="text-gray-500">Détention</dt>
        <dd className="text-right">
          <Badge variant={lot.holdingPeriod === 'Long' ? 'success' : 'outline'}>
            {lot.holdingPeriod === 'Long' ? '≥ 2 ans' : '< 2 ans'}
          </Badge>
        </dd>

        <dt className="text-gray-500">Disponibilité</dt>
        <dd className="text-right">
          {lot.availableForSaleDate && lot.availableForSaleDate > new Date()
            ? <span className="text-amber-600 text-xs font-medium">{formatDate(lot.availableForSaleDate)}</span>
            : <span className="text-green-600 text-xs">Disponible</span>}
        </dd>

        <dt className="text-gray-500">Régime fiscal</dt>
        <dd className="text-right">
          {lot.origin === 'DO' ? (
            <Select
              value={lot.planType}
              onChange={(e) => onPlanTypeChange(lot.id, e.target.value)}
              className="text-xs h-8 w-40 ml-auto"
              aria-label="Statut fiscal"
            >
              <option value="qualified_macron">Qualifié (Macron)</option>
              <option value="non_qualified">Non qualifié</option>
            </Select>
          ) : (
            <span className="text-xs text-gray-600 underline decoration-dotted underline-offset-2 cursor-help" title={DERIVED_PLAN_TYPE_HINT}>
              {planTypeLabel(lot.planType)}
            </span>
          )}
        </dd>
      </dl>
      <DialogFooter>
        <Button onClick={onClose}>Fermer</Button>
      </DialogFooter>
    </Dialog>
  );
}
