import { isDate } from './model.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const validStudentId = value => /^[1-3]\d{4}$/.test(value) && Number(value.slice(1, 3)) > 0 && Number(value.slice(3)) > 0;

/** Day baselines are deliberately separate from the older application-count baseline. */
export function normalizeExperienceSettings(input = {}) {
  if (!object(input) || Object.keys(input).some(key => !['blockedDates', 'baselineDays'].includes(key))) throw new Error('체험학습 표 설정을 확인해 주세요.');
  const blockedDates = Object.hasOwn(input, 'blockedDates') ? input.blockedDates : [];
  if (!Array.isArray(blockedDates) || blockedDates.length > 3660 || !blockedDates.every(isDate)) throw new Error('체험학습 제외 날짜를 확인해 주세요.');
  const baseline = Object.hasOwn(input, 'baselineDays') ? input.baselineDays : {};
  if (!object(baseline) || Object.keys(baseline).length > 100) throw new Error('기존 사용 일수의 학년도를 확인해 주세요.');
  const baselineDays = {};
  let totalStudents = 0;
  for (const year of Object.keys(baseline).sort()) {
    if (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 2199 || !object(baseline[year])) throw new Error('기존 사용 일수의 학년도를 확인해 주세요.');
    const entries = Object.entries(baseline[year]).sort(([a], [b]) => a.localeCompare(b));
    totalStudents += entries.length;
    if (entries.length > 1000 || totalStudents > 10000) throw new Error('기존 사용 일수의 학생 수가 너무 많습니다.');
    baselineDays[year] = {};
    for (const [studentId, days] of entries) {
      if (!validStudentId(studentId) || !Number.isInteger(days) || days < 0 || days > 366) throw new Error('학번과 기존 사용 일수(0~366일)를 확인해 주세요.');
      baselineDays[year][studentId] = days;
    }
  }
  return { blockedDates: [...new Set(blockedDates)].sort(), baselineDays };
}

/** Only explicitly selected attendance days occupy the shared date grid. */
export function activeExperienceDates(record) {
  return record?.category === 'experience' && !['cancelled', 'rejected'].includes(record.approvalStatus)
    ? record.attendanceDates || [] : [];
}
