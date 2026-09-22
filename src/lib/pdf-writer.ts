/**
 * Minimal PDF writer — no external dependencies.
 *
 * Companion of `xlsx-writer.ts`. Produces a text-only, multi-page A4 document
 * using the two base-14 fonts every reader embeds (Helvetica, Helvetica-Bold),
 * so nothing has to be embedded and the output stays a few kilobytes.
 *
 * Scope is intentionally narrow: headings, wrapped paragraphs, label/value
 * fields and simple tables. No images, no colours beyond grey, no links.
 *
 * The whole file is assembled as a JavaScript string whose characters are all
 * below U+0100, then written out one byte per character. That keeps the xref
 * byte offsets equal to string indices, which is what makes this tractable
 * without a byte-level builder.
 */

export interface PdfField {
  label: string;
  value: string;
  /** Renders the value in bold — used for totals. */
  strong?: boolean;
}

export interface PdfColumn {
  header: string;
  /** Relative weight; columns are scaled to fill the text width. */
  width: number;
  align?: 'left' | 'right';
}

export type PdfBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string; muted?: boolean }
  | { kind: 'fields'; rows: PdfField[] }
  | { kind: 'table'; columns: PdfColumn[]; rows: string[][] }
  | { kind: 'spacer'; height?: number };

export interface PdfDocument {
  title: string;
  subtitle?: string;
  /** Repeated at the bottom of every page, left of the page number. */
  footer?: string;
  blocks: PdfBlock[];
  /** Injectable so tests produce a stable document. */
  createdAt?: Date;
}

/* ------------------------------------------------------------------ */
/* Page geometry (A4 portrait, points)                                 */
/* ------------------------------------------------------------------ */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 56;
const TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X;

const SIZE_TITLE = 15;
const SIZE_SUBTITLE = 8.5;
const SIZE_HEADING = 10.5;
const SIZE_BODY = 9;
const SIZE_TABLE = 7.8;
const SIZE_FOOTER = 7;

const LEAD_BODY = 12;
const LEAD_TABLE = 10.5;

/* ------------------------------------------------------------------ */
/* WinAnsi encoding                                                    */
/* ------------------------------------------------------------------ */

// The 0x80–0x9F slots of WinAnsiEncoding, which do not match Unicode.
const WINANSI_SPECIALS: Record<string, number> = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85,
  '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8a,
  '\u2039': 0x8b, '\u0152': 0x8c, '\u017D': 0x8e, '\u2018': 0x91, '\u2019': 0x92,
  '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9a, '\u203A': 0x9b, '\u0153': 0x9c,
  '\u017E': 0x9e, '\u0178': 0x9f,
};

// fr-FR number formatting emits U+202F/U+2009 as the thousands separator; they
// have no WinAnsi slot and would otherwise print as "?" inside every amount.
const SPACE_LIKE = /[\u2009\u202F]/g;

// Mathematical and arrow glyphs used across the app have no WinAnsi slot either.
const FALLBACKS: Record<string, string> = {
  '\u2264': '<=', '\u2265': '>=', '\u2260': '!=', '\u2248': '~',
  '\u00D7': 'x', '\u2212': '-', '\u2192': '->', '\u2013': '\u2013',
};

/** Maps a JS string onto WinAnsi bytes, one character per byte. */
export function toWinAnsi(text: string): string {
  let out = '';
  for (const char of text.replace(SPACE_LIKE, ' ')) {
    const fallback = FALLBACKS[char];
    if (fallback !== undefined && fallback !== char) {
      out += toWinAnsi(fallback);
      continue;
    }
    const special = WINANSI_SPECIALS[char];
    if (special !== undefined) {
      out += String.fromCharCode(special);
      continue;
    }
    const code = char.codePointAt(0) ?? 63;
    out += code >= 0x20 && code <= 0xff ? char : '?';
  }
  return out;
}

function escapePdfText(text: string): string {
  return toWinAnsi(text).replace(/[\\()]/g, (c) => `\\${c}`);
}

/* ------------------------------------------------------------------ */
/* Helvetica metrics (units per 1000, ASCII 32–126)                    */
/* ------------------------------------------------------------------ */

const WIDTHS_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const WIDTHS_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Accented glyphs have the width of their base letter, so folding them keeps
// the metrics exact without a full 256-entry table.
const DIACRITIC_FOLD: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a',
  ç: 'c', è: 'e', é: 'e', ê: 'e', ë: 'e',
  î: 'i', ï: 'i', í: 'i', ì: 'i',
  ô: 'o', ö: 'o', ó: 'o', ò: 'o', õ: 'o',
  ù: 'u', û: 'u', ü: 'u', ú: 'u',
  ÿ: 'y', ñ: 'n',
  À: 'A', Â: 'A', Ä: 'A', Á: 'A',
  Ç: 'C', È: 'E', É: 'E', Ê: 'E', Ë: 'E',
  Î: 'I', Ï: 'I', Ô: 'O', Ö: 'O', Ù: 'U', Û: 'U', Ü: 'U',
};

