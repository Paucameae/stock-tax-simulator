import * as pdfjsLib from 'pdfjs-dist';

// Configure worker - use local file to avoid supply chain attacks from CDNs
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '/pdf.worker.min.mjs',
  import.meta.url
).href;

export interface TaxNoticeData {
  familyStatus?: 'single' | 'couple';
  taxShares?: number;
  numberOfChildren?: number;
  revenuBrutGlobal?: number;
  revenuImposable?: number;
  revenuFiscalReference?: number;
  fiscalYear?: number;
  raw?: string; // full extracted text for debugging
}

/**
 * Extract text content from a PDF file, reconstructing lines from Y coordinates.
 */
async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group text items by Y coordinate to reconstruct lines
    const lines: { y: number; items: { x: number; str: string }[] }[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const y = Math.round(('transform' in item ? (item.transform as number[])[5] : 0) * 10) / 10;
      const x = 'transform' in item ? (item.transform as number[])[4] : 0;
      let line = lines.find((l) => Math.abs(l.y - y) < 2);
      if (!line) {
        line = { y, items: [] };
        lines.push(line);
      }
      line.items.push({ x, str: item.str });
    }

    // Sort lines top-to-bottom (descending Y in PDF coords), items left-to-right
    lines.sort((a, b) => b.y - a.y);
    const pageText = lines
      .map((line) => {
        line.items.sort((a, b) => a.x - b.x);
        return line.items.map((it) => it.str).join(' ');
      })
      .join('\n');
    pages.push(pageText);
  }

  return pages.join('\n\n');
}

/**
 * Parse a number from a French-formatted string: "95 000" -> 95000, "2,50" -> 2.5
 */
function parseFrenchNumber(str: string): number | undefined {
  if (!str) return undefined;
  // Remove spaces (thousands separator), replace comma with dot
  const cleaned = str.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/**
 * Parse the French tax notice (avis d'imposition) PDF.
 * Works with avis from impots.gouv.fr (digitally generated PDFs).
 *
 * Key parsing challenge: labels and values are separated by dots (".....") in
 * the PDF layout, so we need to match through those dot-separators.
 */
export function parseTaxNotice(text: string): TaxNoticeData {
  const result: TaxNoticeData = { raw: text };

  // Normalize whitespace for more robust matching (collapse multiple spaces)
  const t = text.replace(/[ \t]+/g, ' ');

  // Helper: a separator pattern that matches dots, spaces, colons between label and value
  // e.g. "Revenu imposable............................................... 100481"
  const SEP = '[.:\\s]+';

  // --- Fiscal year ---
  // "IMPÔT SUR LES REVENUS DE L'ANNÉE 2024" or "Impôt sur les revenus de 2024"
  const yearMatch = t.match(/revenus?\s+(?:de\s+(?:l['']\s*ann[ée]e\s+)?)?(\d{4})/i)
    || t.match(/ann[eé]e\s+(\d{4})/i);
  if (yearMatch) {
    result.fiscalYear = parseInt(yearMatch[1], 10);
  }

  // --- Family status ---
  // Presence of "Déclarant 2" means couple; also check "Situation de famille" if present
  const hasDec2 = /d[ée]clarant\s+2/i.test(t);
  const situationMatch = t.match(/Situation\s+de\s+famille\s*:?\s*(\w+)/i)
    || t.match(/\b(Mari[ée]|Pacs[ée]|C[ée]libataire|Divorc[ée]|Veuf|Veuve)\b/i);
  if (situationMatch) {
    const s = situationMatch[1].toUpperCase();
    if (s === 'M' || s.startsWith('MARI') || s.startsWith('PACS') || s === 'P') {
      result.familyStatus = 'couple';
    } else {
      result.familyStatus = 'single';
    }
  } else if (hasDec2) {
    result.familyStatus = 'couple';
  }

  // --- Tax shares (nombre de parts) ---
  // Pattern 1: "Nombre de part(s) : 2,50" (explicit label)
  const partsMatch = t.match(new RegExp(`nombre\\s+de\\s+parts?${SEP}([\\d,\\.]+)`, 'i'));
  if (partsMatch) {
    result.taxShares = parseFrenchNumber(partsMatch[1]);
  }
  // Pattern 2: In summary header, parts appear on a line like "1   1   2,75" after family info,
  // or as a standalone decimal like "2,75" near the top. Look for the "Détail" section header
  // line pattern: "{O|M|C|...} {dec1} {dec2} {parts}" e.g. "O\n1   1   2,75"
  if (!result.taxShares) {
    // Match a small decimal (1-10 range, with comma) that stands alone on a line
    const partsFallback = t.match(/\b(\d{1,2}[,.]\d{1,2})\s*\n.*D[ée]tail\s+des\s+revenus/i)
      || t.match(/\n\s*(\d{1,2}[,.]\d{1,2})\s*\n/);
    if (partsFallback) {
      const candidate = parseFrenchNumber(partsFallback[1]);
      // Tax shares are typically between 1 and 10
      if (candidate && candidate >= 1 && candidate <= 10) {
        result.taxShares = candidate;
      }
    }
  }

  // --- Persons à charge ---
  // "Nombre de personnes à charge : X" or "personnes à charge X"
  const chargeMatch = t.match(/personnes?\s+[àa]\s+charge\s*:?\s*(\d+)/i);
  if (chargeMatch) {
    result.numberOfChildren = parseInt(chargeMatch[1], 10);
  }
  // Fallback: count from "Forfait scolarité : Nombre d'enfants ... N"
  if (result.numberOfChildren === undefined) {
    const enfantsMatch = t.match(/Nombre\s+d['']enfants${SEP}(\d+)/i)
      || t.match(/Forfait\s+scolarit[ée].*?(\d+)\s+(\d+)/i);
    if (enfantsMatch) {
      // Take the last captured digit group (the "retenu" value)
      const val = parseInt(enfantsMatch[enfantsMatch.length - 1], 10);
      if (val >= 0 && val <= 20) result.numberOfChildren = val;
    }
  }

  // --- Revenu brut global ---
  // "Revenu brut global.............................................. 108261"
  const rbrMatch = t.match(new RegExp(`revenu\\s+brut\\s+global${SEP}([\\d\\s]+[\\d])`, 'i'));
  if (rbrMatch) {
    result.revenuBrutGlobal = parseFrenchNumber(rbrMatch[1]);
  }

  // --- Revenu imposable ---
  // "Revenu imposable............................................... 100481"
  // Avoid matching "revenu fiscal" or "revenu brut"
  const riMatch = t.match(new RegExp(`revenu\\s+imposable${SEP}([\\d\\s]+[\\d])`, 'i'));
  if (riMatch) {
    result.revenuImposable = parseFrenchNumber(riMatch[1]);
  }

  // --- Revenu fiscal de référence (RFR) ---
  // "Revenu fiscal de référence   .............................. 108989"
  const rfrMatch = t.match(new RegExp(`revenu\\s+fiscal\\s+de\\s+r[ée]f[ée]rence${SEP}([\\d\\s]+[\\d])`, 'i'));
  if (rfrMatch) {
    result.revenuFiscalReference = parseFrenchNumber(rfrMatch[1]);
  }

  return result;
}

/**
 * Read a PDF file and parse it as a French tax notice.
 */
export async function parseTaxNoticePdf(file: File): Promise<TaxNoticeData> {
  const text = await extractTextFromPdf(file);
  return parseTaxNotice(text);
}
