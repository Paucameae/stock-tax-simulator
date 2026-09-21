import { describe, it, expect } from 'vitest';
import { decodeTextFile } from '../text-decoding';

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

const HEADER = 'Date acquisition;Quantité;Prix de revient';

describe('decodeTextFile', () => {
  it('reads plain UTF-8', () => {
    expect(decodeTextFile(new TextEncoder().encode(HEADER).buffer)).toBe(HEADER);
  });

  it('strips the UTF-8 BOM Excel prepends', () => {
    const utf8 = new TextEncoder().encode(HEADER);
    expect(decodeTextFile(bytes(0xef, 0xbb, 0xbf, ...utf8))).toBe(HEADER);
  });

  it('falls back to Windows-1252 on bytes that are not valid UTF-8', () => {
    // "Quantité" as Excel FR writes it: é is the single byte 0xE9, which is an
    // incomplete sequence in UTF-8 and would otherwise decode to U+FFFD.
    const cp1252 = bytes(0x51, 0x75, 0x61, 0x6e, 0x74, 0x69, 0x74, 0xe9);
    expect(decodeTextFile(cp1252)).toBe('Quantité');
  });

  it('does not mangle a UTF-8 file that happens to contain 0xE9 sequences', () => {
    const text = 'Prix unitaire € · détenu';
    expect(decodeTextFile(new TextEncoder().encode(text).buffer)).toBe(text);
  });

  it('reads UTF-16 with either byte order', () => {
    const le = bytes(0xff, 0xfe, 0x41, 0x00, 0xe9, 0x00);
    const be = bytes(0xfe, 0xff, 0x00, 0x41, 0x00, 0xe9);
    expect(decodeTextFile(le)).toBe('Aé');
    expect(decodeTextFile(be)).toBe('Aé');
  });
});
