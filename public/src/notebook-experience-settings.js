import { isDate } from './model.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const validStudentId = value => /^[1-3]\d{4}$/.test(value) && Number(value.slice(1, 3)) > 0 && Number(value.slice(3)) > 0;

/** Day baselines are deliberately separate from the older application-count baseline. */
export function normalizeExperienceSettings(input = {}) {
  if (!object(input) || Object.keys(input).some(key => !['blockedDates', 'baselineDays', 'warningPhrases', 'weekdayLessons'].includes(key))) throw new Error('체험학습 표 설정을 확인해 주세요.');
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
  const result = { blockedDates: [...new Set(blockedDates)].sort(), baselineDays };
  // Optional keys stay absent until a teacher saves them, so older stored settings compare unchanged.
  if (Object.hasOwn(input, 'warningPhrases')) result.warningPhrases = normalizeWarningPhrases(input.warningPhrases);
  if (Object.hasOwn(input, 'weekdayLessons')) result.weekdayLessons = normalizeWeekdayLessons(input.weekdayLessons);
  return result;
}

/** 같은 달 반복 경고 문구: 공백 정리, 중복 제거, 1~20자, 최대 20개. */
export function normalizeWarningPhrases(input) {
  if (!Array.isArray(input) || input.length > 20) throw new Error('경고 문구는 20개까지 등록할 수 있습니다.');
  const phrases = [];
  for (const raw of input) {
    if (typeof raw !== 'string') throw new Error('경고 문구를 확인해 주세요.');
    const phrase = raw.replace(/\s+/g, ' ').trim();
    if (!phrase || phrase.length > 20 || /[\u0000-\u001f]/.test(phrase)) throw new Error('경고 문구는 1~20자로 입력해 주세요.');
    if (!phrases.includes(phrase)) phrases.push(phrase);
  }
  return phrases;
}

/** 요일별 기본 교시 수(월~금, 4~8교시). */
export function normalizeWeekdayLessons(input) {
  if (!object(input) || Object.keys(input).some(key => !['1', '2', '3', '4', '5'].includes(key))) throw new Error('요일별 교시 수를 확인해 주세요.');
  const result = {};
  for (const day of ['1', '2', '3', '4', '5']) {
    const value = input[day];
    if (!Number.isInteger(value) || value < 4 || value > 8) throw new Error('요일별 교시 수는 4~8교시로 선택해 주세요.');
    result[day] = value;
  }
  return result;
}

/** Only explicitly selected attendance days occupy the shared date grid. */
export function activeExperienceDates(record) {
  return record?.category === 'experience' && !['cancelled', 'rejected'].includes(record.approvalStatus)
    ? record.attendanceDates || [] : [];
}
