// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaxRulesPanel } from '../TaxRulesPanel';
import { getTaxConfig, LATEST_TAX_YEAR, TAX_RATE_SOURCES } from '../../lib/tax-rates';

/**
 * Sections are collapsed by default: open the one under test and return its
 * container so assertions cannot accidentally match another section.
 */
async function openSection(title: RegExp) {
  const user = userEvent.setup();
  const header = screen.getByRole('button', { name: title });
  await user.click(header);
  return header.parentElement!;
}

describe('TaxRulesPanel', () => {
  it("annonce l'année des taux affichés", () => {
    render(<TaxRulesPanel onClose={vi.fn()} fiscalYear={2025} />);
    expect(screen.getByText('Taux applicables aux revenus 2025')).toBeInTheDocument();
  });

  it('affiche la CSG déductible et les PS du moteur, pas des valeurs figées', async () => {
    const cfg = getTaxConfig(2025);
    render(<TaxRulesPanel onClose={vi.fn()} fiscalYear={2025} />);
    const section = await openSection(/Plus\/moins-values de cession/);

    // 6,8 % : la valeur qui avait dérivé à 8,2 % quand elle était en dur.
    expect(within(section).getByText("CSG déductible l'année suivante").parentElement)
      .toHaveTextContent('6,8 %');
    expect(cfg.csgDeductible).toBe(0.068);
    expect(within(section).getByText('IR forfaitaire').parentElement).toHaveTextContent('12,8 %');
    expect(within(section).getByText('Total').parentElement).toHaveTextContent('31,4 %');
  });

  it('suit le millésime pour les dividendes (17,2 % en 2025, 18,6 % en 2026)', async () => {
    const { unmount } = render(<TaxRulesPanel onClose={vi.fn()} fiscalYear={2025} />);
    let section = await openSection(/Dividendes/);
    // Règle du fait générateur : les dividendes versés en 2025 restent à 17,2 %.
    expect(section).toHaveTextContent('12,8 % IR + 17,2 % PS = 30 %');
    unmount();

    render(<TaxRulesPanel onClose={vi.fn()} fiscalYear={2026} />);
    section = await openSection(/Dividendes/);
    expect(section).toHaveTextContent('12,8 % IR + 18,6 % PS = 31,4 %');
  });

  it("affiche le barème IR du millésime et non un barème figé", async () => {
    const cfg = getTaxConfig(2025);
    render(<TaxRulesPanel onClose={vi.fn()} fiscalYear={2025} />);
    const section = await openSection(/Barème progressif de l'IR/);

    expect(section).toHaveTextContent("Jusqu'à 11 600 €");
    expect(section).toHaveTextContent('Au-delà de 181 917 €');
    expect(cfg.brackets[0].limit).toBe(11600);
  });

  it("avertit quand l'année demandée n'a pas de barème vérifié", () => {
    render(<TaxRulesPanel onClose={vi.fn()} fiscalYear={LATEST_TAX_YEAR + 1} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(`Aucun barème vérifié pour ${LATEST_TAX_YEAR + 1}`);
    expect(screen.getByText(`Taux applicables aux revenus ${LATEST_TAX_YEAR}`)).toBeInTheDocument();
  });

  it('reste silencieux quand le millésime est couvert', () => {
    render(<TaxRulesPanel onClose={vi.fn()} fiscalYear={2025} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('expose la provenance et la date de vérification de chaque taux', async () => {
    render(<TaxRulesPanel onClose={vi.fn()} fiscalYear={2025} />);
    const section = await openSection(/Sources et dates de vérification/);

    expect(section).toHaveTextContent('CGI art. 154 quinquies, II');
    expect(section).toHaveTextContent('CSS art. L. 136-8, I, 1°');
    expect(section).toHaveTextContent('vérifié le 22/09/2026');
    // Deux taux citent le même article (patrimoine et dividendes) : les deux
    // doivent pointer vers le texte consolidé.
    const links = within(section).getAllByRole('link', { name: /154 quinquies/ });
    expect(links.length).toBe(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', TAX_RATE_SOURCES.csgDeductible.url!);
    }
  });
});
