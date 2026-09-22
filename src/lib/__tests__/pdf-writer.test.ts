// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildPdf, buildPdfBlob, measureText, toWinAnsi, wrapText } from '../pdf-writer';
import type { PdfBlock } from '../pdf-writer';

function asLatin1(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

describe('toWinAnsi', () => {
  it('encode les caractères du plan WinAnsi sur un octet', () => {
    expect(toWinAnsi('é').charCodeAt(0)).toBe(0xe9);
    expect(toWinAnsi('€').charCodeAt(0)).toBe(0x80);
    expect(toWinAnsi('’').charCodeAt(0)).toBe(0x92);
  });

  it('remplace les espaces fines des montants fr-FR par une espace normale', () => {
    expect(toWinAnsi('12\u202f000')).toBe('12 000');
  });

  it('translittère les signes mathématiques absents du plan WinAnsi', () => {
    expect(toWinAnsi('≤ 300 k€ ≥ 2 × 3')).toBe('<= 300 k\u0080 >= 2 x 3');
  });

  it('remplace les caractères hors plan par un point d’interrogation', () => {
    expect(toWinAnsi('☑')).toBe('?');
  });
});

describe('measureText', () => {
  it('mesure le gras plus large que le romain', () => {
    expect(measureText('abcdef', 10, true)).toBeGreaterThan(measureText('abcdef', 10, false));
  });

  it('donne aux accentuées la largeur de leur lettre de base', () => {
    expect(measureText('éàô', 10)).toBeCloseTo(measureText('eao', 10), 5);
  });
});

describe('wrapText', () => {
  it('respecte la largeur disponible', () => {
    const lines = wrapText('un deux trois quatre cinq six sept huit neuf dix', 60, 9);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureText(line, 9)).toBeLessThanOrEqual(60);
  });

  it('coupe un mot plus long que la ligne', () => {
    const lines = wrapText('a'.repeat(200), 40, 9);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureText(line, 9)).toBeLessThanOrEqual(40);
  });
});

describe('buildPdf', () => {
  const doc = {
    title: 'Déclaration 2025 — actions Microsoft',
    subtitle: 'Généré le 10/05/2026 à 14:32',
    footer: 'Simulateur fiscal',
    createdAt: new Date(Date.UTC(2026, 4, 10, 12, 32, 0)),
    blocks: [
      { kind: 'heading', text: 'Paramètres' },
      { kind: 'fields', rows: [{ label: 'Parts fiscales', value: '3', strong: true }] },
      {
        kind: 'table',
        columns: [
          { header: 'Date', width: 1 },
          { header: 'Montant', width: 1, align: 'right' as const },
        ],
        rows: [['15/04/2025', '27 000,00 €']],
      },
      { kind: 'paragraph', text: 'Document indicatif.', muted: true },
    ] satisfies PdfBlock[],
  };

  it('produit un fichier PDF bien formé', () => {
    const text = asLatin1(buildPdf(doc));
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.endsWith('%%EOF\n')).toBe(true);
    expect(text).toContain('/Type/Catalog');
    expect(text).toContain('/BaseFont/Helvetica-Bold');
    expect(text).toContain('/Encoding/WinAnsiEncoding');
    expect(text).toContain('/CreationDate(D:20260510123200Z)');
  });

  it('écrit une table xref dont les décalages pointent sur les objets', () => {
    const text = asLatin1(buildPdf(doc));
    const startxref = Number(/startxref\n(\d+)\n/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');

    const offsets = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n\r\n/g)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(5);
    offsets.forEach((offset, index) => {
      expect(text.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true);
    });
    expect(text).toContain(`/Size ${offsets.length + 1}`);
  });

  it('reporte le contenu sur plusieurs pages et numérote le pied de page', () => {
    const long = {
      ...doc,
      blocks: Array.from({ length: 200 }, (_, i): PdfBlock => ({ kind: 'paragraph', text: `Ligne ${i}` })),
    };
    const text = asLatin1(buildPdf(long));
    const count = Number(/\/Count (\d+)>>/.exec(text)![1]);
    expect(count).toBeGreaterThan(2);
    expect(text).toContain(`(Page 1 / ${count})`);
    expect(text).toContain(`(Page ${count} / ${count})`);
    expect([...text.matchAll(/\/Type\/Page\b/g)]).toHaveLength(count);
  });

  it('échappe les parenthèses et les antislashs des chaînes', () => {
    const text = asLatin1(
      buildPdf({ ...doc, blocks: [{ kind: 'paragraph', text: 'Couple (marié) \\ pacsé' }] })
    );
    expect(text).toContain('(Couple \\(mari\u00e9\\) \\\\ pacs\u00e9)');
  });

  it('expose un Blob au bon type MIME', () => {
    const blob = buildPdfBlob(doc);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
  });
});
