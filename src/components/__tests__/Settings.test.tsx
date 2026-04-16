// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

  it('shows dirty indicator when settings change', () => {
    render(<Settings settings={DEFAULT_SETTINGS} onSettingsChange={vi.fn()} />);
    const incomeInput = screen.getByPlaceholderText('Ex: 80 000');
    fireEvent.change(incomeInput, { target: { value: '50000' } });
    expect(screen.getByText(/modifications non enregistrées/i)).toBeInTheDocument();
  });

  it('calls onSettingsChange on save', () => {
    const onChange = vi.fn();
    render(<Settings settings={DEFAULT_SETTINGS} onSettingsChange={onChange} />);
    const incomeInput = screen.getByPlaceholderText('Ex: 80 000');
    fireEvent.change(incomeInput, { target: { value: '50000' } });
    const saveButton = screen.getByText('Enregistrer');
    fireEvent.click(saveButton);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ otherTaxableIncome: 50000 }));
  });

  it('shows "Enregistré !" after save', () => {
    render(<Settings settings={DEFAULT_SETTINGS} onSettingsChange={vi.fn()} />);
    const incomeInput = screen.getByPlaceholderText('Ex: 80 000');
    fireEvent.change(incomeInput, { target: { value: '50000' } });
    fireEvent.click(screen.getByText('Enregistrer'));
    expect(screen.getByText('Enregistré !')).toBeInTheDocument();
  });

  it('renders PDF upload button directly (always visible)', () => {
    render(<Settings settings={DEFAULT_SETTINGS} onSettingsChange={vi.fn()} />);
    expect(screen.getByText('Choisir un PDF')).toBeInTheDocument();
  });
});
