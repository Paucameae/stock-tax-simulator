import React from 'react';
import { Briefcase, Calculator, FileText, Settings as SettingsIcon, Database, AlertTriangle, Loader2, Upload, X } from 'lucide-react';
import { TaxRulesPanel } from './components/TaxRulesPanel';
import { SoldLotsTable } from './components/SoldLotsTable';
import { SaleSimulator } from './components/SaleSimulator';
import { TaxCalculator } from './components/TaxCalculator';
import { DeclarationGuide } from './components/DeclarationGuide';
import { PfuVsBaremeComparator } from './components/PfuVsBaremeComparator';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AppHeader, type TabDescriptor } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { Dialog, DialogHeader, DialogFooter } from './components/ui/dialog';
import { runSimulation } from './lib/tax-engine';
import { loadVersionedSettings, safeSetItem, saveVersionedSettings, loadGrants, saveGrants, loadDividends, saveDividends, clearDividends } from './lib/storage';
import { loadPortfolio, savePortfolio } from './lib/portfolio-storage';
import { reconcileLots, reconcileSoldLots } from './lib/stockexport-reconciliation';
import { applyBulkChoiceToLots, applyBulkChoiceToSoldLots, countEligible, type BulkQualifyChoice, type BulkQualifyOptions } from './lib/bulk-qualify';
import { buildDemoData } from './lib/demo-data';
import { downloadBackup, type ImportResult } from './lib/backup';
import { DEFAULT_SETTINGS, isSettingsConfigured } from './lib/settings-defaults';
import { computeDeclarationFor, getSaleYears, soldLotsToSaleEntries } from './lib/sale-entries';
import { loadPersistedTab, readTabFromHash, type Tab } from './lib/tabs';
import { useTabNavigation } from './hooks/useTabNavigation';
import type { StockLot, SoldLot, SaleLotEntry, AppSettings, TaxSimulationResult, TaxMode, GrantInfo, Broker } from './lib/types';
import type { DividendEvent, CashInterestEvent } from './lib/transaction-parser';
import { DividendsDeclaration } from './components/DividendsDeclaration';
import { BulkQualifyPanel } from './components/BulkQualifyPanel';
import { UpdateBanner } from './components/UpdateBanner';
import { StorageAlertBanner } from './components/StorageAlertBanner';
import { mergeByBroker, formatDate } from './lib/utils';
import { TAX_DATA_VERIFIED_ON } from './lib/tax-forms';

// Parsed as local time (no trailing Z) so the displayed day never shifts.
const TAX_DATA_VERIFIED_ON_LABEL = formatDate(new Date(`${TAX_DATA_VERIFIED_ON}T00:00:00`));

// Lazy-load the three heaviest panels; each also defers its own heavy deps
// (pdfjs on first PDF drop, recharts on first treemap render).
const Portfolio = React.lazy(() =>
  import('./components/Portfolio').then((m) => ({ default: m.Portfolio }))
);
const Settings = React.lazy(() =>
  import('./components/Settings').then((m) => ({ default: m.Settings }))
);
const DataPanel = React.lazy(() =>
  import('./components/DataPanel').then((m) => ({ default: m.DataPanel }))
);

function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin mr-2" />
      Chargement…
    </div>
  );
}

