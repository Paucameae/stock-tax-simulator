// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildDeclarationPdfDocument, declarationPdfFilename } from '../declaration-pdf';
import { buildPdf } from '../pdf-writer';
import { buildDemoData } from '../demo-data';
import { computeDeclarationFor } from '../sale-entries';
import { generateDeclaration } from '../declaration';
import type { PdfBlock } from '../pdf-writer';

function buildFromDemo() {
  const demo = buildDemoData();
  const { saleYear, entries, result } = computeDeclarationFor(demo.soldLots, demo.settings, 'pfu');
  const declaration = generateDeclaration(result!, entries, saleYear!);
  return {
    demo,
    declaration,
    doc: buildDeclarationPdfDocument({
      declaration,
      result: result!,
      settings: demo.settings,
      lines: declaration.form2074Lines,
      grouped: false,
      generatedAt: new Date(2026, 4, 10, 14, 32),
    }),
  };
}

function headings(blocks: PdfBlock[]): string[] {
  return blocks.filter((b) => b.kind === 'heading').map((b) => b.text);
}

function allText(blocks: PdfBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === 'heading' || block.kind === 'paragraph') return block.text;
      if (block.kind === 'fields') return block.rows.map((r) => `${r.label} ${r.value}`).join('\n');
      if (block.kind === 'table') return block.rows.map((r) => r.join(' ')).join('\n');
      return '';
    })
    .join('\n');
}

describe('buildDeclarationPdfDocument', () => {
  it('couvre paramètres, calcul, cases et annexe 2074', () => {
    const { doc } = buildFromDemo();
    expect(headings(doc.blocks)).toEqual([
      'Paramètres de calcul',
      'Résultat du calcul',
      'Cases à reporter — formulaire 2042',
      'Cases à reporter — formulaire 2042-C',
      'Prélèvements sociaux',
      'Annexe 2074 — cadre 510',
      'Rappels',
    ]);
  });

  it('horodate le document et rappelle sa valeur indicative', () => {
    const { doc } = buildFromDemo();
    expect(doc.title).toBe('Déclaration des revenus 2025 — actions Microsoft');
    expect(doc.subtitle).toContain('10/05/2026');
    expect(doc.subtitle).toContain('ne constitue pas un conseil fiscal');
    expect(doc.footer).toContain('Déclaration 2025');
  });

  it('reprend les paramètres du foyer', () => {
    const { doc } = buildFromDemo();
    const text = allText(doc.blocks);
    expect(text).toContain('Couple (marié / pacsé)');
    expect(text).toContain('PFU (flat tax 30 %)');
    expect(text).toContain('Autres revenus imposables du foyer');
  });

  it('reporte les montants des cases 1TZ et 3VG du jeu de démonstration', () => {
    const { doc, declaration } = buildFromDemo();
    expect(declaration.case1TZ).toBe(12000);
    expect(declaration.case3VG).toBe(20100);
    const text = allText(doc.blocks).replace(/[\u00a0\u202f]/g, ' ');
    expect(text).toContain('Case 1TZ');
    expect(text).toContain('12 000,00 €');
    expect(text).toContain('Case 3VG');
    expect(text).toContain('20 100,00 €');
  });

  it('détaille une ligne du cadre 510 par cession', () => {
    const { doc, declaration } = buildFromDemo();
    const table = doc.blocks.find((b) => b.kind === 'table');
    expect(table?.kind).toBe('table');
    if (table?.kind !== 'table') return;
    expect(table.rows).toHaveLength(declaration.form2074Lines.length);
    expect(table.rows[0][1]).toBe(declaration.form2074Lines[0].origin);
  });

  it('signale le regroupement des lignes identiques', () => {
    const demo = buildDemoData();
    const { saleYear, entries, result } = computeDeclarationFor(demo.soldLots, demo.settings, 'pfu');
    const declaration = generateDeclaration(result!, entries, saleYear!);
    const doc = buildDeclarationPdfDocument({
      declaration,
      result: result!,
      settings: demo.settings,
      lines: declaration.form2074Lines,
      grouped: true,
    });
    expect(allText(doc.blocks)).toContain('lignes identiques regroupées');
  });

  it('se rend en un PDF valide contenant les montants', () => {
    const { doc } = buildFromDemo();
    const bytes = buildPdf(doc);
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('12 000,00');
    expect(text).toContain('20 100,00');
    expect(text).toContain('<= 300');
    expect(text).not.toContain('?');
  });
});

describe('declarationPdfFilename', () => {
  it('horodate le nom de fichier', () => {
    expect(declarationPdfFilename(2025, new Date(2026, 4, 10, 14, 32))).toBe(
      'declaration-2025-20260510-1432.pdf'
    );
  });
});
