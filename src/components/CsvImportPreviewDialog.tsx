import { ImportConfirmDialog } from './ui/ImportConfirmDialog';
import { brokerLabel } from '../lib/utils';
import type { PendingImport } from '../lib/import-files';
import type { Broker } from '../lib/types';

/**
 * Turns a pending batch into the generic import-confirmation dialog. A slice
 * absent from the files is left untouched: the caller only invokes the
 * matching handler when there is something to publish.
 */
export function ImportPreviewDialog({
  pending,
  broker,
  currentLots,
  currentSold,
  currentDividends,
  onCancel,
  onConfirm,
}: {
  pending: PendingImport | null;
  broker: Broker;
  currentLots: number;
  currentSold: number;
  currentDividends: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!pending) return null;

  const shares = pending.lots.reduce((sum, lot) => sum + lot.quantity, 0);

  return (
    <ImportConfirmDialog
      open
      title={`Confirmer l\u2019import ${brokerLabel(broker)}`}
      fileNames={pending.files.map(
        (file) => `${file.name} — ${file.summary ?? (file.kind === 'positions' ? 'positions' : 'ventes')}`
      )}
      rows={[
        {
          key: 'lots',
          label: 'Positions ouvertes',
          current: currentLots,
          next: pending.lots.length > 0 ? pending.lots.length : currentLots,
          detail: pending.lots.length > 0 ? `${shares.toLocaleString('fr-FR')} actions` : undefined,
        },
        {
          key: 'sales',
          label: 'Ventes',
          current: currentSold,
          next: pending.sold.length > 0 ? pending.sold.length : currentSold,
        },
        {
          key: 'dividends',
          label: 'Dividendes',
          current: currentDividends,
          next: pending.dividends.length > 0 ? pending.dividends.length : currentDividends,
        },
      ]}
      replaceNotice={`L\u2019import remplace les données ${brokerLabel(broker)} concernées — il ne s\u2019y ajoute pas. Les autres courtiers ne sont pas touchés.`}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