function App() {
  // Everything restorable is read once, synchronously, before the first render:
  // positions and sales used to live in memory only, so a simple refresh wiped
  // the whole session and forced the user to re-import a backup.
  const [restored] = React.useState(() => {
    const settings = loadVersionedSettings('appSettings', DEFAULT_SETTINGS);
    const portfolio = loadPortfolio();
    return {
      settings,
      ...portfolio,
      decl: computeDeclarationFor(portfolio.soldLots, settings, 'pfu'),
    };
  });

  const [initialTab] = React.useState<Tab>(() => {
    const fromHash = readTabFromHash();
    if (fromHash) return fromHash;
    const persisted = loadPersistedTab();
    if (persisted) return persisted;
    return isSettingsConfigured(restored.settings, DEFAULT_SETTINGS) ? 'portfolio' : 'settings';
  });
  const { activeTab, mountedTabs, goToTab } = useTabNavigation(initialTab);
  const [restoreNoticeOpen, setRestoreNoticeOpen] = React.useState(restored.rejected > 0);

  const [lots, setLots] = React.useState<StockLot[]>(restored.lots);
  const [soldLots, setSoldLots] = React.useState<SoldLot[]>(restored.soldLots);
  // Declaration workflow state (tab "Ma déclaration"): driven by imported soldLots.
  const [saleYear, setSaleYear] = React.useState<number | null>(restored.decl.saleYear);
  const [declEntries, setDeclEntries] = React.useState<SaleLotEntry[]>(restored.decl.entries);
  const [declTaxMode, setDeclTaxMode] = React.useState<TaxMode>('pfu');
  const [declResult, setDeclResult] = React.useState<TaxSimulationResult | null>(restored.decl.result);
  // Simulation workflow state (tab "Simuler"): driven by current portfolio lots.
  const [simEntries, setSimEntries] = React.useState<SaleLotEntry[]>([]);
  const [simTaxMode, setSimTaxMode] = React.useState<TaxMode>('pfu');
  const [simResult, setSimResult] = React.useState<TaxSimulationResult | null>(null);
  // Ref + flash state used to scroll the tax-result block into view and briefly
  // highlight it when the user clicks "Simuler la vente" — otherwise the result
  // appears far below the fold and the click looks like a no-op.
  const simResultRef = React.useRef<HTMLDivElement | null>(null);
  const [simResultFlash, setSimResultFlash] = React.useState(false);
  // Set to true when the user mutates the lot selection in SaleSimulator
  // after a simulation has already been computed; rendered as a discreet
  // "relancer la simulation" hint on the result card.
  const [simStale, setSimStale] = React.useState(false);
  const [settings, setSettings] = React.useState<AppSettings>(restored.settings);
  const [grants, setGrants] = React.useState<GrantInfo[]>(() => loadGrants());
  const [dividends, setDividends] = React.useState<DividendEvent[]>(() => loadDividends()?.dividends ?? []);
  const [cashInterest, setCashInterest] = React.useState<CashInterestEvent[]>(() => loadDividends()?.cashInterest ?? []);
  const [showRules, setShowRules] = React.useState(false);
  // Dates the fallback valuation shown in the portfolio when the live quote is unavailable.
  const [lotsImportedAt, setLotsImportedAt] = React.useState<string | null>(restored.importedAt);

  // Persist positions and sales on every change. The identity check skips the
  // redundant write-back of what we just read on mount.
  React.useEffect(() => {
    if (lots === restored.lots && soldLots === restored.soldLots) return;
    savePortfolio(lots, soldLots, lotsImportedAt);
  }, [lots, soldLots, lotsImportedAt, restored]);

  const [showSalesImportDialog, setShowSalesImportDialog] = React.useState(false);

  // Simulation history was written on every run but never surfaced anywhere;
  // each entry carried a full result + settings + lots, so 20 of them ate into
  // the storage quota that the portfolio actually needs.
  React.useEffect(() => {
    localStorage.removeItem('savedSimulations');
  }, []);

  // Fiscal years: simulations always use the current year; the declaration view
  // uses the year selected via SoldLotsTable (defaults to most recent sale year).
  const simFiscalYear = new Date().getFullYear();
  const declFiscalYear = saleYear ?? new Date().getFullYear();

  const handleImport = React.useCallback((importedLots: StockLot[]) => {
    if (importedLots.length === 0) return;
    // 1. First, reconcile with StockExport grants when available — this gives the
    //    most authoritative classification (actual plan type from Microsoft).
    const reconciled = grants.length > 0 ? reconcileLots(importedLots, grants).lots : importedLots;

    // 2. Then apply user overrides and defaults for any DO lots that are still not
    //    reconciled (no grant matched or StockExport not imported). Lots already
    //    authoritatively classified by the broker (DRIP detection, reliable plan
    //    label, previous manual / bulk pass) keep their parser-derived planType
    //    untouched — overwriting them with the user's default would silently
    //    downgrade a known-good classification (e.g. DRIP shares correctly
    //    marked as non_qualified would become qualified_macron).
    let prepared: StockLot[];
    try {
      const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') || '{}');
      prepared = reconciled.map((lot) => {
        if (lot.reconciled) return lot; // StockExport wins over overrides/defaults
        const reason = lot.qualificationReason;
        if (
          reason === 'broker_plan_name' ||
          reason === 'broker_drip_marker' ||
          reason === 'manual' ||
          reason === 'bulk_qualify'
        ) {
          return lot;
        }
        if (lot.origin === 'DO' && overrides[lot.id]) {
          return { ...lot, planType: overrides[lot.id] };
        }
        if (lot.origin === 'DO') {
          return { ...lot, planType: settings.defaultPlanType === 'non_qualified' ? 'non_qualified' as const : 'qualified_macron' as const };
        }
        return lot;
      });
    } catch {
      prepared = reconciled;
    }
    // 3. Merge by broker: re-importing one courtier replaces only its slice and
    //    leaves positions imported from any other courtier untouched.
    setLots((prev) => mergeByBroker(prev, prepared));
    setLotsImportedAt(new Date().toISOString());
    // Reset only the simulation state — freshly imported positions invalidate any
    // previous simulation. Declaration data (soldLots) lives independently.
    setSimEntries([]);
    setSimResult(null);
  }, [settings.defaultPlanType, grants]);

  /**
   * Update grants and re-reconcile any lots currently loaded. This is the path
   * when the user imports StockExport AFTER already loading their Fidelity
   * positions — we want lots to pick up the new classification immediately.
   */
  const handleGrantsChange = React.useCallback((nextGrants: GrantInfo[]) => {
    setGrants(nextGrants);
    if (lots.length > 0 && nextGrants.length > 0) {
      const reconciled = reconcileLots(lots, nextGrants).lots;
      setLots(reconciled);
      // Capture reconciled planTypes as overrides so subsequent re-imports honour them.
      try {
        const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') || '{}');
        for (const lot of reconciled) {
          if (lot.reconciled) overrides[lot.id] = lot.planType;
        }
        localStorage.setItem('planTypeOverrides', JSON.stringify(overrides));
      } catch {
        // non-fatal
      }
    }
    // Apply the same refinement to already-imported sold lots so the
    // declaration view picks up the StockExport classification immediately
    // (e.g. switches Macron lots to pré-Macron) without forcing the user to
    // re-import their sales export.
    if (soldLots.length > 0 && nextGrants.length > 0) {
      const reconciledSold = reconcileSoldLots(soldLots, nextGrants).lots;
      setSoldLots(reconciledSold);
      // The reclassification changes the tax basis (qualified vs not), so the
      // current declResult is now stale. Recompute it in place, keeping the
      // user's currently-selected sale year if it still has lots.
      const decl = computeDeclarationFor(reconciledSold, settings, declTaxMode, saleYear);
      setSaleYear(decl.saleYear);
      setDeclEntries(decl.entries);
      setDeclResult(decl.result);
    }
  }, [lots, soldLots, settings, declTaxMode, saleYear]);

  const handleDividendsChange = React.useCallback(
    (payload: { dividends: DividendEvent[]; cashInterest: CashInterestEvent[] }) => {
      // The DividendsImporter that calls us is broker-scoped to Fidelity, so
      // we replace the Fidelity slice in full (a re-import with fewer events
      // must drop the missing ones) while preserving any dividend already
      // loaded from another courtier (typically Morgan Stanley DRIP).
      setDividends((prev) => {
        const nextDividends = [...prev.filter((d) => d.broker !== 'fidelity'), ...payload.dividends];
        setCashInterest((prevCash) => {
          const nextCash = [...prevCash.filter((c) => c.broker !== 'fidelity'), ...payload.cashInterest];
          if (nextDividends.length === 0 && nextCash.length === 0) {
            clearDividends();
            return nextCash;
          }
          saveDividends({
            dividends: nextDividends,
            cashInterest: nextCash,
            importedAt: new Date().toISOString(),
          });
          return nextCash;
        });
        return nextDividends;
      });
    },
    [],
  );

  /**
   * Called by the Morgan Stanley CsvImporter when the activity report
   * contains DRIP dividend rows. We merge by broker: existing MS dividends
   * are dropped (re-importing the same period is the way to refresh them)
   * and replaced by the freshly parsed batch; dividends from other brokers
   * are preserved untouched. Cash interest is unaffected (MS does not
   * expose any).
   */
  const handleImportMsDividends = React.useCallback(
    (msDividends: DividendEvent[]) => {
      setDividends((prev) => {
        const others = prev.filter((d) => d.broker !== 'morgan_stanley');
        const next = [...others, ...msDividends];
        saveDividends({
          dividends: next,
          cashInterest,
          importedAt: new Date().toISOString(),
        });
        return next;
      });
    },
    [cashInterest],
  );

  const handleImportSales = React.useCallback((importedSoldLots: SoldLot[]) => {
    if (importedSoldLots.length === 0) return;
    // 1. Reconcile against StockExport grants when available — this refines the
    //    planType (Macron vs pré-Macron, decided by the grant award date which
    //    sales exports do not carry) and stamps grantIdHash/awardType so the
    //    UI can mark these lots as "verified". Same matching logic as for
    //    open positions: by acquisition (vest) date.
    const reconciled = grants.length > 0
      ? reconcileSoldLots(importedSoldLots, grants).lots
      : importedSoldLots;

    // 2. For lots that did NOT reconcile, fall back to the user's default
    //    planType (Macron / pré-Macron). Reconciled lots keep the planType
    //    derived from their grant — never overwrite it. Lots already
    //    authoritatively classified by the broker (Morgan Stanley plan
    //    label, DRIP detection, …) also keep their parser-derived planType:
    //    overwriting them with the user's default would silently downgrade
    //    a known-good classification.
    const withPlanType = reconciled.map((sl) => {
      if (sl.reconciled) return sl;
      const reason = sl.qualificationReason;
      if (
        reason === 'broker_plan_name' ||
        reason === 'broker_drip_marker' ||
        reason === 'manual' ||
        reason === 'bulk_qualify'
      ) {
        return sl;
      }
      return {
        ...sl,
        planType: settings.defaultPlanType === 'non_qualified' ? 'non_qualified' as const : 'qualified_macron' as const,
      };
    });
    // Merge by broker: re-importing one courtier replaces only its sales,
    // leaving sales already loaded from another courtier untouched. Positions
    // (`lots`) are also preserved, since a user may legitimately hold a current
    // portfolio AND have N-1 sales to declare at the same time.
    const merged = mergeByBroker(soldLots, withPlanType);
    setSoldLots(merged);

    // Default to the most recent sale year across the *aggregated* set so that
    // re-importing one courtier opens the dialog on the year that now matters
    // (likely N-1 for declaration), with the full multi-broker tally for that
    // year — which is what users actually declare in France.
    const years = getSaleYears(merged);
    const defaultYear = years[0] ?? new Date().getFullYear();
    setSaleYear(defaultYear);

    const yearLots = merged.filter((sl) => sl.saleDate.getFullYear() === defaultYear);
    const entries = soldLotsToSaleEntries(yearLots);
    setDeclEntries(entries);
    const simulation = {
      lots: entries,
      taxMode: declTaxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: defaultYear,
    };
    const res = runSimulation(simulation);
    setDeclResult(res);
    setShowSalesImportDialog(true);
  }, [settings, declTaxMode, soldLots, grants]);

  /**
   * Drop every position, sale, and (for Morgan Stanley only) dividend that
   * was imported from a given broker. Fidelity dividends keep their own
   * dedicated clear button on the DividendsImporter card so users can scope
   * the reset more precisely; on Morgan Stanley dividends ride on the same
   * activity report as the rest, so it would be confusing to leave them
   * behind. Cash interest is broker-agnostic in practice (only Fidelity
   * surfaces it today) and follows the lot/sale slice.
   */
  const handleClearBroker = React.useCallback((broker: Broker) => {
    setLots((prev) => prev.filter((l) => l.broker !== broker));
    setSoldLots((prev) => prev.filter((sl) => sl.broker !== broker));
    setCashInterest((prev) => prev.filter((c) => c.broker !== broker));
    if (broker === 'morgan_stanley') {
      setDividends((prev) => {
        const next = prev.filter((d) => d.broker !== broker);
        if (next.length === 0) {
          clearDividends();
        } else {
          saveDividends({
            dividends: next,
            cashInterest: cashInterest.filter((c) => c.broker !== broker),
            importedAt: new Date().toISOString(),
          });
        }
        return next;
      });
    }
    // Resetting the simulation state matches the import path: stale results
    // would no longer match the (now smaller) portfolio.
    setSimEntries([]);
    setSimResult(null);
  }, [cashInterest]);

  // Fine-grained per-slice clear handlers. They mirror handleClearBroker but
  // only touch one storage bucket so the user can drop a single mistakenly
  // imported slice (e.g. DRIP dividends) without losing positions or sales.
  const handleClearBrokerLots = React.useCallback((broker: Broker) => {
    setLots((prev) => prev.filter((l) => l.broker !== broker));
    // Positions feeding the simulator are gone — purge stale results too.
    setSimEntries([]);
    setSimResult(null);
  }, []);

  const handleClearBrokerSales = React.useCallback((broker: Broker) => {
    setSoldLots((prev) => prev.filter((sl) => sl.broker !== broker));
  }, []);

  const handleClearBrokerDividends = React.useCallback((broker: Broker) => {
    setDividends((prev) => {
      const next = prev.filter((d) => d.broker !== broker);
      const remainingCash = broker === 'morgan_stanley'
        ? cashInterest.filter((c) => c.broker !== broker)
        : cashInterest;
      if (next.length === 0 && remainingCash.length === 0) {
        clearDividends();
      } else {
        saveDividends({
          dividends: next,
          cashInterest: remainingCash,
          importedAt: new Date().toISOString(),
        });
      }
      return next;
    });
    if (broker === 'morgan_stanley') {
      setCashInterest((prev) => prev.filter((c) => c.broker !== broker));
    }
  }, [cashInterest]);

  const handleSoldLotsChange = React.useCallback((updatedSoldLots: SoldLot[]) => {
    setSoldLots(updatedSoldLots);
    // Re-run the declaration computation with year-filtered lots
    const yearLots = saleYear != null
      ? updatedSoldLots.filter((sl) => sl.saleDate.getFullYear() === saleYear)
      : updatedSoldLots;
    const entries = soldLotsToSaleEntries(yearLots);
    setDeclEntries(entries);
    const simulation = {
      lots: entries,
      taxMode: declTaxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: declFiscalYear,
    };
    setDeclResult(runSimulation(simulation));
  }, [settings, declTaxMode, declFiscalYear, saleYear]);

  /**
   * Bulk-requalify all eligible (= non-reconciled, non-ESPP) sold lots according
   * to a BulkQualifyChoice. Used by the post-import dialog and by the
   * SoldLotsTable banner when the user has not loaded a StockExport file.
   * Re-runs the declaration computation so the result card reflects the new
   * classification immediately.
   */
  const handleBulkQualifySoldLots = React.useCallback((choice: BulkQualifyChoice, options: BulkQualifyOptions = {}) => {
    setSoldLots((prev) => {
      const next = applyBulkChoiceToSoldLots(prev, choice, options);
      const yearLots = saleYear != null
        ? next.filter((sl) => sl.saleDate.getFullYear() === saleYear)
        : next;
      const entries = soldLotsToSaleEntries(yearLots);
      setDeclEntries(entries);
      const simulation = {
        lots: entries,
        taxMode: declTaxMode,
        otherTaxableIncome: settings.otherTaxableIncome,
        taxShares: settings.taxShares,
        familyStatus: settings.familyStatus,
        priorLosses: settings.priorLosses,
        fiscalYear: declFiscalYear,
      };
      setDeclResult(runSimulation(simulation));
      return next;
    });
  }, [saleYear, declTaxMode, declFiscalYear, settings]);

  /**
   * Bulk-requalify open positions. Persists planType overrides so that
   * re-importing the same broker file later honours the user's choice.
   * (Origin overrides are not persisted because the per-row UI does not
   * expose origin editing for open lots — bulk-set origins remain
   * authoritative until the next import.)
   */
  const handleBulkQualifyLots = React.useCallback((choice: BulkQualifyChoice, options: BulkQualifyOptions = {}) => {
    setLots((prev) => {
      const next = applyBulkChoiceToLots(prev, choice, options);
      try {
        const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') || '{}');
        for (const lot of next) {
          if (lot.reconciled) continue;
          // Persist overrides for any lot we just touched (DO/FM/FQ as before,
          // and SP only when the user explicitly opted in).
          if (lot.origin === 'SP' && !options.includeEspp) continue;
          overrides[lot.id] = lot.planType;
        }
        safeSetItem('planTypeOverrides', JSON.stringify(overrides));
      } catch {
        // non-fatal — overrides are an optimisation, not a correctness requirement
      }
      return next;
    });
  }, []);

  const handleSaleYearChange = React.useCallback((year: number) => {
    setSaleYear(year);
    const yearLots = soldLots.filter((sl) => sl.saleDate.getFullYear() === year);
    const entries = soldLotsToSaleEntries(yearLots);
    setDeclEntries(entries);
    const simulation = {
      lots: entries,
      taxMode: declTaxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: year,
    };
    setDeclResult(runSimulation(simulation));
  }, [soldLots, settings, declTaxMode]);

  const handleSimulate = React.useCallback((entries: SaleLotEntry[]) => {
    setSimEntries(entries);
    const simulation = {
      lots: entries,
      taxMode: simTaxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: simFiscalYear,
    };
    const res = runSimulation(simulation);
    setSimResult(res);
    setSimStale(false);

    goToTab('simulator');

    // Defer until after the TaxCalculator has rendered the new result so the
    // scroll target's height is correct, then briefly flash it to confirm
    // the simulation has been (re)computed.
    requestAnimationFrame(() => {
      simResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setSimResultFlash(true);
      window.setTimeout(() => setSimResultFlash(false), 1200);
    });
  }, [simTaxMode, simFiscalYear, settings, goToTab]);

  const handleSimTaxModeChange = React.useCallback((mode: TaxMode) => {
    setSimTaxMode(mode);
    if (simEntries.length > 0) {
      const simulation = {
        lots: simEntries,
        taxMode: mode,
        otherTaxableIncome: settings.otherTaxableIncome,
        taxShares: settings.taxShares,
        familyStatus: settings.familyStatus,
        priorLosses: settings.priorLosses,
        fiscalYear: simFiscalYear,
      };
      setSimResult(runSimulation(simulation));
      setSimStale(false);
    }
  }, [simEntries, settings, simFiscalYear]);

  // Stable handler so SaleSimulator's "selection changed" effect does not
  // re-fire on every parent render (would otherwise show the stale banner
  // permanently as soon as a simulation exists).
  const handleSimSelectionChange = React.useCallback(() => {
    setSimStale((prev) => prev || simResult !== null);
  }, [simResult]);

  const handleDeclTaxModeChange = React.useCallback((mode: TaxMode) => {
    setDeclTaxMode(mode);
    if (declEntries.length > 0) {
      const simulation = {
        lots: declEntries,
        taxMode: mode,
        otherTaxableIncome: settings.otherTaxableIncome,
        taxShares: settings.taxShares,
        familyStatus: settings.familyStatus,
        priorLosses: settings.priorLosses,
        fiscalYear: declFiscalYear,
      };
      setDeclResult(runSimulation(simulation));
    }
  }, [declEntries, settings, declFiscalYear]);

  const handleBackupImport = React.useCallback((imported: ImportResult) => {
    setSettings(imported.settings);
    saveVersionedSettings('appSettings', imported.settings);
    setLots(imported.lots);
    setSoldLots(imported.soldLots);
    setLotsImportedAt(new Date().toISOString());
    // v3 backups carry StockExport grants. v1/v2 backups arrive with grants=[];
    // we then leave any existing localStorage grants untouched rather than wipe
    // them — mirroring how we don't clear other unrelated state.
    if (imported.grants.length > 0) {
      setGrants(imported.grants);
      saveGrants(imported.grants);
    }
    // Reset simulation state — SaleSimulator's lot selection isn't persisted,
    // so the user re-picks lots and clicks "Simuler" again.
    setSimEntries([]);
    setSimResult(null);
    // Bootstrap the declaration view from the imported sold lots so that the
    // tax detail panel is populated without requiring the user to toggle a
    // qualification combo to trigger a recompute. Use imported.settings (not
    // the current `settings` state, which won't be updated until the next
    // render) so the simulation reflects the restored tax parameters.
    const decl = computeDeclarationFor(imported.soldLots, imported.settings, declTaxMode);
    setSaleYear(decl.saleYear);
    setDeclEntries(decl.entries);
    setDeclResult(decl.result);
  }, [declTaxMode]);

  /**
   * Load a fully synthetic demo dataset so a first-time user (or a tester) can
   * explore every flow — portfolio, simulation, declaration, dividends —
   * without exporting anything from their broker. Mirrors handleBackupImport:
   * it replaces the current state wholesale and persists it, then bootstraps
   * the declaration view. The numbers are fake and carry no PII.
   */
  const handleLoadDemo = React.useCallback(() => {
    const demo = buildDemoData();
    setSettings(demo.settings);
    saveVersionedSettings('appSettings', demo.settings);
    setLots(demo.lots);
    setSoldLots(demo.soldLots);
    setLotsImportedAt(new Date().toISOString());
    setGrants([]);
    setDividends(demo.dividends);
    setCashInterest([]);
    saveDividends({
      dividends: demo.dividends,
      cashInterest: [],
      importedAt: new Date().toISOString(),
    });
    setSimEntries([]);
    setSimResult(null);
    const decl = computeDeclarationFor(demo.soldLots, demo.settings, declTaxMode);
    setSaleYear(decl.saleYear);
    setDeclEntries(decl.entries);
    setDeclResult(decl.result);
    goToTab('portfolio');
  }, [declTaxMode, goToTab]);

  const handleEmergencyExport = React.useCallback(() => {
    downloadBackup({ settings, lots, soldLots, grants });
  }, [settings, lots, soldLots, grants]);

  const settingsDone = isSettingsConfigured(settings, DEFAULT_SETTINGS);
  const portfolioDone = lots.length > 0;
  const simulationDone = simResult !== null;
  const declarationDone = declResult !== null || dividends.length > 0;

  const tabs: TabDescriptor[] = [
    { id: 'settings', step: 1, label: 'Paramètres', icon: SettingsIcon, done: settingsDone },
    { id: 'data', step: 2, label: 'Mes données', icon: Database, done: lots.length > 0 || soldLots.length > 0 || grants.length > 0 || dividends.length > 0 },
    { id: 'portfolio', step: 3, label: 'Mon portefeuille', icon: Briefcase, done: portfolioDone },
    { id: 'simulator', step: 4, label: 'Ma simulation', icon: Calculator, done: simulationDone },
    { id: 'declaration', step: 5, label: 'Ma déclaration', icon: FileText, done: declarationDone },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <UpdateBanner />
      <StorageAlertBanner onExport={handleEmergencyExport} />
      {restoreNoticeOpen && (
        <div role="alert" className="bg-amber-50 border-b border-amber-200 text-amber-900">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="flex-1">
              {restored.rejected > 1
                ? `${restored.rejected} lignes enregistrées dans ce navigateur ont été écartées car leurs données étaient illisibles.`
                : 'Une ligne enregistrée dans ce navigateur a été écartée car ses données étaient illisibles.'}{' '}
              Réimportez le fichier du courtier concerné ou restaurez une sauvegarde pour les retrouver.
            </p>
            <button
              type="button"
              onClick={() => setRestoreNoticeOpen(false)}
              aria-label="Masquer cet avertissement"
              className="shrink-0 rounded p-1 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <AppHeader
        tabs={tabs}
        activeTab={activeTab}
        onSelectTab={goToTab}
        onShowRules={() => setShowRules(true)}
        taxDataVerifiedOn={TAX_DATA_VERIFIED_ON_LABEL}
      />

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-4 py-6">
        <div id="panel-portfolio" role="tabpanel" aria-labelledby="tab-portfolio" hidden={activeTab !== 'portfolio'}>
          {mountedTabs.has('portfolio') && (
          <div className="space-y-6">
            {!settingsDone && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3 text-sm">
                <SettingsIcon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-blue-800">
                    <strong>Conseil :</strong> configurez d'abord vos paramètres fiscaux (situation familiale, revenus, parts) pour des calculs précis.
                  </p>
                  <button
                    onClick={() => goToTab('settings')}
                    className="mt-2 inline-flex items-center gap-1 text-primary font-medium hover:underline"
                  >
                    Configurer mes paramètres →
                  </button>
                </div>
              </div>
            )}
            {lots.length === 0 && soldLots.length === 0 && (
              <div className="text-center py-12 rounded-lg border border-dashed border-gray-300 bg-white">
                <Briefcase className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-700 font-medium">Aucune donnée importée</p>
                <p className="text-sm text-gray-500 mt-1 mb-4 max-w-md mx-auto">
                  Pour visualiser votre portefeuille, importez d'abord vos fichiers depuis l'onglet <strong>Mes données</strong>.
                </p>
                <button
                  onClick={() => goToTab('data')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Aller à Mes données
                </button>
              </div>
            )}
            {lots.length > 0 && (
              <React.Suspense fallback={<LazyFallback />}>
                <Portfolio lots={lots} onLotsChange={setLots} onBulkQualify={handleBulkQualifyLots} hasGrants={grants.length > 0} grants={grants} dividends={dividends} cashInterest={cashInterest} importedAt={lotsImportedAt} visible={activeTab === 'portfolio'} />
              </React.Suspense>
            )}
          </div>
          )}
        </div>

        <div id="panel-simulator" role="tabpanel" aria-labelledby="tab-simulator" hidden={activeTab !== 'simulator'}>
          {mountedTabs.has('simulator') && (
          <div className="space-y-6">
            {lots.length === 0 ? (
              <div className="text-center py-16">
                <Briefcase className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-600 font-medium">Aucun portefeuille importé</p>
                <p className="text-sm text-gray-500 mt-1 mb-4">
                  Importez vos positions actuelles pour simuler une vente.
                </p>
                <button
                  onClick={() => goToTab('data')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Importer mon portefeuille
                </button>
              </div>
            ) : (
              <>
                <SaleSimulator
                  lots={lots}
                  settings={settings}
                  onSimulate={handleSimulate}
                  onSelectionChange={handleSimSelectionChange}
                />
                <div
                  ref={simResultRef}
                  className={`scroll-mt-4 rounded-lg transition-shadow duration-500 ${simResultFlash ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                >
                  {simStale && simResult && (
                    <div
                      className="mb-4 flex items-center gap-2 px-3 py-2 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-xs"
                      role="status"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>Sélection modifiée — relancez la simulation pour mettre à jour le résultat.</span>
                    </div>
                  )}
                  {simEntries.length > 0 && simResult && (
                    <div className="mb-6">
                      <PfuVsBaremeComparator
                        lots={simEntries}
                        settings={settings}
                        fiscalYear={simFiscalYear}
                        taxMode={simTaxMode}
                        onTaxModeChange={handleSimTaxModeChange}
                      />
                    </div>
                  )}
                  <TaxCalculator
                    result={simResult}
                    taxMode={simTaxMode}
                    onTaxModeChange={handleSimTaxModeChange}
                    fiscalYear={simFiscalYear}
                    familyStatus={settings.familyStatus}
                  />
                </div>
              </>
            )}
          </div>
          )}
        </div>

        <div id="panel-declaration" role="tabpanel" aria-labelledby="tab-declaration" hidden={activeTab !== 'declaration'}>
          {mountedTabs.has('declaration') && (
          <div className="space-y-6">
            {soldLots.length === 0 && dividends.length === 0 ? (
              <div className="text-center py-16">
                <Calculator className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-600 font-medium">Aucune vente à déclarer</p>
                <p className="text-sm text-gray-500 mt-1 mb-4">
                  Importez votre historique de ventes ou de dividendes pour préparer votre déclaration.
                </p>
                <button
                  onClick={() => goToTab('data')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Importer mes ventes
                </button>
              </div>
            ) : (
              <>
                {soldLots.length > 0 && (
                  <SoldLotsTable
                    soldLots={soldLots}
                    onSoldLotsChange={handleSoldLotsChange}
                    onBulkQualify={handleBulkQualifySoldLots}
                    hasGrants={grants.length > 0}
                    defaultPlanType={settings.defaultPlanType}
                    saleYear={saleYear}
                    onSaleYearChange={handleSaleYearChange}
                  />
                )}
                {soldLots.length > 0 && declEntries.length > 0 && declResult && (
                  <PfuVsBaremeComparator
                    lots={declEntries}
                    settings={settings}
                    fiscalYear={declFiscalYear}
                    taxMode={declTaxMode}
                    onTaxModeChange={handleDeclTaxModeChange}
                  />
                )}
                {soldLots.length > 0 && (
                  <TaxCalculator result={declResult} taxMode={declTaxMode} onTaxModeChange={handleDeclTaxModeChange} fiscalYear={declFiscalYear} familyStatus={settings.familyStatus} />
                )}
                {declResult && (
                  <DeclarationGuide
                    result={declResult}
                    lots={declEntries}
                    fiscalYear={declFiscalYear}
                    settings={settings}
                  />
                )}
                {dividends.length > 0 && (
                  <DividendsDeclaration dividends={dividends} fiscalYear={declFiscalYear} />
                )}
              </>
            )}
          </div>
          )}
        </div>

        <div id="panel-data" role="tabpanel" aria-labelledby="tab-data" hidden={activeTab !== 'data'}>
          {mountedTabs.has('data') && (
          <React.Suspense fallback={<LazyFallback />}>
            <DataPanel
            settings={settings}
            grants={grants}
            onGrantsChange={handleGrantsChange}
            lots={lots}
            soldLots={soldLots}
            dividends={dividends}
            cashInterest={cashInterest}
            onDividendsChange={handleDividendsChange}
            onImportMsDividends={handleImportMsDividends}
            onDefaultPlanTypeChange={(value) => {
              const next = { ...settings, defaultPlanType: value };
              setSettings(next);
              saveVersionedSettings('appSettings', next);
            }}
            onImportLots={handleImport}
            onImportSales={handleImportSales}
            onClearBroker={handleClearBroker}
            onClearBrokerLots={handleClearBrokerLots}
            onClearBrokerSales={handleClearBrokerSales}
            onClearBrokerDividends={handleClearBrokerDividends}
            hasData={lots.length > 0 || soldLots.length > 0 || grants.length > 0 || dividends.length > 0}
            onLoadDemo={handleLoadDemo}
          />
          </React.Suspense>
          )}
        </div>

        <div id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" hidden={activeTab !== 'settings'}>
          {mountedTabs.has('settings') && (
          <React.Suspense fallback={<LazyFallback />}>
            <Settings
              settings={settings}
              onSettingsChange={setSettings}
              defaults={DEFAULT_SETTINGS}
              lots={lots}
              soldLots={soldLots}
              grants={grants}
              onBackupImport={handleBackupImport}
            />
          </React.Suspense>
          )}
        </div>
      </main>

      {/* Tax rules panel — rates depend on the year of the tab being consulted. */}
      {showRules && (
        <TaxRulesPanel
          onClose={() => setShowRules(false)}
          fiscalYear={activeTab === 'declaration' ? declFiscalYear : simFiscalYear}
        />
      )}

      {/* Sales import requalification dialog */}
      <Dialog
        open={showSalesImportDialog}
        onClose={() => setShowSalesImportDialog(false)}
        label="Vérification nécessaire après import des ventes"
        className="max-w-xl"
      >
        <DialogHeader>
          <p className="font-semibold text-gray-900 mb-2">Vérification nécessaire</p>
          <p>
            Les exports de ventes ne contiennent pas toujours l'origine ni le régime fiscal exact des actions
            (Fidelity ne fournit aucune origine&nbsp;; Morgan Stanley fournit le plan mais pas l'année d'attribution).
            {grants.length > 0 ? (
              <> Les lots dont la date d'acquisition correspond à une attribution de votre StockExport ont été <strong>reconciliés automatiquement</strong>. </>
            ) : (
              <> Importez votre fichier StockExport dans <strong>Mes données &gt; Attributions</strong> pour qualifier automatiquement les lots dont la date correspond à une attribution. </>
            )}
          </p>
        </DialogHeader>
        {countEligible(soldLots) > 0 && (
          <div className="border-t border-gray-100 pt-4 mb-2 space-y-3">
            <p className="text-sm font-medium text-gray-900">
              Qualifier en lot les ventes non reconciliées ({countEligible(soldLots)})
            </p>
            <BulkQualifyPanel
              eligibleCount={countEligible(soldLots)}
              esppEligibleCount={countEligible(soldLots, { includeEspp: true }) - countEligible(soldLots)}
              onApply={(choice, options) => {
                handleBulkQualifySoldLots(choice, options);
                setShowSalesImportDialog(false);
                goToTab('declaration');
              }}
              compact
            />
            <p className="text-xs text-gray-500">
              Vous pourrez toujours ajuster manuellement chaque ligne ensuite dans l'onglet Ma déclaration.
            </p>
          </div>
        )}
        <DialogFooter>
          <button
            onClick={() => {
              setShowSalesImportDialog(false);
              goToTab('declaration');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            {countEligible(soldLots) > 0 ? 'Qualifier manuellement' : 'Aller à ma déclaration'}
          </button>
        </DialogFooter>
      </Dialog>

      <AppFooter extraBottomMargin={activeTab === 'simulator'} />
    </div>
  );
}

export default function AppWithErrorBoundary() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}
