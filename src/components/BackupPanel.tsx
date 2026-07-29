import React from 'react';
import { Download, Upload, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogHeader, DialogFooter } from './ui/dialog';
import {
  downloadBackup,
  importFromJsonString,
  type BackupInput,
  type ImportResult,
} from '../lib/backup';
import { subscribeToPortfolioSaves, getLastPortfolioSave } from '../lib/portfolio-storage';
import type { AppSettings } from '../lib/types';

interface BackupPanelProps {
  current: BackupInput;
  defaults: AppSettings;
  onImport: (result: ImportResult) => void;
  /** When true, render bare body without the outer Card (parent provides one). */
  embedded?: boolean;
}

const MAX_BACKUP_SIZE = 10 * 1024 * 1024; // 10 MB — generous; a typical backup is < 100 KB

function formatSaveDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function BackupPanel({ current, defaults, onImport, embedded = false }: BackupPanelProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const lastSave = React.useSyncExternalStore(subscribeToPortfolioSaves, getLastPortfolioSave);
  const [pendingImport, setPendingImport] = React.useState<ImportResult | null>(null);
  const [status, setStatus] = React.useState<
    | { kind: 'idle' }
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string }
    | { kind: 'loading' }
  >({ kind: 'idle' });

  const handleExport = () => {
    try {
      downloadBackup(current);
      setStatus({ kind: 'success', message: 'Sauvegarde téléchargée.' });
    } catch (err) {
      setStatus({ kind: 'error', message: 'Erreur lors de l\'export : ' + (err as Error).message });
    }
  };

  const handleFile = async (file: File) => {
    if (file.size > MAX_BACKUP_SIZE) {
      setStatus({ kind: 'error', message: 'Fichier trop volumineux (> 10 Mo).' });
      return;
    }
    if (file.size === 0) {
      setStatus({ kind: 'error', message: 'Le fichier est vide.' });
      return;
    }

    setStatus({ kind: 'loading' });
    try {
      const text = await file.text();
      const result = importFromJsonString(text, defaults);
      // Open the confirmation dialog; actual import is deferred to confirmImport().
      setPendingImport(result);
      setStatus({ kind: 'idle' });
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message });
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    onImport(pendingImport);
    const warningSuffix = pendingImport.warnings.length > 0 ? ` — ${pendingImport.warnings.join(' ')}` : '';
    setStatus({ kind: 'success', message: `Sauvegarde restaurée.${warningSuffix}` });
    setPendingImport(null);
  };

  const cancelImport = () => {
    setPendingImport(null);
    setStatus({ kind: 'idle' });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so selecting the same file again re-triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const body = (
    <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exporter (JSON)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={status.kind === 'loading'}
            className="gap-1.5"
          >
            {status.kind === 'loading' ? (
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            Importer une sauvegarde
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>

        <p className="text-xs text-gray-500">
          Contenu de la sauvegarde : paramètres fiscaux, positions, ventes, historique de simulations.
          Aucune donnée n'est envoyée sur un serveur.
        </p>

        <p className="text-xs text-gray-500 flex items-start gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600" aria-hidden="true" />
          {lastSave
            ? `Positions et ventes enregistrées automatiquement dans ce navigateur — dernière écriture le ${formatSaveDate(lastSave)}.`
            : "Positions et ventes enregistrées automatiquement dans ce navigateur dès le premier import."}
        </p>

        {status.kind === 'success' && (
          <p
            className="text-sm text-green-700 flex items-start gap-1.5"
            role="status"
            aria-live="polite"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            {status.message}
          </p>
        )}
        {status.kind === 'error' && (
          <p
            className="text-sm text-red-600 flex items-start gap-1.5"
            role="alert"
            aria-live="assertive"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            {status.message}
          </p>
        )}
    </div>
  );

  const rejected = pendingImport
    ? pendingImport.counts.lotsRejected + pendingImport.counts.soldLotsRejected + pendingImport.counts.grantsRejected
    : 0;

  const dialog = (
    <Dialog open={pendingImport !== null} onClose={cancelImport} label="Restaurer cette sauvegarde ?">
      <DialogHeader>
        <p className="font-semibold text-gray-900 mb-1">Restaurer cette sauvegarde ?</p>
        <p>
          Vos données actuelles seront <strong>remplacées</strong>. Comparez avant de confirmer :
        </p>
      </DialogHeader>

      {pendingImport && (
        <>
          <table className="w-full text-sm my-3 border border-gray-200 rounded">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600">
                <th scope="col" className="text-left font-medium px-2 py-1.5">Donnée</th>
                <th scope="col" className="text-right font-medium px-2 py-1.5">Actuel</th>
                <th scope="col" className="text-right font-medium px-2 py-1.5">Après restauration</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(
                [
                  ['Positions', current.lots.length, pendingImport.counts.lotsKept],
                  ['Ventes', current.soldLots.length, pendingImport.counts.soldLotsKept],
                  ['Grants StockExport', current.grants?.length ?? 0, pendingImport.counts.grantsKept],
                  ['Simulations enregistrées', current.savedSimulations.length, pendingImport.counts.savedSimulations],
                ] as const
              ).map(([label, before, after]) => (
                <tr key={label} className="border-t border-gray-100">
                  <th scope="row" className="text-left font-normal px-2 py-1.5">{label}</th>
                  <td className="text-right px-2 py-1.5 text-gray-500">{before.toLocaleString('fr-FR')}</td>
                  <td
                    className={`text-right px-2 py-1.5 font-medium ${after < before ? 'text-red-600' : 'text-gray-900'}`}
                  >
                    {after.toLocaleString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-xs text-gray-500">
            Fichier au format v{pendingImport.version}
            {pendingImport.exportedAt
              ? ` · exporté le ${pendingImport.exportedAt.toLocaleDateString('fr-FR')}`
              : ''}
            .
          </p>

          {rejected > 0 && (
            <div
              role="alert"
              className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <p className="font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {rejected.toLocaleString('fr-FR')} ligne{rejected > 1 ? 's' : ''} de ce fichier n
                {rejected > 1 ? 'e sont pas' : "'est pas"} exploitable
                {rejected > 1 ? 's' : ''} et ser{rejected > 1 ? 'ont' : 'a'} ignorée
                {rejected > 1 ? 's' : ''}.
              </p>
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {pendingImport.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {rejected === 0 && pendingImport.counts.degraded > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="flex items-start gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                {pendingImport.counts.degraded.toLocaleString('fr-FR')} ligne
                {pendingImport.counts.degraded > 1 ? 's' : ''} conservée
                {pendingImport.counts.degraded > 1 ? 's' : ''} avec des montants indicatifs recalculés.
                Les montants servant au calcul d&rsquo;impôt sont intacts.
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-600">
              Cette action ne peut pas être annulée. Sauvegardez d&rsquo;abord vos données actuelles.
            </p>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 shrink-0">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Exporter l&rsquo;état actuel
            </Button>
          </div>
        </>
      )}

      <DialogFooter>
        <Button onClick={cancelImport}>Annuler</Button>
        <Button
          variant="outline"
          onClick={confirmImport}
          className="border-red-300 text-red-600 hover:bg-red-50"
        >
          {rejected > 0 ? 'Remplacer malgré les lignes ignorées' : 'Remplacer mes données'}
        </Button>
      </DialogFooter>
    </Dialog>
  );

  if (embedded) {
    return (
      <>
        {body}
        {dialog}
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Sauvegarde &amp; restauration
        </CardTitle>
        <CardDescription>
          Vos données sont stockées localement dans ce navigateur. Exportez une sauvegarde pour les transférer sur un autre appareil ou les conserver en sécurité.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
      {dialog}
    </Card>
  );
}