// WinAnsi slots with no ASCII equivalent, as [regular, bold]. The non-breaking
// space matters: fr-FR amounts put one before the euro sign.
const HIGH_WIDTHS: Record<number, [number, number]> = {
  0x80: [556, 556], // euro
  0x91: [222, 238], // quoteleft
  0x92: [222, 238], // quoteright
  0x95: [350, 350], // bullet
  0x96: [556, 556], // endash
  0x97: [1000, 1000], // emdash
  0xa0: [278, 278], // nbsp
};

/** Width of `text` in points at `size`, using the base-14 Helvetica metrics. */
export function measureText(text: string, size: number, bold = false): number {
  const widths = bold ? WIDTHS_BOLD : WIDTHS_REGULAR;
  let total = 0;
  for (const raw of toWinAnsi(text)) {
    const char = DIACRITIC_FOLD[raw] ?? raw;
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) total += widths[code - 32];
    else total += HIGH_WIDTHS[code]?.[bold ? 1 : 0] ?? 556;
  }
  return (total * size) / 1000;
}

/** Greedy word wrap; words longer than `maxWidth` are broken character by character. */
export function wrapText(text: string, maxWidth: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureText(candidate, size, bold) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (measureText(word, size, bold) <= maxWidth) {
        current = word;
        continue;
      }
      let chunk = '';
      for (const char of word) {
        if (measureText(chunk + char, size, bold) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = '';
        }
        chunk += char;
      }
      current = chunk;
    }
    lines.push(current);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Content-stream helpers                                              */
/* ------------------------------------------------------------------ */

