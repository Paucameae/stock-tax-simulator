export type Tab = 'portfolio' | 'simulator' | 'declaration' | 'data' | 'settings';

export const TAB_STORAGE_KEY = 'activeTab';

const VALID_TABS: readonly Tab[] = ['portfolio', 'simulator', 'declaration', 'data', 'settings'] as const;

/** URL fragment per tab, so a tab can be bookmarked, shared and navigated back to. */
export const TAB_SLUGS: Record<Tab, string> = {
  settings: 'parametres',
  data: 'donnees',
  portfolio: 'portefeuille',
  simulator: 'simulation',
  declaration: 'declaration',
};

export function loadPersistedTab(): Tab | null {
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    return saved && (VALID_TABS as readonly string[]).includes(saved) ? (saved as Tab) : null;
  } catch {
    return null;
  }
}

export function readTabFromHash(): Tab | null {
  const slug = window.location.hash.replace(/^#/, '');
  const entry = (Object.entries(TAB_SLUGS) as [Tab, string][]).find(([, s]) => s === slug);
  return entry ? entry[0] : null;
}
