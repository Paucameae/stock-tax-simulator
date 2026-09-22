import React from 'react';
import { safeSetItem } from '../lib/storage';
import { TAB_SLUGS, TAB_STORAGE_KEY, readTabFromHash, type Tab } from '../lib/tabs';

/**
 * Owns which tab is visible, which ones have ever been visited, and the
 * URL/history plumbing that keeps the two in sync.
 *
 * `mountedTabs` exists so a panel keeps its state across tab switches while an
 * unvisited tab never renders — which is what keeps its lazy chunk unloaded.
 */
export function useTabNavigation(initialTab: Tab) {
  const [activeTab, setActiveTab] = React.useState<Tab>(initialTab);
  const [mountedTabs, setMountedTabs] = React.useState<ReadonlySet<Tab>>(
    () => new Set<Tab>([initialTab])
  );

  const showTab = React.useCallback((tab: Tab) => {
    setMountedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
    setActiveTab(tab);
  }, []);

  const goToTab = React.useCallback((tab: Tab) => {
    showTab(tab);
    const hash = `#${TAB_SLUGS[tab]}`;
    if (window.location.hash !== hash) {
      window.history.pushState({ tab }, '', hash);
    }
  }, [showTab]);

  // Give the very first history entry a slug so Back returns to a known tab
  // instead of an ambiguous hash-less entry.
  const initialTabRef = React.useRef(initialTab);
  React.useEffect(() => {
    const tab = initialTabRef.current;
    if (!readTabFromHash()) {
      window.history.replaceState({ tab }, '', `#${TAB_SLUGS[tab]}`);
    }
  }, []);

  // Back/Forward navigate between tabs rather than leaving the app.
  React.useEffect(() => {
    const onPopState = () => showTab(readTabFromHash() ?? initialTabRef.current);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [showTab]);

  React.useEffect(() => {
    safeSetItem(TAB_STORAGE_KEY, activeTab, { transient: true });
  }, [activeTab]);

  return { activeTab, mountedTabs, goToTab };
}
