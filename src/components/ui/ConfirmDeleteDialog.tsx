import { Dialog, DialogFooter } from './dialog';
import { Button } from './button';

interface ConfirmDeleteDialogProps {
  open: boolean;
  /** Question posed to the user, e.g. "Effacer les ventes Fidelity ?". */
  title: string;
  /**
   * Quantified inventory of what is about to disappear (one bullet per line),
   * so the confirmation is never a vague "êtes-vous sûr ?".
   */
  recap: string[];
  /** What is *not* affected, and how the data can be recovered. */
  body: string;
  /** Label of the destructive button, restating the action ("Effacer les ventes"). */
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Shared confirmation dialog for destructive actions. "Annuler" is the primary
 * button and receives focus first (it is the first focusable element in the
 * dialog), while the destructive action is de-emphasised but unmistakably red.
 */
export function ConfirmDeleteDialog({
  open,
  title,
  recap,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} label={title}>
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      {recap.length > 0 && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-medium">Vous êtes sur le point de supprimer :</p>
          <ul className="mt-1 list-disc list-inside space-y-0.5 tabular-nums">
            {recap.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-gray-600 mb-2">{body}</p>
      <p className="text-xs text-gray-500 mb-4">
        Astuce : exportez d&rsquo;abord une sauvegarde JSON depuis l&rsquo;onglet <strong>Paramètres</strong> &rarr; Sauvegarde.
      </p>
      <DialogFooter>
        <Button onClick={onCancel}>Annuler</Button>
        <Button
          variant="outline"
          onClick={onConfirm}
          className="border-red-300 text-red-600 hover:bg-red-50"
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
