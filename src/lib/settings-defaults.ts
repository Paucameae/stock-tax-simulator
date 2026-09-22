import type { AppSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  familyStatus: 'single',
  numberOfChildren: 0,
  taxShares: 1,
  taxSharesManual: false,
  otherTaxableIncome: 0,
  defaultPlanType: 'qualified_macron',
  priorLosses: 0,
};

/** True once the user has touched anything that actually changes a tax result. */
export function isSettingsConfigured(s: AppSettings, defaults: AppSettings): boolean {
  return s.otherTaxableIncome !== defaults.otherTaxableIncome
    || s.taxShares !== defaults.taxShares
    || s.familyStatus !== defaults.familyStatus
    || s.numberOfChildren !== defaults.numberOfChildren;
}
