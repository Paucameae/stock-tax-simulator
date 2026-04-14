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
 */
export function parseTaxNotice(text: string): TaxNoticeData {
  const result: TaxNoticeData = { raw: text };

  // Normalize whitespace for more robust matching (collapse multiple spaces)
  const t = text.replace(/[ \t]+/g, ' ');

  // --- Fiscal year ---
  // "IMPÔT SUR LES REVENUS DE L'ANNÉE 2024" or "REVENUS 2024" or "Revenus de l'année 2024"
  const yearMatch = t.match(/revenus?\s+(?:de\s+l['']\s*ann[ée]e\s+)?(\d{4})/i)
    || t.match(/REVENUS?\s+(\d{4})/i)
    || t.match(/ann[eé]e\s+(\d{4})/i);
  if (yearMatch) {
    result.fiscalYear = parseInt(yearMatch[1], 10);
  }

  // --- Family status ---
  // "Situation de famille : M" or "Marié(e)s" or "Pacsé(e)s" or "Célibataire"
  // Also handle text split across items: "Situation de famille" on one part, value nearby
  const situationMatch = t.match(/Situation\s+de\s+famille\s*:?\s*(\w+)/i)
    || t.match(/\b(Mari[ée]|Pacs[ée]|C[ée]libataire|Divorc[ée]|Veuf|Veuve)\b/i);
  if (situationMatch) {
    const s = situationMatch[1].toUpperCase();
    if (s === 'M' || s.startsWith('MARI') || s.startsWith('PACS') || s === 'P') {
      result.familyStatus = 'couple';
    } else {
      result.familyStatus = 'single';
    }
  }

  // --- Tax shares (nombre de parts) ---
  // "Nombre de part(s) : 2,50" or "Nombre de parts : 2.5" or "nombre de parts 2,50"
  const partsMatch = t.match(/nombre\s+de\s+parts?\s*\(?\s*s?\s*\)?\s*:?\s*([\d\s,\.]+)/i);
  if (partsMatch) {
    result.taxShares = parseFrenchNumber(partsMatch[1]);
  }

  // --- Persons à charge ---
  // "Nombre de personnes à charge : X" or "personnes à charge X"
  const chargeMatch = t.match(/personnes?\s+[àa]\s+charge\s*:?\s*(\d+)/i);
  if (chargeMatch) {
    result.numberOfChildren = parseInt(chargeMatch[1], 10);
  }

  // --- Revenu brut global ---
  // "Revenu brut global  95 000" or "REVENU BRUT GLOBAL : 95000" - number may be on same or next part
  const rbrMatch = t.match(/revenu\s+brut\s+global\s*:?\s*([\d\s]+[\d])/i);
  if (rbrMatch) {
    result.revenuBrutGlobal = parseFrenchNumber(rbrMatch[1]);
  }

  // --- Revenu imposable ---
  // "Revenu imposable  85 500" or "REVENU IMPOSABLE : 85500"
  // Be careful not to match "revenu fiscal" or "revenu brut"
  const riMatch = t.match(/revenu\s+imposable\s*:?\s*([\d\s]+[\d])/i);
  if (riMatch) {
    result.revenuImposable = parseFrenchNumber(riMatch[1]);
  }

  // --- Revenu fiscal de référence (RFR) ---
  // "Revenu fiscal de référence  87 200" or "revenu fiscal de reference : 87200"
  const rfrMatch = t.match(/revenu\s+fiscal\s+de\s+r[ée]f[ée]rence\s*:?\s*([\d\s]+[\d])/i);
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
