import { isIsoTimestamp } from './model.js';
import { normalizeRecord, contentReadiness, parsePeriods, withAttendanceMeetings } from './notebook-model.js';

export const PASS_LABELS = Object.freeze({ outing:'외출증', early:'조퇴증' });

/** Issuing a paper pass does not establish missed classes or complete a NEIS entry. */
export function passReadiness(input) {
  let record;
  try { record=normalizeRecord(input); } catch(error) { return {ready:false,errors:[error.message]}; }
  const errors=[];
  if (!record.passKind) errors.push('외출증 또는 조퇴증을 선택해 주세요.');
  if (!record.studentId) errors.push('학생을 선택해 주세요.');
  if (!record.studentName) errors.push('학생 이름을 입력해 주세요.');
  if (!record.startDate || record.startDate!==record.endDate) errors.push('외출·조퇴 날짜 하나를 선택해 주세요.');
  if (!record.reason) errors.push('외출·조퇴 사유를 입력해 주세요.');
  if (!record.departureTime) errors.push('출발 시각을 입력해 주세요.');
  if (!record.teacherName) errors.push('담임교사 이름을 입력해 주세요.');
  if (record.passKind==='outing') {
    if (!record.returnTime) errors.push('복귀 예정 시각을 입력해 주세요.');
    else if (record.departureTime && record.returnTime<=record.departureTime) errors.push('복귀 예정 시각은 출발 시각보다 늦어야 합니다.');
    if (record.actualReturnTime && record.departureTime && record.actualReturnTime<record.departureTime) errors.push('실제 복귀 시각은 출발 시각보다 빠를 수 없습니다.');
  }
  const selectedPeriods=parsePeriods(record.periods,{date:record.startDate,lessonCount:record.lessonCount});
  if (record.periods && !selectedPeriods.valid) errors.push(selectedPeriods.error);
  return {ready:errors.length===0,errors};
}

/** One save supplies both the printable pass and, when complete, the existing input queue. */
export function preparePassRecord(input,{teacherName,now=new Date().toISOString()}={}) {
  const record=normalizeRecord({...input,category:'attendance',...(teacherName===undefined?{}:{teacherName})});
  const periods=parsePeriods(record.periods,{date:record.startDate,lessonCount:record.lessonCount});
  record.attendanceType=record.passKind==='early'?'조퇴':record.passKind==='outing'&&periods.valid?'결과':'';
  record.periods=withAttendanceMeetings(record.periods,record.attendanceType,{date:record.startDate,lessonCount:record.lessonCount});
  // The pass covers one day; do not carry selected dates from a previous range.
  record.attendanceDates=record.startDate && record.startDate===record.endDate?[record.startDate]:[];
  const validation=passReadiness(record);
  if (!validation.ready) return {record,...validation};
  if (!record.passIssuedAt) {
    const timestamp=now instanceof Date?now.toISOString():now;
    if (!isIsoTimestamp(timestamp)) throw new Error('발급 시각을 확인해 주세요.');
    record.passIssuedAt=timestamp;
  }
  record.reviewStatus=contentReadiness(record).ready?'reviewed':'draft';
  return {record,...validation};
}
