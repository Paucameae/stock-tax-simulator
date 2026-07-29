import React from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';
import { onStorageFailure, type StorageFailure } from '../lib/storage';

interface StorageAlertBannerProps {
  /** Downloads a JSON backup of the current state. */
  onExport: () => void;
}

const MESSAGES: Record<StorageFailure['reason'], string> = {
  quota: "Sauvegarde impossible — le quota de stockage du navigateur est atteint. Vos dernières modifications ne seront pas conservées au rechargement.",
  unavailable: "Sauvegarde impossible — ce navigateur refuse le stockage local (navigation privée ?). Vos dernières modifications ne seront pas conservées au rechargement.",
};

/**
 * Persistent banner shown when a localStorage write fails. Data lives only in
 * memory from that point on, so the only safe exit is exporting a JSON backup.
 */
export function StorageAlertBanner({ onExport }: StorageAlertBannerProps) {
  const [failure, setFailure] = React.useState<StorageFailure | null>(null);

  React.useEffect(() => onStorageFailure(setFailure), []);

  if (!failure) return null;

  return (
    <div role="alert" className="bg-red-600 text-white">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-start gap-3 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="flex-1">{MESSAGES[failure.reason]}</p>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-1.5 shrink-0 rounded-md bg-white px-3 py-1.5 font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter mes données
        </button>
        <button
          type="button"
          onClick={() => setFailure(null)}
          aria-label="Masquer l'alerte de sauvegarde"
          className="shrink-0 rounded-md p-1 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
