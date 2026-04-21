import type { ReactNode } from 'react';

export type ImportMode = 'positions' | 'sales';

export interface ExportStep {
  /** Short title for the step indicator */
  title: string;
  /** Main instruction content — JSX nodes, kept safe from XSS */
  description: ReactNode;
  /** Path to the screenshot in public/ */
  image: string;
  /** Alt text for the image */
  imageAlt: string;
  /** If set, this step shows a contextual hint depending on the import mode */
  importModeHint?: Partial<Record<ImportMode, ReactNode>>;
}

export interface BrokerGuide {
  brokerId: string;
  brokerName: string;
  steps: ExportStep[];
}
