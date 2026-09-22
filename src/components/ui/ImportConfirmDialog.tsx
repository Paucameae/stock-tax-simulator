import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from './button';
import { Dialog } from './dialog';

export interface ImportPreviewRow {
  key: string;
  label: string;
  /** How many records are stored right now. */
  current: number;
  /** How many there will be once the import is applied. */
  next: number;
  /** Optional secondary line, e.g. a share count or a total amount. */
  detail?: string;
}

/**
 * Last stop before an import is written. Every importer in the app replaces a
 * whole slice of data rather than appending to it, so the user is shown what
 * the file contains and what it will overwrite before anything happens.
 */
export function ImportConfirmDialog({
  open,
  title,
  fileNames,
  rows,
  replaceNotice,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  fileNames: string[];
  rows: ImportPreviewRow[];
  /** Shown when the import overwrites existing records. */
  replaceNotice: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const visibleRows = rows.filter((row) => row.current > 0 || row.next > 0);
  const overwrites = visibleRows.some((row) => row.current > 0 && row.next !== row.current);

  return (
    <Dialog open onClose={onCancel} label={title}>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>

      <ul className="mt-3 space-y-1 text-sm text-gray-700">
        {fileNames.map((name, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>{name}</span>
          </li>
        ))}
      </ul>

      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Comparaison des données avant et après import</caption>
        <thead>
          <tr className="text-xs text-gray-500">
            <th scope="col" className="py-1 text-left font-medium">Données</th>
            <th scope="col" className="py-1 text-right font-medium">Actuellement</th>
            <th scope="col" className="py-1 text-right font-medium">Après import</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.key} className="border-t border-gray-200">
              <th scope="row" className="py-1.5 text-left font-normal text-gray-700">
                {row.label}
                {row.detail && <span className="block text-xs text-gray-400">{row.detail}</span>}
              </th>
              <td className="py-1.5 text-right tabular-nums text-gray-500">
                {row.current > 0 ? row.current.toLocaleString('fr-FR') : '—'}
              </td>
              <td
                className={`py-1.5 text-right tabular-nums font-medium ${
                  row.next === row.current ? 'text-gray-400' : 'text-gray-900'
                }`}
              >
                {row.next > 0 ? row.next.toLocaleString('fr-FR') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {overwrites && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{replaceNotice}</span>
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button onClick={onConfirm}>Importer</Button>
      </div>
    </Dialog>
  );
}
