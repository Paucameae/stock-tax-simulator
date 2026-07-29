import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogHeader, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { MIN_PLAUSIBLE_RATE, MAX_PLAUSIBLE_RATE, isPlausibleRate } from '../lib/ecb-rates';

export interface MissingRateEntry {
  /** "YYYY-MM-DD" of the date whose rate is missing. */
  dateKey: string;
  /** Closest known rate, used to prefill the field. */
  suggested?: number;
  /** How many rows of the import depend on this date. */
  rowCount: number;
}

interface ManualRateDialogProps {
  open: boolean;
  entries: MissingRateEntry[];
  onCancel: () => void;
  onConfirm: (rates: Record<string, number>) => void;
}

function formatDay(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR');
}

/**
 * Blocks an import whose EUR/USD rates could not be resolved, and collects a
 * rate per date instead of letting the rows through with 0 € amounts.
 */
export function ManualRateDialog({ open, entries, onCancel, onConfirm }: ManualRateDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} label="Taux de change manquants">
      {open && (
        // Remounted whenever a different set of dates comes in, so the fields
        // restart from the suggested values.
        <RateForm
          key={entries.map((e) => e.dateKey).join('|')}
          entries={entries}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </Dialog>
  );
}

function RateForm({ entries, onCancel, onConfirm }: Omit<ManualRateDialogProps, 'open'>) {
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(entries.map((e) => [e.dateKey, e.suggested ? e.suggested.toFixed(4) : '']))
  );

  const parsed = entries.map((e) => ({ ...e, rate: Number(values[e.dateKey]?.replace(',', '.')) }));
  const allValid = parsed.every((p) => isPlausibleRate(p.rate));

  return (
    <>
      <DialogHeader>
        <p className="font-semibold text-gray-900 mb-1">Taux de change manquants</p>
        <p>
          Le taux EUR/USD de la Banque centrale européenne n&rsquo;a pas pu être récupéré pour{' '}
          {entries.length === 1 ? 'une date' : `${entries.length} dates`}. Sans ce taux, les montants
          en euros seraient à 0 € et votre déclaration serait fausse.
        </p>
        <p className="mt-2">
          Saisissez le taux manquant (1 € = ? $) ou annulez pour réessayer plus tard.
        </p>
      </DialogHeader>

      <div className="my-3 space-y-2">
        {parsed.map((entry) => {
          const invalid = values[entry.dateKey] !== '' && !isPlausibleRate(entry.rate);
          return (
            <div key={entry.dateKey} className="flex items-center gap-3">
              <label htmlFor={`rate-${entry.dateKey}`} className="flex-1 text-sm">
                {formatDay(entry.dateKey)}
                <span className="text-gray-500"> · {entry.rowCount} ligne{entry.rowCount > 1 ? 's' : ''}</span>
              </label>
              <input
                id={`rate-${entry.dateKey}`}
                type="number"
                step="0.0001"
                min={MIN_PLAUSIBLE_RATE}
                max={MAX_PLAUSIBLE_RATE}
                inputMode="decimal"
                value={values[entry.dateKey] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [entry.dateKey]: e.target.value }))}
                aria-invalid={invalid}
                className={`w-28 h-9 px-2 rounded-md border text-sm tabular-nums text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  invalid ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
              />
            </div>
          );
        })}
      </div>

      {!allValid && (
        <p className="text-xs text-red-600 flex items-start gap-1.5" role="status">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          Chaque taux doit être compris entre {MIN_PLAUSIBLE_RATE} et {MAX_PLAUSIBLE_RATE}.
        </p>
      )}
      <p className="mt-2 text-xs text-gray-500">
        Les valeurs proposées sont les taux BCE connus les plus proches de chaque date. Les lignes
        concernées seront signalées comme converties avec un taux manuel.
      </p>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Annuler l&rsquo;import
        </Button>
        <Button
          disabled={!allValid}
          onClick={() => onConfirm(Object.fromEntries(parsed.map((p) => [p.dateKey, p.rate])))}
        >
          Appliquer et importer
        </Button>
      </DialogFooter>
    </>
  );
}
