// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildXlsxBlob } from '../xlsx-writer';
import { readXlsx, parseWorksheet } from '../xlsx-reader';

/** Reads the single sheet of a workbook Blob back into rows of cell values. */
async function readBack(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const parts = await readXlsx(buffer, ['xl/worksheets/sheet1.xml']);
  const xml = parts.get('xl/worksheets/sheet1.xml');
  if (!xml) throw new Error('sheet1.xml missing');
  return parseWorksheet(xml, []);
}

describe('buildXlsxBlob', () => {
  it('produces a valid .xlsx archive readable by the XLSX reader', async () => {
    const blob = buildXlsxBlob(
      [
        ['Nom', 'Quantité', 'Montant'],
        ['Action A', 3, 1234.56],
        ['Action B', 1.905, 808.52],
      ],
      'Test',
    );
    const rows = await readBack(blob);
    expect(rows).toHaveLength(3);
    expect(rows[0].cells).toEqual({ A: 'Nom', B: 'Quantité', C: 'Montant' });
    expect(rows[1].cells).toEqual({ A: 'Action A', B: '3', C: '1234.56' });
    expect(rows[2].cells).toEqual({ A: 'Action B', B: '1.905', C: '808.52' });
  });

  it('escapes XML-sensitive characters in string cells', async () => {
    const blob = buildXlsxBlob([['A & B <C>', "L'origine"]]);
    const rows = await readBack(blob);
    expect(rows[0].cells).toEqual({ A: 'A & B <C>', B: "L'origine" });
  });

  it('writes the correct MIME type', () => {
    const blob = buildXlsxBlob([['x']]);
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });
});
