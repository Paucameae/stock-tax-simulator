// One-off inspector. Usage: node scripts/dump-xlsx.cjs "path\to.xlsx" [maxRows]
const fs = require('fs');
const zlib = require('zlib');

function readZip(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no eocd');
  const total = view.getUint16(eocd + 10, true);
  const cdOff = view.getUint32(eocd + 16, true);
  const entries = [];
  let c = cdOff;
  for (let i = 0; i < total; i++) {
    if (view.getUint32(c, true) !== 0x02014b50) throw new Error('bad cd');
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
    let data;
    if (method === 0) data = comp;
    else if (method === 8) data = zlib.inflateRawSync(comp);
    else throw new Error('method ' + method);
    entries.push({ name, text: data.toString('utf8') });
  }
  return entries;
}

function parseSharedStrings(xml) {
  const arr = [];
  const re = /<si>(.*?)<\/si>/gs;
  let m;
  while ((m = re.exec(xml))) {
    const inner = m[1];
    const tParts = [...inner.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map(x => x[1]);
    arr.push(tParts.join(''));
  }
  return arr;
}

function parseSheet(xml, ss) {
  const rows = [];
  const rowRe = /<row\b[^>]*>(.*?)<\/row>/gs;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const inner = rm[1];
    const cellRe = /<c\s+([^/>]*?)(?:\/>|>(.*?)<\/c>)/gs;
    const cells = {};
    let cm;
    while ((cm = cellRe.exec(inner))) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const refMatch = /r="([A-Z]+)\d+"/.exec(attrs);
      const tMatch = /t="([^"]+)"/.exec(attrs);
      const vMatch = /<v>([^<]*)<\/v>/.exec(body);
      const isMatch = /<is><t(?:\s[^>]*)?>([^<]*)<\/t><\/is>/.exec(body);
      if (!refMatch) continue;
      const col = refMatch[1];
      let val;
      if (tMatch && tMatch[1] === 's' && vMatch) val = ss[parseInt(vMatch[1], 10)] || '';
      else if (tMatch && tMatch[1] === 'inlineStr' && isMatch) val = isMatch[1];
      else if (vMatch) val = vMatch[1];
      cells[col] = val;
    }
    rows.push(cells);
  }
  return rows;
}

const file = process.argv[2];
const maxRows = parseInt(process.argv[3] || '500', 10);
if (!file) { console.error('usage: node scripts/dump-xlsx.cjs <path> [maxRows]'); process.exit(1); }
const buf = fs.readFileSync(file);
const entries = readZip(buf);
const wb = entries.find(e => e.name === 'xl/workbook.xml');
const sheetNames = wb ? [...wb.text.matchAll(/<sheet\s+name="([^"]+)"[^/]*?\/>/g)].map(m => m[1]) : [];
console.log('sheets:', sheetNames.join(' | '));
const ss = entries.find(e => e.name === 'xl/sharedStrings.xml');
const ssArr = ss ? parseSharedStrings(ss.text) : [];
const sheets = entries.filter(e => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
  .sort((a, b) => a.name.localeCompare(b.name));
for (let s = 0; s < sheets.length; s++) {
  console.log('\n--- sheet' + (s + 1) + ' (' + (sheetNames[s] || '?') + ') ---');
  const rows = parseSheet(sheets[s].text, ssArr);
  console.log('rows:', rows.length);
  for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
    const cells = rows[i];
    const cols = Object.keys(cells).sort();
    if (cols.length === 0) continue;
    console.log('  ' + i, cols.map(c => c + '=' + JSON.stringify(cells[c])).join(' | '));
  }
}
