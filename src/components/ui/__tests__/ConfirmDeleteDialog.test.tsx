// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDeleteDialog } from '../ConfirmDeleteDialog';

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDeleteDialog>> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDeleteDialog
      open
      title="Effacer les ventes Fidelity ?"
      recap={['12 ventes', '340 actions']}
      body="Vos positions ne sont pas affectées."
      confirmLabel="Effacer les ventes"
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />
  );
  return { onCancel, onConfirm };
}

describe('ConfirmDeleteDialog', () => {
  it('quantifies what is about to be deleted', () => {
    setup();
    expect(screen.getByText('12 ventes')).toBeInTheDocument();
    expect(screen.getByText('340 actions')).toBeInTheDocument();
  });

  it('restates the action on the destructive button', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Effacer les ventes' })).toBeInTheDocument();
  });

  it('gives initial focus to the non-destructive Annuler button', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Annuler' })).toHaveFocus();
  });

  it('calls onConfirm only when the destructive button is pressed', async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = setup();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Effacer les ventes' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('omits the recap block when there is nothing to quantify', () => {
    setup({ recap: [] });
    expect(screen.queryByText(/Vous êtes sur le point de supprimer/)).not.toBeInTheDocument();
  });
});
