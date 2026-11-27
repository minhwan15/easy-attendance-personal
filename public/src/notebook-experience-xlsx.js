// 체험학습 한눈에 입력 표 → 엑셀(xlsx) 저장
import { cellInfo, usageDays } from './notebook-experience-grid-model.js';
import { buildXlsx, downloadBlob, STYLE } from './notebook-xlsx-write.js';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = date => new Date(`${date}T00:00:00Z`).getUTCDay();

/** 학년도 평일 중, 처음 기록된 날부터 마지막 기록된 날까지(기록이 없으면 fallback) */
export function exportDates({ students, records, year, fallback = [] }) {
  const marked = new Set();
  for (let date = `${year}-03-01`; date < `${year + 1}-03-01`; date = addDays(date, 1)) {
    if ([0, 6].includes(dow(date))) continue;
    if (students.some(s => cellInfo(records, s.studentId, date).mark)) marked.add(date);
  }
  if (!marked.size) return fallback;
  const list = [...marked].sort(), out = [];
  for (let date = list[0]; date <= list.at(-1); date = addDays(date, 1)) if (![0, 6].includes(dow(date))) out.push(date);
  return out;
}

export function experienceSheet({ students, records, year, baselines = {}, today = '', fallbackDates = [], isMust = () => false, blockedDates = [] }) {
  const dates = exportDates({ students, records, year, fallback: fallbackDates });
  const id = students[0]?.studentId || '', klass = /^\d{5}$/.test(id) ? `${id[0]}학년 ${Number(id.slice(1, 3))}반 ` : '';
  const title = `${klass}교외체험학습 현황 (${year}학년도${today ? ` · ${Number(today.slice(5, 7))}/${Number(today.slice(8))} 기준` : ''})`;
  const fixed = ['번호', '이름', '학번', '기존 사용일', '누적', '남은 일수'];
  const H = v => ({ v, s: STYLE.head }), M = v => ({ v, s: STYLE.must });
  const monthRow = [...fixed.map(H), ...dates.map((d, i) => (i === 0 || d.slice(5, 7) !== dates[i - 1].slice(5, 7) ? H(`${Number(d.slice(5, 7))}월`) : H('')))];
  const dayRow = [...fixed.map(() => H('')), ...dates.map(d => (isMust(d) ? M(`${Number(d.slice(8))}\n필수`) : blockedDates.includes(d) ? M(`${Number(d.slice(8))}\n제외`) : H(`${Number(d.slice(8))}\n${WEEK[dow(d)]}`)))];
  const counts = dates.map(() => 0);
  const body = students.map(s => {
    const usage = usageDays({ records, studentId: s.studentId, year, baseline: Number(baselines[s.studentId]) || 0 });
    return [
      { v: Number(s.number || s.studentId.slice(3)), s: STYLE.cell }, { v: s.studentName || s.name || '', s: STYLE.name }, { v: s.studentId, s: STYLE.cell },
      { v: Number(baselines[s.studentId]) || 0, s: STYLE.cell }, { v: usage.total, s: STYLE.cell }, { v: usage.remaining, s: STYLE.cell },
      ...dates.map((d, i) => { const mark = cellInfo(records, s.studentId, d).mark; if (mark) counts[i]++; return { v: mark || '', s: mark === '보' ? STYLE.report : mark ? STYLE.apply : isMust(d) ? STYLE.must : STYLE.cell }; }),
    ];
  });
  const countRow = [{ v: '', s: STYLE.count }, { v: '체험학습 인원', s: STYLE.count }, ...[0, 0, 0, 0].map(() => ({ v: '', s: STYLE.count })), ...counts.map(n => ({ v: n || '', s: STYLE.count }))];
  const legend = [{ v: '신 = 신청서 · 보 = 보고서 · 필수 = 필수 출석일 · 남은 일수 = 연간 20일 기준', s: STYLE.plain }];
  const cells = [[{ v: title, s: STYLE.title }], monthRow, dayRow, ...body, countRow, [], legend];
  const lastCol = 6 + dates.length - 1, col = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const merges = [`A1:${col(Math.max(lastCol, 5))}1`, ...fixed.map((_, i) => `${col(i)}2:${col(i)}3`)];
  for (let i = 0; i < dates.length;) { let j = i; while (j + 1 < dates.length && dates[j + 1].slice(0, 7) === dates[i].slice(0, 7)) j++; if (j > i) merges.push(`${col(6 + i)}2:${col(6 + j)}2`); i = j + 1; }
  return { cells, title, options: { widths: [5, 11, 8, 7, 6, 7, ...dates.map(() => 4.2)], merges, freeze: { col: 2, row: 3 }, heights: { 0: 24, 2: 28 } } };
}

export function downloadExperienceXlsx(input) {
  const sheet = experienceSheet(input);
  downloadBlob(buildXlsx(sheet.cells, { sheetName: '체험학습', ...sheet.options }), `${sheet.title.replace(/[\\/:*?"<>|()·]/g, ' ').replace(/\s+/g, '_')}.xlsx`);
}
