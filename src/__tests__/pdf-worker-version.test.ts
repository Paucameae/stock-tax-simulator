// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// pdf.js refuses to run a worker whose version differs from the library's.
// The file in public/ is a manual copy, so an `npm update` of pdfjs-dist
// silently desynchronises it and every PDF import breaks in production only.
describe('worker pdf.js', () => {
  it('a la même version que pdfjs-dist', () => {
    const root = resolve(__dirname, '..', '..');
    const { version } = JSON.parse(
      readFileSync(resolve(root, 'node_modules', 'pdfjs-dist', 'package.json'), 'utf8')
    ) as { version: string };
    const worker = readFileSync(resolve(root, 'public', 'pdf.worker.min.mjs'), 'utf8');

    expect(worker).toContain(version);
  });
});
