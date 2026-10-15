export const KINDS = ['면접','실기','논술','신체검사','선발시험','면접·실기','미기재'];
export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === value;
}
export function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  if (!isDate(value.slice(0,10)) || Number(value.slice(11,13)) > 23 || Number(value.slice(14,16)) > 59 || Number(value.slice(17,19)) > 59) return false;
  return Number.isFinite(Date.parse(value));
}
export function parseDataset(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.events) || data.events.length > 5000) throw new Error('지원하지 않는 자료 형식입니다. 제공된 일정 JSON 파일을 선택해 주세요.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.defaultMonth || '') || !isDate(data.sourceDate)) throw new Error('자료의 기준 월·작성일이 잘못되었습니다.');
  const ids = new Set(); const duplicates = new Set(); const students = new Map();
  const text = (v,max=300) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (!text(data.title) || !text(data.sourceLabel)) throw new Error('자료 제목과 출처가 필요합니다.');
  data.events.forEach((e,i) => {
    const fail = () => { throw new Error(`${i + 1}번째 일정의 학번·날짜·필수 항목을 확인해 주세요.`); };
    if (!e || !text(e.id,100) || ids.has(e.id) || !/^3\d{4}$/.test(e.studentId) || Number(e.studentId.slice(3)) < 1 || !Number.isInteger(e.classNumber) || e.classNumber < 1 || e.classNumber > 99 || Number(e.studentId.slice(1,3)) !== e.classNumber || !text(e.name,40) || !text(e.university) || !text(e.department) || !text(e.admission) || !KINDS.includes(e.kind) || !isDate(e.startDate) || !isDate(e.endDate) || e.startDate > e.endDate || !['single','oneOf','rangeUnclear'].includes(e.dateMode)) fail();
    if ((e.dateMode === 'single') !== (e.startDate === e.endDate)) fail();
    if ((new Date(e.endDate) - new Date(e.startDate)) / 86400000 > 60) fail();
    for (const field of ['sourcePages','evidencePages']) if (!Array.isArray(e[field]) || (e[field].length === 0 && e.sourceType !== 'teacher') || !e[field].every(x => Number.isInteger(x) && x >= 1 && x <= 10000)) fail();
    for (const field of ['evidence','issues']) if (!Array.isArray(e[field]) || !e[field].every(x => text(x,2000))) fail();
    if (e.note !== undefined && (typeof e.note !== 'string' || e.note.length > 2000)) fail();
    if (e.updatedBy !== undefined && (typeof e.updatedBy !== 'string' || e.updatedBy.length > 40)) fail();
    if (e.updatedAt !== undefined && !isIsoTimestamp(e.updatedAt)) fail();
    if (students.has(e.studentId) && students.get(e.studentId) !== e.name) throw new Error(`동일 학번에 다른 이름이 있습니다: ${e.studentId}`);
    const key = [e.studentId,e.university,e.kind,e.startDate,e.endDate].join('|');
    if (duplicates.has(key)) throw new Error(`${i+1}번째 일정이 중복되었습니다.`);
    students.set(e.studentId,e.name); ids.add(e.id); duplicates.add(key);
  });
  return data;
}
export function shiftMonth(month, amount) {
  const [y,m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y,m-1+amount,1));
  return date.toISOString().slice(0,7);
}
export function monthCells(month) {
  const [y,m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y,m-1,1));
  const length = new Date(Date.UTC(y,m,0)).getUTCDate();
  const count = Math.ceil((first.getUTCDay() + length) / 7) * 7;
  return Array.from({length:count},(_,i) => new Date(Date.UTC(y,m-1,1-first.getUTCDay()+i)).toISOString().slice(0,10));
}
export function inMonth(e, month) { return e.startDate < shiftMonth(month,1)+'-01' && e.endDate >= month+'-01'; }
export function onDay(e, date) { return e.startDate <= date && e.endDate >= date; }
export function filterEvents(events, { month, classNumber='all', query='', kind='all', reviewOnly=false }) {
  const term = query.trim().replace(/\s/g,'').toLocaleLowerCase();
  return events.filter(e => (!month || inMonth(e,month)) && (classNumber === 'all' || e.classNumber === Number(classNumber)) && (kind === 'all' || e.kind === kind) && (!reviewOnly || e.issues.length > 0) && (!term || [e.name,e.studentId,e.university,e.department].join('').replace(/\s/g,'').toLocaleLowerCase().includes(term))).sort((a,b) => a.startDate.localeCompare(b.startDate) || a.studentId.localeCompare(b.studentId) || a.university.localeCompare(b.university,'ko'));
}
export function stats(events) { return {students:new Set(events.map(e=>e.studentId)).size,events:events.length,windows:events.filter(e=>e.dateMode!=='single').length,issues:events.filter(e=>e.issues.length).length}; }
export function dateLabel(e) {
  const short = date => `${Number(date.slice(5,7))}.${Number(date.slice(8,10))}`;
  return e.dateMode === 'single' ? short(e.startDate) : `${short(e.startDate)}–${short(e.endDate)}${e.dateMode === 'oneOf' ? ' 중 1일' : ' · 기간 확인'}`;
}
export function weekday(date) { return '일월화수목금토'[new Date(date+'T00:00:00Z').getUTCDay()]; }
export function todaySeoul() { const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); return ['year','month','day'].map(t=>parts.find(p=>p.type===t).value).join('-'); }
export function csv(events) {
  const safe = value => { let v = String(value ?? ''); if (/^[=+@\-\t\r]/.test(v)) v = "'" + v; return '"' + v.replaceAll('"','""') + '"'; };
  const rows = [['반','학번','이름','대학교','학과','전형','고사구분','시작일','종료일','일정구분','원문검토','명단쪽','증빙쪽'], ...events.map(e=>[e.classNumber,e.studentId,e.name,e.university,e.department,e.admission,e.kind,e.startDate,e.endDate,e.dateMode==='single'?'단일 일자':e.dateMode==='oneOf'?'기간 중 1일':'기간 확인 필요',e.issues.join(' / '),e.sourcePages.join(', '),e.evidencePages.join(', ')])];
  return '\uFEFF'+rows.map(r=>r.map(safe).join(',')).join('\r\n');
}
