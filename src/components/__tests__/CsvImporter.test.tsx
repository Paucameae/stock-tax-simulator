// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the ECB conversion hook — CsvImporter tests focus on file handling,
// not network/rate conversion which is covered in ecb-rates.test.ts.
vi.mock('../../hooks/useEcbConversion', () => ({
  useEcbConversion: () => ({
    convertLots: vi.fn(async (lots: unknown) => ({ converted: lots, missingCount: 0 })),
    convertSoldLots: vi.fn(async (lots: unknown) => ({ converted: lots, missingCount: 0 })),
    loading: false,
    error: null as string | null,
  }),
}));

const { CsvImporter } = await import('../CsvImporter');

const HEADER = "Date d'acquisition,Quantité,\"Coût total\",\"Coût/action\",\"Valeur actuelle\",\"+/- value\",\"Dispo vente\",\"Dispo transfert\",\"Date attribution\",Origine,\"Période détention\"";
const VALID_ROW = 'Mar-15-2023,100,25000,250,40000,15000,Mar-15-2024,Mar-15-2024,Jan-01-2022,DO,Short';
const VALID_CSV = [HEADER, VALID_ROW].join('\n');

function makeFile(content: string, name = 'positions.csv', sizeOverride?: number): File {
  const file = new File([content], name, { type: 'text/csv' });
  if (sizeOverride !== undefined) {
    Object.defineProperty(file, 'size', { value: sizeOverride });
  }
  return file;
}

function getDropzone(): HTMLElement {
  return screen.getByRole('button', { name: /Zone d'import/i });
}

describe('CsvImporter', () => {
  it('rejects files larger than 5 MB', async () => {
    const onImport = vi.fn();
    render(<CsvImporter onImport={onImport} />);

    const file = makeFile('x', 'huge.csv', 6 * 1024 * 1024);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/trop volumineux/i);
    });
    expect(onImport).not.toHaveBeenCalled();
  });

  it('rejects empty files', async () => {
    const onImport = vi.fn();
    render(<CsvImporter onImport={onImport} />);

    const file = makeFile('', 'empty.csv', 0);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/vide/i);
    });
    expect(onImport).not.toHaveBeenCalled();
  });

  it('imports valid positions CSV and calls onImport', async () => {
    const onImport = vi.fn();
    render(<CsvImporter onImport={onImport} />);

    const file = makeFile(VALID_CSV, 'positions.csv');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledOnce();
    });
    const importedLots = onImport.mock.calls[0][0];
    expect(importedLots).toHaveLength(1);
    expect(importedLots[0].quantity).toBe(100);
  });

  it('shows error when CSV contains no valid positions rows', async () => {
    const onImport = vi.fn();
    render(<CsvImporter onImport={onImport} />);

    const file = makeFile(HEADER, 'header-only.csv');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Aucun lot/i);
    });
    expect(onImport).not.toHaveBeenCalled();
  });

  it('rejects EUR files with clear error message', async () => {
    const onImport = vi.fn();
    render(<CsvImporter onImport={onImport} />);

    const eurCsv = [HEADER, VALID_ROW, 'Les valeurs sont affichées en EUR'].join('\n');
    const file = makeFile(eurCsv, 'eur.csv');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/USD/i);
    });
  });

  it('displays the filename after file selection', async () => {
    render(<CsvImporter onImport={vi.fn()} />);

    const file = makeFile(VALID_CSV, 'my-positions.csv');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('my-positions.csv')).toBeInTheDocument();
    });
  });

  it('exposes the dropzone as an accessible button', () => {
    render(<CsvImporter onImport={vi.fn()} />);
    const zone = getDropzone();
    expect(zone).toHaveAttribute('tabIndex', '0');
  });

  it('opens guide when help button is clicked', () => {
    render(<CsvImporter onImport={vi.fn()} />);
    const helpButton = screen.getByRole('button', { name: /guide d'export/i });
    fireEvent.click(helpButton);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('toggles between positions and sales import modes', () => {
    render(<CsvImporter onImport={vi.fn()} onImportSales={vi.fn()} />);

    // Default is positions
    expect(screen.getByText('Simuler une vente future')).toBeInTheDocument();

    // Switch to sales mode
    fireEvent.click(screen.getByText('Ventes effectuées'));
    expect(screen.getByText(/Calculer l.impôt et déclarer/)).toBeInTheDocument();
  });
});
