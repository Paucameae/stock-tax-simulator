const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const target = process.argv[2];
const buf = fs.readFileSync(target);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let eocd = -1;
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
  if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
}
const total = view.getUint16(eocd + 10, true);
const cdOff = view.getUint32(eocd + 16, true);
const entries = [];
let c = cdOff;
for (let i = 0; i < total; i++) {
  const method = view.getUint16(c + 10, true);
  const cs = view.getUint32(c + 20, true);
  const nl = view.getUint16(c + 28, true);
  const el = view.getUint16(c + 30, true);
  const cl = view.getUint16(c + 32, true);
  const lho = view.getUint32(c + 42, true);
  const name = Buffer.from(buf.buffer, buf.byteOffset + c + 46, nl).toString('utf8');
  c += 46 + nl + el + cl;
  const lnl = view.getUint16(lho + 26, true);
  const lel = view.getUint16(lho + 28, true);
  const dataOff = lho + 30 + lnl + lel;
  const comp = Buffer.from(buf.buffer, buf.byteOffset + dataOff, cs);
  const data = method === 0 ? comp : zlib.inflateRawSync(comp);
  entries.push({ name, text: data.toString('utf8') });
}

function parseSS(xml) {
  const out = [];
  const re = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let s = '';
    let tm;
    while ((tm = tRe.exec(m[1])) !== null) s += tm[1];
    out.push(s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  }
  return out;
}

function excelDate(serial) {
  // Excel epoch 1899-12-30
  const ms = (Number(serial) - 25569) * 86400 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

const sa = entries.find(e => e.name === 'xl/sharedStrings.xml');
const ss = sa ? parseSS(sa.text) : [];
const sheets = entries.filter(e => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name));
const wbXml = entries.find(e => e.name === 'xl/workbook.xml');
console.log('SHEETS:');
if (wbXml) {
  const m = [...wbXml.text.matchAll(/<sheet\s+([^/]+?)\/>/g)];
  for (const s of m) console.log(' ', s[1]);
}
for (const sh of sheets) {
  console.log('\n========', sh.name, '========');
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  let idx = 0;
  while ((rm = rowRe.exec(sh.text)) !== null) {
    const cells = {};
    const cRe = /<c\s+r="([A-Z]+)\d+"([^>/]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cRe.exec(rm[1])) !== null) {
      const col = cm[1];
      const attrs = cm[2] || '';
      const inner = cm[3] || '';
      const tMatch = attrs.match(/\bt="([^"]+)"/);
      const t = tMatch ? tMatch[1] : 'n';
      const vMatch = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
      const isMatch = inner.match(/<is[^>]*>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
      let val;
      if (t === 's' && vMatch) val = ss[parseInt(vMatch[1], 10)] || '';
      else if (t === 'inlineStr' && isMatch) val = isMatch[1];
      else val = vMatch ? vMatch[1] : '';
      cells[col] = val;
    }
    console.log('r' + (idx++) + ':', JSON.stringify(cells));
  }
}
