// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManualRateDialog, type MissingRateEntry } from '../ManualRateDialog';

const entries: MissingRateEntry[] = [
  { dateKey: '2024-03-15', suggested: 1.0876, rowCount: 3 },
  { dateKey: '2024-06-01', rowCount: 1 },
];

function setup(onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(<ManualRateDialog open entries={entries} onCancel={onCancel} onConfirm={onConfirm} />);
  return { onConfirm, onCancel };
}

describe('ManualRateDialog', () => {
  it('prefills the suggested rate and leaves unknown dates empty', () => {
    setup();
    expect(screen.getByLabelText(/15\/03\/2024/)).toHaveValue(1.0876);
    expect(screen.getByLabelText(/01\/06\/2024/)).toHaveValue(null);
  });

  it('keeps the confirm button disabled until every rate is plausible', async () => {
    const user = userEvent.setup();
    setup();
    const confirm = screen.getByRole('button', { name: /Appliquer et importer/ });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/01\/06\/2024/), '42');
    expect(confirm).toBeDisabled();

    await user.clear(screen.getByLabelText(/01\/06\/2024/));
    await user.type(screen.getByLabelText(/01\/06\/2024/), '1.09');
    expect(confirm).toBeEnabled();
  });

  it('confirms with one rate per date key', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.type(screen.getByLabelText(/01\/06\/2024/), '1.09');
    await user.click(screen.getByRole('button', { name: /Appliquer et importer/ }));
    expect(onConfirm).toHaveBeenCalledWith({ '2024-03-15': 1.0876, '2024-06-01': 1.09 });
  });

  it('cancels the whole import', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.click(screen.getByRole('button', { name: /Annuler l’import/ }));
    expect(onCancel).toHaveBeenCalled();
  });
});