function num(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

function textOp(text: string, x: number, y: number, size: number, bold: boolean, grey = 0): string {
  const font = bold ? '/F2' : '/F1';
  const colour = grey > 0 ? `${num(grey)} ${num(grey)} ${num(grey)} rg\n` : '0 0 0 rg\n';
  return `${colour}BT ${font} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm (${escapePdfText(text)}) Tj ET\n`;
}

function lineOp(x1: number, y: number, x2: number, grey: number): string {
  return `${num(grey)} ${num(grey)} ${num(grey)} RG 0.5 w ${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S\n`;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

class Layout {
  readonly pages: string[] = [];
  private ops = '';
  private y = PAGE_HEIGHT - MARGIN_TOP;

  newPage(): void {
    this.pages.push(this.ops);
    this.ops = '';
    this.y = PAGE_HEIGHT - MARGIN_TOP;
  }

  /** Starts a new page when `height` no longer fits above the bottom margin. */
  ensure(height: number): void {
    if (this.y - height < MARGIN_BOTTOM) this.newPage();
  }

  write(op: string): void {
    this.ops += op;
  }

  get cursorY(): number {
    return this.y;
  }

  advance(height: number): void {
    this.y -= height;
  }

  finish(): string[] {
    this.pages.push(this.ops);
    this.ops = '';
    return this.pages;
  }
}

function renderHeading(layout: Layout, text: string): void {
  layout.ensure(32);
  layout.advance(10);
  layout.write(textOp(text, MARGIN_X, layout.cursorY, SIZE_HEADING, true));
  layout.advance(5);
  layout.write(lineOp(MARGIN_X, layout.cursorY, PAGE_WIDTH - MARGIN_X, 0.75));
  layout.advance(11);
}

function renderParagraph(layout: Layout, text: string, muted: boolean): void {
  for (const line of wrapText(text, TEXT_WIDTH, SIZE_BODY)) {
    layout.ensure(LEAD_BODY);
    layout.write(textOp(line, MARGIN_X, layout.cursorY, SIZE_BODY, false, muted ? 0.45 : 0));
    layout.advance(LEAD_BODY);
  }
}

function renderFields(layout: Layout, rows: PdfField[]): void {
  const labelWidth = TEXT_WIDTH * 0.62;
  for (const row of rows) {
    layout.ensure(LEAD_BODY);
    const y = layout.cursorY;
    for (const line of wrapText(row.label, labelWidth, SIZE_BODY)) {
      layout.write(textOp(line, MARGIN_X, layout.cursorY, SIZE_BODY, false, 0.25));
      layout.advance(LEAD_BODY);
    }
    const valueWidth = measureText(row.value, SIZE_BODY, row.strong);
    layout.write(textOp(row.value, PAGE_WIDTH - MARGIN_X - valueWidth, y, SIZE_BODY, !!row.strong));
  }
}

function renderTable(layout: Layout, columns: PdfColumn[], rows: string[][]): void {
  // Right-aligned cells stop short of the column edge so they never touch the
  // neighbouring column, which has no visible separator.
  const GUTTER = 6;
  const totalWeight = columns.reduce((sum, col) => sum + col.width, 0);
  const widths = columns.map((col) => (col.width / totalWeight) * TEXT_WIDTH);
  const offsets = widths.reduce<number[]>((acc, _width, i) => {
    acc.push(i === 0 ? MARGIN_X : acc[i - 1] + widths[i - 1]);
    return acc;
  }, []);
  const cellX = (index: number, text: string, bold: boolean) =>
    columns[index].align === 'right'
      ? offsets[index] + widths[index] - GUTTER - measureText(text, SIZE_TABLE, bold)
      : offsets[index];

  const header = () => {
    layout.write(lineOp(MARGIN_X, layout.cursorY + 8, PAGE_WIDTH - MARGIN_X, 0.75));
    columns.forEach((col, i) => {
      layout.write(textOp(col.header, cellX(i, col.header, true), layout.cursorY, SIZE_TABLE, true, 0.3));
    });
    layout.advance(4);
    layout.write(lineOp(MARGIN_X, layout.cursorY, PAGE_WIDTH - MARGIN_X, 0.75));
    layout.advance(LEAD_TABLE);
  };

  layout.ensure(LEAD_TABLE * 3);
  header();

  for (const row of rows) {
    if (layout.cursorY - LEAD_TABLE < MARGIN_BOTTOM) {
      layout.newPage();
      header();
    }
    row.forEach((cell, i) => {
      if (i >= columns.length) return;
      layout.write(textOp(cell, cellX(i, cell, false), layout.cursorY, SIZE_TABLE, false));
    });
    layout.advance(LEAD_TABLE);
  }
  layout.advance(2);
}

function layoutDocument(doc: PdfDocument): string[] {
  const layout = new Layout();

  layout.write(textOp(doc.title, MARGIN_X, layout.cursorY, SIZE_TITLE, true));
  layout.advance(SIZE_TITLE + 4);
  if (doc.subtitle) {
    for (const line of wrapText(doc.subtitle, TEXT_WIDTH, SIZE_SUBTITLE)) {
      layout.write(textOp(line, MARGIN_X, layout.cursorY, SIZE_SUBTITLE, false, 0.45));
      layout.advance(SIZE_SUBTITLE + 2.5);
    }
  }
  layout.advance(4);

  for (const block of doc.blocks) {
    switch (block.kind) {
      case 'heading':
        renderHeading(layout, block.text);
        break;
      case 'paragraph':
        renderParagraph(layout, block.text, !!block.muted);
        break;
      case 'fields':
        renderFields(layout, block.rows);
        break;
      case 'table':
        renderTable(layout, block.columns, block.rows);
        break;
      case 'spacer':
        layout.advance(block.height ?? 8);
        break;
    }
  }

  return layout.finish();
}

function withFooters(pages: string[], footer: string | undefined): string[] {
  return pages.map((ops, index) => {
    const y = MARGIN_BOTTOM - 22;
    let out = ops + lineOp(MARGIN_X, y + 12, PAGE_WIDTH - MARGIN_X, 0.8);
    if (footer) out += textOp(footer, MARGIN_X, y, SIZE_FOOTER, false, 0.5);
    const label = `Page ${index + 1} / ${pages.length}`;
    out += textOp(
      label,
      PAGE_WIDTH - MARGIN_X - measureText(label, SIZE_FOOTER),
      y,
      SIZE_FOOTER,
      false,
      0.5
    );
    return out;
  });
}

/* ------------------------------------------------------------------ */
/* File assembly                                                       */
/* ------------------------------------------------------------------ */

function pdfDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Serialises a laid-out document into the bytes of a PDF 1.4 file. */
export function buildPdf(doc: PdfDocument): Uint8Array {
  const pages = withFooters(layoutDocument(doc), doc.footer);
  const createdAt = doc.createdAt ?? new Date();

  const firstPageObj = 6;
  const pageIds = pages.map((_, i) => firstPageObj + i * 2);
  const objects: string[] = [
    `<</Type/Catalog/Pages 2 0 R>>`,
    `<</Type/Pages/Kids[${pageIds.map((id) => `${id} 0 R`).join(' ')}]/Count ${pages.length}>>`,
    `<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>`,
    `<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>`,
    `<</Title(${escapePdfText(doc.title)})/Producer(Simulateur fiscal - Actions Microsoft)` +
      `/CreationDate(${pdfDate(createdAt)})>>`,
  ];

  pages.forEach((content, i) => {
    objects.push(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]` +
        `/Resources<</Font<</F1 3 0 R/F2 4 0 R>>>>/Contents ${pageIds[i] + 1} 0 R>>`
    );
    objects.push(`<</Length ${content.length}>>\nstream\n${content}endstream`);
  });

  let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f\r\n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n\r\n`;
  }
  const file =
    body +
    xref +
    `trailer\n<</Size ${objects.length + 1}/Root 1 0 R/Info 5 0 R>>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  const bytes = new Uint8Array(file.length);
  for (let i = 0; i < file.length; i++) bytes[i] = file.charCodeAt(i) & 0xff;
  return bytes;
}

/** Builds the document and wraps it in a Blob ready for `downloadBlob`. */
export function buildPdfBlob(doc: PdfDocument): Blob {
  const bytes = buildPdf(doc);
  return new Blob([bytes.slice()], { type: 'application/pdf' });
}
