/**
 * Decode an uploaded text file, honouring a BOM and falling back to
 * Windows-1252.
 *
 * Broker exports are UTF-8, but users routinely open them in Excel FR and
 * re-save: the result is Windows-1252, and reading it as UTF-8 corrupts the
 * accented column headers that format detection matches on. The import then
 * fails with a generic "format non reconnu" that points nowhere.
 */
export function decodeTextFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // TextDecoder strips the BOM itself (ignoreBOM defaults to false).
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Every byte is mappable in Windows-1252, so this never throws.
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
