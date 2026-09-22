import React from 'react';
import { CheckCircle2, DollarSign, Layers, Trash2, TrendingUp } from 'lucide-react';
import { ConfirmDeleteDialog } from './ui/ConfirmDeleteDialog';
import { brokerLabel, formatEUR, formatUSD, originLabel } from '../lib/utils';
import type { Broker, StockLot, SoldLot } from '../lib/types';

interface SummaryProps {
  broker: Broker;
  lots?: StockLot[];
  soldLots?: SoldLot[];
  dividendsCount: number;
  dividendsGrossUsd: number;
  onClearLots?: () => void;
  onClearSales?: () => void;
  onClearDividends?: () => void;
}

type ClearTarget = 'lots' | 'sales' | 'dividends' | 'all';

/**
 * Aggregated, persistence-backed summary of what is currently loaded for a
 * given broker. Mirrors the StockExport importer's success card so all four
 * "Mes données" blocks expose the same kind of post-import feedback. Hides
 * itself when no data is loaded.
 */
export function BrokerImportSummary({ broker, lots, soldLots, dividendsCount, dividendsGrossUsd, onClearLots, onClearSales, onClearDividends }: SummaryProps) {
  const [pendingClear, setPendingClear] = React.useState<ClearTarget | null>(null);
  const hasLots = !!(lots && lots.length > 0);
  const hasSales = !!(soldLots && soldLots.length > 0);
  const hasDividends = dividendsCount > 0;
  if (!hasLots && !hasSales && !hasDividends) return null;

  const lotsTotalShares = hasLots ? lots!.reduce((s, l) => s + l.quantity, 0) : 0;
  // Prefer EUR market value when available; fall back to USD or to cost basis
  // when the lot was imported without a market price (Morgan Stanley Holdings
  // by Lot reuses the cost basis as current value by design).
  const lotsTotalEur = hasLots
    ? lots!.reduce((s, l) => {
        if (l.currentValue && l.currentValue > 0) return s + l.currentValue;
        if (l.totalCostBasis && l.totalCostBasis > 0) return s + l.totalCostBasis;
        return s;
      }, 0)
    : 0;
  const lotsTotalUsd = hasLots
    ? lots!.reduce((s, l) => s + (l.currentValueUsd ?? l.totalCostBasisUsd ?? 0), 0)
    : 0;

  const salesQty = hasSales ? soldLots!.reduce((s, sl) => s + sl.quantity, 0) : 0;
  const salesProceedsEur = hasSales ? soldLots!.reduce((s, sl) => s + sl.proceeds, 0) : 0;
  const salesProceedsUsd = hasSales ? soldLots!.reduce((s, sl) => s + (sl.proceedsUsd ?? 0), 0) : 0;
  const salesYears = hasSales
    ? Array.from(new Set(soldLots!.map((sl) => sl.saleDate.getFullYear()))).sort((a, b) => b - a)
    : [];

  // Per-origin tally for the lot list so users see at a glance the spread
  // between Stock Awards / AGA / ESPP without scrolling to the portfolio tab.
  const originCounts = hasLots
    ? lots!.reduce<Record<string, number>>((acc, l) => {
        acc[l.origin] = (acc[l.origin] ?? 0) + l.quantity;
        return acc;
      }, {})
    : {};
  const originList = Object.entries(originCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
        <span className="font-medium text-blue-800">
          Données {brokerLabel(broker)} chargées
        </span>
      </div>

      {(hasLots || hasSales) && (
        <div className="grid grid-cols-3 gap-3 mb-3">
          {hasLots && (
            <SummaryCell
              icon={<Layers className="h-3.5 w-3.5" />}
              label={`Lot${lots!.length > 1 ? 's' : ''} ouvert${lots!.length > 1 ? 's' : ''}`}
              value={lots!.length.toLocaleString('fr-FR')}
              detail={`${lotsTotalShares.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions`}
              onClear={onClearLots ? () => setPendingClear('lots') : undefined}
              clearLabel="Effacer les positions"
            />
          )}
          {hasLots && (
            <SummaryCell
              icon={<DollarSign className="h-3.5 w-3.5" />}
              label="Valeur portefeuille"
              value={lotsTotalEur > 0 ? formatEUR(lotsTotalEur) : formatUSD(lotsTotalUsd)}
              detail={lotsTotalEur > 0 && lotsTotalUsd > 0 ? formatUSD(lotsTotalUsd) : undefined}
            />
          )}
          {hasSales && (
            <SummaryCell
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label={`Vente${soldLots!.length > 1 ? 's' : ''} ${salesYears.length === 1 ? salesYears[0] : ''}`}
              value={soldLots!.length.toLocaleString('fr-FR')}
              detail={
                salesProceedsEur > 0
                  ? `${formatEUR(salesProceedsEur)} · ${salesQty.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions`
                  : salesProceedsUsd > 0
                  ? `${formatUSD(salesProceedsUsd)} · ${salesQty.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions`
                  : `${salesQty.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions`
              }
              onClear={onClearSales ? () => setPendingClear('sales') : undefined}
              clearLabel="Effacer les ventes"
            />
          )}
        </div>
      )}

      {originList.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-700 pt-2 border-t border-blue-100">
          <span className="text-gray-500">Origines :</span>
          {originList.map(([origin, qty]) => (
            <span
              key={origin}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-blue-100"
            >
              <strong>{originLabel(origin)}</strong>
              <span className="text-gray-500">·&nbsp;{qty.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</span>
            </span>
          ))}
        </div>
      )}

      {hasSales && salesYears.length > 1 && (
        <p className="mt-2 text-xs text-gray-600">
          Années couvertes : <strong>{salesYears.join(', ')}</strong>.
        </p>
      )}

      {hasDividends && (
        <div className="mt-2 flex items-start justify-between gap-2">
          <p className="text-xs text-gray-600">
            Dividendes réinvestis (DRIP) : <strong>{dividendsCount}</strong> évènement{dividendsCount > 1 ? 's' : ''}
            {dividendsGrossUsd > 0 ? <> · brut <strong>{formatUSD(dividendsGrossUsd)}</strong></> : null}.
          </p>
          {onClearDividends && (
            <button
              type="button"
              onClick={() => setPendingClear('dividends')}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors shrink-0"
              aria-label="Effacer les dividendes"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Effacer
            </button>
          )}
        </div>
      )}

      <ClearConfirmDialog
        target={pendingClear}
        broker={broker}
        recap={
          pendingClear === 'lots'
            ? [
                `${lots!.length.toLocaleString('fr-FR')} lot${lots!.length > 1 ? 's' : ''} ouvert${lots!.length > 1 ? 's' : ''}`,
                `${lotsTotalShares.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions`,
                lotsTotalEur > 0 ? formatEUR(lotsTotalEur) : lotsTotalUsd > 0 ? formatUSD(lotsTotalUsd) : null,
              ].filter((x): x is string => x !== null)
            : pendingClear === 'sales'
            ? [
                `${soldLots!.length.toLocaleString('fr-FR')} vente${soldLots!.length > 1 ? 's' : ''}`,
                `${salesQty.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions`,
                salesYears.length > 0 ? `année${salesYears.length > 1 ? 's' : ''} ${salesYears.join(', ')}` : null,
              ].filter((x): x is string => x !== null)
            : pendingClear === 'dividends'
            ? [
                `${dividendsCount.toLocaleString('fr-FR')} évènement${dividendsCount > 1 ? 's' : ''} de dividende`,
                dividendsGrossUsd > 0 ? `${formatUSD(dividendsGrossUsd)} brut` : null,
              ].filter((x): x is string => x !== null)
            : []
        }
        onCancel={() => setPendingClear(null)}
        onConfirm={() => {
          if (pendingClear === 'lots') onClearLots?.();
          else if (pendingClear === 'sales') onClearSales?.();
          else if (pendingClear === 'dividends') onClearDividends?.();
          setPendingClear(null);
        }}
      />
    </div>
  );
}

