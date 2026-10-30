import { parseSourceText, emptyRecord, normalizeRecord, contentReadiness } from './notebook-model.js';
import { MORNING_MARK } from './notebook-morning-model.js';
import { classifyCondolence } from './notebook-condolence.js';

const KIN = [
  [/외할머니|외조모/, '외조모상'], [/외할아버지|외조부/, '외조부상'], [/할머니|조모/, '조모상'], [/할아버지|조부/, '조부상'],
  [/아버지|아빠|부친/, '부친상'], [/어머니|엄마|모친/, '모친상'],
];
const clean = value => String(value || '').replace(/\s+/g, '');

/** 학부모 문자 한 통 → 학생·출결 구분·사유 제안. 확실하지 않으면 비워 두고 교사가 고칩니다. */
export function suggestFromMessage(text, students = [], today) {
  const fields = { ...parseSourceText(text, { students, referenceDate: today, messageDate: today }).fields };
  if (!fields.studentId) {
    // "도연이가", "은지 할머니가"처럼 이름만 쓴 문자: 이름(성 제외)이 한 학생에게만 맞을 때만 고릅니다.
    const body = clean(text);
    const found = students.filter(student => { const name = clean(student.studentName || student.name); return name.length >= 2 && body.includes(name.slice(1)); });
    if (found.length === 1) { fields.studentId = found[0].studentId; fields.studentName = found[0].studentName || found[0].name; }
  }
  const condolence = classifyCondolence(text);
  if (condolence && condolence.kind === '사망') {
    fields.reasonType = '출석인정';
    fields.reason = KIN.find(([re]) => re.test(text))?.[1] || fields.reason || '경조사';
    fields.attendanceType = fields.attendanceType || '결석';
  }
  fields.attendanceType = fields.attendanceType || '결석';
  if (!fields.reasonType) fields.reasonType = '질병';
  if (fields.attendanceType !== '조퇴') delete fields.periods;
  const student = students.find(item => item.studentId === fields.studentId) || null;
  const ready = Boolean(student && fields.reason && (fields.attendanceType !== '조퇴' || fields.periods));
  return { fields, student, ready };
}

/** 제안대로 만든 출결 기록. 아침 메모 목록에 함께 보이도록 같은 표시를 붙입니다. */
export function recordFromMessage(message, suggestion, today, id = crypto.randomUUID()) {
  const { fields, student } = suggestion;
  const record = normalizeRecord({
    ...emptyRecord(), id, category: 'attendance', sourceType: 'memo',
    studentId: student.studentId, studentName: student.studentName || student.name,
    startDate: today, endDate: today, attendanceDates: [],
    attendanceType: fields.attendanceType, reasonType: fields.reasonType, reason: fields.reason,
    periods: fields.attendanceType === '조퇴' ? fields.periods || '' : '',
    note: `${MORNING_MARK} [학부모 문자${message.from ? ` ···${message.from}` : ''}]`,
    sourceText: message.text, entryStatus: 'pending', neisConfirmedDates: [],
  });
  record.reviewStatus = contentReadiness(record).ready ? 'reviewed' : 'draft';
  return record;
}
