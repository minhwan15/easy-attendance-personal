import { printHtml } from './notebook-print-frame.js';
import { usageDays } from './notebook-experience-grid-model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
const nextSchoolDay = date => { const d = new Date(`${date}T12:00:00Z`); do d.setUTCDate(d.getUTCDate() + 1); while ([0, 6].includes(d.getUTCDay())); return d.toISOString().slice(0, 10); };

/** 날짜 목록 → "11/30~12/2, 12/7" (주말을 건너 이어지면 한 구간). */
export function dateRanges(dates = []) {
  const sorted = [...new Set(dates)].sort(), out = [];
  for (const date of sorted) { const last = out.at(-1); if (last && nextSchoolDay(last.end) === date) last.end = date; else out.push({ start: date, end: date }); }
  return out.map(r => r.start === r.end ? md(r.start) : `${md(r.start)}~${md(r.end)}`).join(', ');
}

/** 반 게시용(학생 확인용) 체험학습 사용 현황: 번호·이름·날짜·일수만, 사유·장소 없음. */
export function experiencePrintHtml({ students = [], records = [], year, baselines = {}, today = '' }) {
  const rows = students.map(student => {
    const usage = usageDays({ records, studentId: student.studentId, year, baseline: baselines[student.studentId] || 0 });
    return { number: Number(student.number || String(student.studentId).slice(-2)), name: student.studentName || student.name || '', usage };
  }).sort((a, b) => a.number - b.number);
  const sample = students[0]?.studentId || '';
  const title = sample ? `${sample[0]}학년 ${Number(sample.slice(1, 3))}반 교외체험학습 사용 현황` : '교외체험학습 사용 현황';
  const body = rows.map(r => `<tr class="${r.usage.total ? 'has' : ''}"><td class="no">${r.number}</td><td class="name">${esc(r.name)}</td><td class="num">${r.usage.baseline || ''}</td><td class="dates">${esc(dateRanges(r.usage.dates))}</td><td class="num">${r.usage.total || ''}</td><td class="num rem">${r.usage.remaining}</td><td class="sign"></td></tr>`).join('');
  const when = today ? `${Number(today.slice(5, 7))}월 ${Number(today.slice(8))}일 기준` : '';
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><title>${esc(title)}</title><link rel="stylesheet" href="/src/notebook-print.css"></head><body class="exp-list">
<header><h1>${esc(title)}</h1><div class="date">${esc(year)}학년도 · ${esc(when)}</div></header>
<p class="note">연간 20일 이내 · 체험학습 날짜와 일수를 확인하고, 다르면 담임 선생님께 말해 주세요. 맞으면 확인란에 이름을 쓰세요.</p>
<table><thead><tr><th class="no">번호</th><th class="name">이름</th><th class="num">기존<br>사용</th><th>체험학습 날짜(신청 기준)</th><th class="num">사용<br>일수</th><th class="num rem">남은<br>일수</th><th class="sign">확인</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function printExperienceUsage(options) {
  printHtml(experiencePrintHtml(options), '체험학습 사용 현황 출력');
}
