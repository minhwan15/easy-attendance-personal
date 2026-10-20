import { readReportWorkbook } from './notebook-report-xlsx.js';

const HEADER_NAME = /^(?:이름|성명|학생명|학생성명)$/;
const decodeEntities = value => String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, key) => {
  if (key[0] === '#') { const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1)); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[key.toLowerCase()];
});
const cellText = value => String(value ?? '').replace(/\s+/g, ' ').trim();

/** 표 행을 명렬표 파서가 읽는 CSV로 바꿉니다. 끝의 빈 칸은 지워 머리글과 열 수를 맞춥니다. */
export function rowsToCsv(rows) {
  return rows.map(row => {
    const cells = Array.from(row || [], cellText);
    while (cells.length && !cells.at(-1)) cells.pop();
    return cells.map(cell => /[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell).join(',');
  }).filter(Boolean).join('\n');
}

/** 나이스의 일부 .xls 다운로드는 HTML 표입니다. */
export function htmlTableRows(html) {
  const rows = [];
  for (const row of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const cell of row[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
      const text = decodeEntities(cell[2].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''));
      cells.push(text);
      const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(cell[1])?.[1] || 1);
      for (let i = 1; i < Math.min(span, 50); i++) cells.push('');
    }
    rows.push(cells);
    if (rows.length > 5000) throw new Error('명렬표 행이 너무 많습니다.');
  }
  return rows;
}

const hasNameHeader = rows => rows.some(row => (row || []).some(cell => HEADER_NAME.test(cellText(cell).replace(/\s+/g, ''))));

/** 나이스 명렬표 엑셀(.xlsx, HTML 형식 .xls)을 CSV 글자로 바꿉니다. */
export async function rosterTextFromSpreadsheet(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const sheets = await readReportWorkbook(buffer);
    const sheet = sheets.find(hasNameHeader) || sheets.find(rows => rows.length) || [];
    return rowsToCsv(sheet);
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0)
    throw new Error('예전 엑셀(.xls) 형식은 바로 읽을 수 없습니다. 엑셀에서 ‘다른 이름으로 저장’ → ‘Excel 통합 문서(.xlsx)’ 또는 CSV로 저장해 올려 주세요.');
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.includes('�')) text = new TextDecoder('euc-kr').decode(bytes);
  if (/<table\b/i.test(text)) return rowsToCsv(htmlTableRows(text));
  return text;
}
