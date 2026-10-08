// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExplainButton } from '../ExplainButton';

const explain = vi.fn();
const reset = vi.fn();

vi.mock('../../../hooks/useAiExplain', () => ({
  useAiExplain: () => ({
    answer: null,
    loading: false,
    error: null,
    explain,
    reset,
  }),
}));

describe('ExplainButton', () => {
  beforeEach(() => {
    explain.mockReset();
    reset.mockReset();
  });

  it('informs the user before sending calculated facts to Azure OpenAI', async () => {
    const user = userEvent.setup();
    const facts = { impotTotalEUR: 1234 };
    render(<ExplainButton topic="Calcul fiscal" facts={facts} />);

    await user.click(screen.getByRole('button', { name: 'Expliquer ce calcul' }));

    expect(screen.getByText(/transmis à Azure OpenAI/)).toBeInTheDocument();
    expect(explain).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: "Générer l'explication" }));

    expect(explain).toHaveBeenCalledWith({ topic: 'Calcul fiscal', facts });
  });
});
