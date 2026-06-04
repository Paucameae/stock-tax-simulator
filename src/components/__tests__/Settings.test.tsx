// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock pdfjs-dist (imported transitively by Settings → tax-notice-parser)
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

// Must import AFTER mocks are set up
const { Settings } = await import('../Settings');

const DEFAULT_SETTINGS = {
  familyStatus: 'single' as const,
  numberOfChildren: 0,
  taxShares: 1,
  taxSharesManual: false,
  otherTaxableIncome: 0,
  defaultPlanType: 'qualified_macron' as const,
  priorLosses: 0,
};

describe('Settings component', () => {
  it('renders family status select', () => {
    render(<Settings settings={DEFAULT_SETTINGS} onSettingsChange={vi.fn()} />);
    expect(screen.getByText('Célibataire')).toBeInTheDocument();
  });

  it('auto-saves debounced settings changes without a manual click', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Settings settings={DEFAULT_SETTINGS} onSettingsChange={onChange} />);
    const incomeInput = screen.getByPlaceholderText('Ex: 80 000');
    fireEvent.change(incomeInput, { target: { value: '50000' } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ otherTaxableIncome: 50000 }));
    vi.useRealTimers();
  });

  it('shows "Enregistré" after auto-save', () => {
    vi.useFakeTimers();
    render(<Settings settings={DEFAULT_SETTINGS} onSettingsChange={vi.fn()} />);
    const incomeInput = screen.getByPlaceholderText('Ex: 80 000');
    fireEvent.change(incomeInput, { target: { value: '50000' } });
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByText('Enregistré')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
