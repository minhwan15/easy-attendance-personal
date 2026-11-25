const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SHORT = { 질병: '질병', 출석인정: '인정', 미인정: '미인정', 기타: '기타' };

function coveredDates(record) {
  if (Array.isArray(record.attendanceDates) && record.attendanceDates.length) return record.attendanceDates;
  if (!record.startDate) return [];
  const end = record.endDate && record.endDate >= record.startDate ? record.endDate : record.startDate, out = [];
  for (const d = new Date(`${record.startDate}T12:00:00Z`); out.length < 400; d.setUTCDate(d.getUTCDate() + 1)) { const v = d.toISOString().slice(0, 10); if (v > end) break; out.push(v); }
  return out;
}

/** 교실 게시용 짧은 출결 표시. 자세한 사유는 쓰지 않습니다(생리통 → 인정결석, 질병 → 질병결석). */
export function dailyPrintLabel(record) {
  if (record.category === 'experience') return ['cancelled', 'rejected'].includes(record.approvalStatus) ? '' : '체험학습';
  if (record.category !== 'attendance' || !record.attendanceType) return '';
  const kind = /생리/.test(record.reason || '') ? '인정' : SHORT[record.reasonType] || '';
  return `${kind}${record.attendanceType}`;
}

export function dailyPrintRows(students = [], records = [], date) {
  const byNumber = new Map();
  for (const s of students) { const n = Number(String(s.studentId || '').slice(-2)); if (n > 0) byNumber.set(n, { id: s.studentId, name: s.studentName || s.name || '', labels: [] }); }
  for (const r of records) {
    if (!r?.studentId || !coveredDates(r).includes(date)) continue;
    const label = dailyPrintLabel(r); if (!label) continue;
    const n = Number(String(r.studentId).slice(-2)); if (!(n > 0)) continue;
    const row = byNumber.get(n) || { id: r.studentId, name: r.studentName || '', labels: [] };
    if (!row.labels.includes(label)) row.labels.push(label);
    byNumber.set(n, row);
  }
  const last = Math.max(33, ...byNumber.keys());
  return Array.from({ length: last }, (_, i) => ({ number: i + 1, ...(byNumber.get(i + 1) || { id: '', name: '', labels: [] }) }));
}

export function dailyPrintHtml(students, records, date) {
  const rows = dailyPrintRows(students, records, date);
  const d = new Date(`${date}T12:00:00Z`), when = `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.(${'일월화수목금토'[d.getUTCDay()]})`;
  const sample = rows.find(r => /^\d{5}$/.test(r.id))?.id || '';
  const title = sample ? `${sample[0]}학년 ${Number(sample.slice(1, 3))}반 출결 현황` : '출결 현황';
  const count = re => rows.filter(r => r.labels.some(l => re.test(l))).length;
  const summary = [['결석', /결석$/], ['지각', /지각$/], ['조퇴', /조퇴$/], ['결과', /결과$/], ['체험학습', /^체험학습$/]].map(([k, re]) => `${k} <b>${count(re)}</b>`).join(' · ');
  // 명렬표처럼 왼쪽 1~17번, 오른쪽 18~33번
  const half = Math.ceil(rows.length / 2);
  const cell = r => r ? `<td class="no ${r.labels.length ? 'has' : ''}">${r.number}</td><td class="name ${r.labels.length ? 'has' : ''}">${esc(r.name)}</td><td class="state ${r.labels.length ? 'has' : ''}">${esc(r.labels.join(', '))}</td>` : '<td class="no"></td><td class="name"></td><td class="state"></td>';
  const body = Array.from({ length: half }, (_, i) => `<tr>${cell(rows[i])}<td class="gap"></td>${cell(rows[i + half])}</tr>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><title>${esc(title)} ${esc(when)}</title><link rel="stylesheet" href="/src/notebook-print.css"></head><body class="daily-print">
<header><h1>${esc(title)}</h1><div class="date">${esc(when)}</div></header><p class="sum">${summary}</p>
<table><thead><tr><th class="no">번호</th><th class="name">이름</th><th class="state">출결</th><th class="gap"></th><th class="no">번호</th><th class="name">이름</th><th class="state">출결</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function printDailyAttendance(students, records, date) {
  const frame = document.createElement('iframe'); frame.title = '일일 출결 현황 출력';
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  frame.onload = () => { frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true }); frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); };
  frame.srcdoc = dailyPrintHtml(students, records, date); document.body.append(frame);
}
