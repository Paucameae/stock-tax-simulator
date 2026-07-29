// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Dialog, DialogFooter } from '../dialog';

function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = React.useState(initialOpen);
  return (
    <>
      <button onClick={() => setOpen(true)}>Ouvrir</button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Confirmer la suppression">
        <h2>Confirmer la suppression</h2>
        <DialogFooter>
          <button>Annuler</button>
          <button>Effacer</button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('exposes an accessible name', () => {
    render(<Harness initialOpen />);
    expect(screen.getByRole('dialog', { name: 'Confirmer la suppression' })).toBeInTheDocument();
  });

  it('moves focus to the first focusable element on open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
  });

  it('restores focus to the trigger when closed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Ouvrir' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness initialOpen />);
    const cancel = screen.getByRole('button', { name: 'Annuler' });
    const erase = screen.getByRole('button', { name: 'Effacer' });
    cancel.focus();
    await user.tab();
    expect(erase).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(erase).toHaveFocus();
  });

  it('locks background scrolling while open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <Dialog open onClose={onClose} label="Titre">
        <button>Action</button>
      </Dialog>
    );
    const backdrop = container.querySelector('.bg-black\\/50') as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
