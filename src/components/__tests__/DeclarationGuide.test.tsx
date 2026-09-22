// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeclarationGuide } from '../DeclarationGuide';
import { buildDemoData } from '../../lib/demo-data';
import { computeDeclarationFor } from '../../lib/sale-entries';

const demo = buildDemoData();
const { saleYear, entries, result } = computeDeclarationFor(demo.soldLots, demo.settings, 'pfu');

describe('DeclarationGuide — export PDF', () => {
  let anchors: HTMLAnchorElement[];
  let blobs: Blob[];

  beforeEach(() => {
    anchors = [];
    blobs = [];
    // jsdom has no object URLs; patch the two methods rather than the whole
    // global, which the module runner needs as a constructor.
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      blobs.push(blob as Blob);
      return 'blob:mock';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = create(tag);
      if (tag === 'a') {
        anchors.push(element as HTMLAnchorElement);
        (element as HTMLAnchorElement).click = () => {};
      }
      return element;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('télécharge un PDF horodaté reprenant la déclaration', async () => {
    const user = userEvent.setup();
    render(
      <DeclarationGuide
        result={result!}
        lots={entries}
        fiscalYear={saleYear!}
        settings={demo.settings}
      />
    );

    await user.click(screen.getByRole('button', { name: /Exporter en PDF/ }));

    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(blobs[0].type).toBe('application/pdf');
    expect(anchors[0].download).toMatch(/^declaration-2025-\d{8}-\d{4}\.pdf$/);
  });
});
