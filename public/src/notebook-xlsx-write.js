// 아주 작은 엑셀(xlsx) 작성기 — 외부 라이브러리 없이 브라우저에서 바로 내려받기.
// cells: 2차원 배열. 각 칸은 값(문자/숫자/null) 또는 {v, s} (s = 아래 STYLE 번호).
export const STYLE = { plain: 0, head: 1, cell: 2, apply: 3, report: 4, must: 5, title: 6, count: 7, name: 8 };

const esc = value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = index => { let s = ''; index++; while (index) { const m = (index - 1) % 26; s = String.fromCharCode(65 + m) + s; index = Math.floor((index - 1) / 26); } return s; };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="14"/><name val="맑은 고딕"/></font></fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEAF2EC"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF1B8"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD7F0DC"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDE2E2"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3F6F4"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FF9AA59E"/></left><right style="thin"><color rgb="FF9AA59E"/></right><top style="thin"><color rgb="FF9AA59E"/></top><bottom style="thin"><color rgb="FF9AA59E"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf xfId="0" borderId="0" fillId="0" fontId="0" numFmtId="0"/>
<xf xfId="0" numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf xfId="0" fillId="0" fontId="0" numFmtId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf xfId="0" numFmtId="0" fontId="1" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf xfId="0" numFmtId="0" fontId="1" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf xfId="0" numFmtId="0" fontId="1" fillId="5" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf xfId="0" borderId="0" fillId="0" numFmtId="0" fontId="2" applyFont="1"/>
<xf xfId="0" numFmtId="0" fontId="1" fillId="6" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf xfId="0" fillId="0" numFmtId="0" fontId="1" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function sheetXml(cells, { widths = [], merges = [], freeze = null, heights = {} } = {}) {
  const rows = cells.map((row, r) => `<row r="${r + 1}"${heights[r] ? ` ht="${heights[r]}" customHeight="1"` : ''}>${row.map((cell, c) => {
    if (cell == null || cell === '') return '';
    const { v, s = 0 } = typeof cell === 'object' ? cell : { v: cell };
    if (v == null || v === '') return s ? `<c r="${colName(c)}${r + 1}" s="${s}"/>` : '';
    const ref = `${colName(c)}${r + 1}`;
    return typeof v === 'number' ? `<c r="${ref}" s="${s}"><v>${v}</v></c>` : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const pane = freeze ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${freeze.col}" ySplit="${freeze.row}" topLeftCell="${colName(freeze.col)}${freeze.row + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` : '';
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const merge = merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}${cols}<sheetData>${rows}</sheetData>${merge}<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = bytes => { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

/** 무압축(store) zip */
function zip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  for (const [name, text] of files) {
    const nameBytes = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true); head.setUint16(4, 20, true); head.setUint16(6, 20, true); head.setUint16(8, 0x0800, true);
    head.setUint32(16, crc, true); head.setUint32(20, data.length, true); head.setUint32(24, data.length, true); head.setUint16(28, nameBytes.length, true); head.setUint32(42, offset, true);
    central.push(new Uint8Array(head.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function buildXlsx(cells, { sheetName = 'Sheet1', ...options } = {}) {
  const name = esc(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheetXml(cells, options)],
  ]);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