/** Inline confirmation dialog for the per-slice clear actions. Closed when
 *  `target` is null. Wording is tailored per slice and quantified with `recap`
 *  so the user knows exactly which subset of their data is about to disappear. */
export function ClearConfirmDialog({
  target,
  broker,
  recap,
  onCancel,
  onConfirm,
}: {
  target: ClearTarget | null;
  broker: Broker;
  recap: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const open = target !== null;
  const labelByTarget: Record<ClearTarget, { title: string; body: string; action: string }> = {
    lots: {
      title: `Effacer les positions ${brokerLabel(broker)} ?`,
      body: 'Vos ventes et dividendes ne sont pas affectés. Cette action est irréversible — vous pourrez ré-importer le fichier à tout moment.',
      action: 'Effacer les positions',
    },
    sales: {
      title: `Effacer les ventes ${brokerLabel(broker)} ?`,
      body: 'Vos positions et dividendes ne sont pas affectés. Cette action est irréversible — vous pourrez ré-importer le fichier à tout moment.',
      action: 'Effacer les ventes',
    },
    dividends: {
      title: `Effacer les dividendes ${brokerLabel(broker)} ?`,
      body: 'Vos positions et ventes ne sont pas affectées. Cette action est irréversible — vous pourrez ré-importer le fichier à tout moment.',
      action: 'Effacer les dividendes',
    },
    all: {
      title: `Supprimer toutes les données ${brokerLabel(broker)} ?`,
      body: 'Les données des autres courtiers ne sont pas affectées. Cette action est irréversible — vous pourrez ré-importer vos fichiers à tout moment.',
      action: 'Tout supprimer',
    },
  };
  const content = target ? labelByTarget[target] : null;
  if (!content) return null;
  return (
    <ConfirmDeleteDialog
      open={open}
      title={content.title}
      recap={recap}
      body={content.body}
      confirmLabel={content.action}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function SummaryCell({ icon, label, value, detail, onClear, clearLabel }: { icon: React.ReactNode; label: string; value: string; detail?: string; onClear?: () => void; clearLabel?: string }) {  return (
    <div className="bg-white rounded border border-blue-100 p-2 relative">
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute top-1 right-1 p-0.5 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
      <div className="flex items-center gap-1 text-[11px] text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-base font-semibold text-gray-900 tabular-nums leading-tight mt-0.5">{value}</div>
      {detail && <div className="text-[11px] text-gray-500 tabular-nums mt-0.5">{detail}</div>}
    </div>
  );
}
