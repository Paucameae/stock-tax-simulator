// @vitest-environment jsdom
//
// End-to-end journey through the real <App />: the unit suites each cover one
// brick, none of them covers the chain "j'importe -> je simule -> je declare".
// Everything here goes through the actual tabs, buttons and inputs a user
// clicks, and asserts hand-computed amounts from the demo dataset so a silent
// regression in the demo data or in the wiring between tabs fails the build.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { resetMsftQuoteStore } from '../lib/msft-quote-store';

// jsdom has no layout engine and the treemap is not what these journeys test.
vi.mock('recharts', () => ({
  Treemap: () => <div data-testid="treemap" />,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

/** Strip the fr-FR thousand separators so assertions stay readable. */
function normalize(text: string): string {
  return text.replace(/[\s\u00a0\u202f]/g, '');
}

/** Panels stay mounted behind `hidden`, so every query must be scoped. */
function panel(id: string) {
  const el = document.getElementById(`panel-${id}`);
  if (!el) throw new Error(`panel-${id} not mounted`);
  return within(el);
}

function panelText(id: string): string {
  return normalize(document.getElementById(`panel-${id}`)?.textContent ?? '');
}

// Lazy panels and a full App render are slower than a component unit test,
// especially when the whole suite runs its files in parallel.
const SLOW = { timeout: 15_000 };
const TEST_TIMEOUT = 60_000;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetMsftQuoteStore();
  // Each test starts on a clean URL: the tab is restored from the hash first.
  window.history.replaceState(null, '', '/');
  // Offline by design: the live MSFT quote and the ECB rates must never make
  // the journey depend on the network.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Load the demo dataset the way a first-time visitor does. */
async function loadDemo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: /Mes données/ }));
  await user.click(await screen.findByRole('button', { name: /Charger la démo/ }, SLOW));
  await waitFor(
    () => expect(screen.getByRole('tab', { name: /Mon portefeuille/ })).toHaveAttribute('aria-selected', 'true'),
    SLOW
  );
}

describe('parcours complet', () => {
  it('charger la démo → simuler → vérifier la case 1TZ', async () => {
    const user = userEvent.setup();
    render(<App />);

    // A brand-new visitor has nothing configured: step 1 is the settings tab.
    expect(screen.getByRole('tab', { name: /Paramètres/ })).toHaveAttribute('aria-selected', 'true');

    await loadDemo(user);

    // Portfolio: 120 + 80 + 45 = 245 actions détenues.
    await waitFor(() => expect(panelText('portfolio')).toContain('245'), SLOW);

    // Simulation: vendre les 3 lots à 450 €.
    await user.click(screen.getByRole('tab', { name: /Ma simulation/ }));
    const sim = panel('simulator');
    const priceInput = await sim.findByPlaceholderText('Ex: 420.00', undefined, SLOW);
    await user.clear(priceInput);
    await user.type(priceInput, '450');
    // The price input is debounced 300 ms before it reaches the lot selection.
    await waitFor(() => expect(sim.getByRole('button', { name: /Appliquer à tous/ })).toBeEnabled(), SLOW);

    await user.click(sim.getByRole('checkbox', { name: /Sélectionner les 3 lots filtrés/ }));
    await user.click(sim.getByRole('button', { name: /Simuler la vente/ }));

    await waitFor(() => expect(sim.getByText(/Total impôts et prélèvements/)).toBeInTheDocument(), SLOW);
    // 245 actions × 450 € = 110 250 € de produit brut.
    expect(panelText('simulator')).toContain('110250,00€');

    // Déclaration : les deux ventes 2025 de la démo.
    await user.click(screen.getByRole('tab', { name: /Ma déclaration/ }));
    const decl = panel('declaration');
    // The box codes also appear inline in the tax breakdown, so the assertions
    // target the "cases à reporter" blocks of the declaration guide.
    const form2042 = within(
      (await decl.findByRole('heading', { name: /FORMULAIRE 2042 — Déclaration principale/ }, SLOW)).parentElement!
    );
    const form2042c = within(
      decl.getByRole('heading', { name: /FORMULAIRE 2042-C/ }).parentElement!
    );

    // Lot FQ pré-Macron : gain d'acquisition 60 × 200 € = 12 000 €, aucun
    // abattement dans ce régime, donc l'intégralité part en case 1TZ. C'est la
    // case que le bug de cohérence de la démo (origine FQ / plan non qualifié)
    // faisait disparaître.
    expect(normalize(form2042c.getByText('1TZ').parentElement!.textContent!)).toContain('12000,00€');
    expect(form2042c.queryByText('1UZ')).toBeNull();

    // Plus-values de cession : 60 × (450 − 200) + 30 × (450 − 280) = 20 100 €.
    expect(normalize(form2042.getByText('3VG').parentElement!.textContent!)).toContain('20100,00€');
  }, TEST_TIMEOUT);

  it('sans données, chaque étape renvoie vers l’import', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: /Ma simulation/ }));
    expect(panel('simulator').getByText('Aucun portefeuille importé')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Ma déclaration/ }));
    expect(panel('declaration').getByText('Aucune vente à déclarer')).toBeInTheDocument();

    // The CTA must land on the data tab, otherwise the funnel is a dead end.
    await user.click(panel('declaration').getByRole('button', { name: /Importer mes ventes/ }));
    await waitFor(
      () => expect(screen.getByRole('tab', { name: /Mes données/ })).toHaveAttribute('aria-selected', 'true'),
      SLOW
    );
  }, TEST_TIMEOUT);

  it('le portefeuille survit à un rechargement de la page', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadDemo(user);
    await waitFor(() => expect(panelText('portfolio')).toContain('245'), SLOW);

    // Simulate a reload: same origin, same storage, fresh React tree.
    cleanup();
    resetMsftQuoteStore();
    render(<App />);

    await waitFor(
      () => expect(screen.getByRole('tab', { name: /Mon portefeuille/ })).toHaveAttribute('aria-selected', 'true'),
      SLOW
    );
    await waitFor(() => expect(panelText('portfolio')).toContain('245'), SLOW);
  }, TEST_TIMEOUT);
});
