/** 배포용은 기본 경고 문구가 없습니다. 출결 설정에서 학교 규정에 맞게 추가합니다. */
export const DEFAULT_WARNING_PHRASES = Object.freeze([]);

export const warningPhrasesFor = settings => Array.isArray(settings?.warningPhrases) ? settings.warningPhrases : [...DEFAULT_WARNING_PHRASES];

const squash = value => String(value || '').replace(/\s+/g, '');
const monthsOf = record => new Set([record.startDate, ...(record.attendanceDates || [])].filter(Boolean).map(date => String(date).slice(0, 7)));

/**
 * 같은 학생·같은 달에 같은 경고 문구가 사유에 들어간 다른 출결 기록을 찾습니다.
 * 문구는 공백을 무시하고 비교합니다(예: "생리 통" = "생리통").
 */
export function findRepeatWarnings({ record, records = [], phrases = [] }) {
  if (!record || record.category !== 'attendance' || !record.studentId) return [];
  const reason = squash(record.reason);
  const months = monthsOf(record);
  const result = [];
  for (const phrase of phrases) {
    const key = squash(phrase);
    if (!key || !reason.includes(key)) continue;
    const matches = records.filter(other => other && other.id !== record.id && other.category === 'attendance'
      && other.studentId === record.studentId && squash(other.reason).includes(key)
      && [...monthsOf(other)].some(month => months.has(month)))
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
    if (matches.length) result.push({ phrase, matches });
  }
  return result;
}

/** 이미 같은 내용으로 저장된 기록을 다시 저장할 때는 경고하지 않습니다. */
export function needsRepeatCheck(record, previous) {
  if (!previous) return true;
  return ['studentId', 'startDate', 'reason'].some(key => String(previous[key] || '') !== String(record[key] || ''))
    || JSON.stringify([...(previous.attendanceDates || [])].sort()) !== JSON.stringify([...(record.attendanceDates || [])].sort());
}

export function repeatWarningMessage(record, warnings) {
  const lines = warnings.map(({ phrase, matches }) => `· '${phrase}' 이번 달 기존 기록 ${matches.length}건: ${matches.map(item => `${String(item.startDate).slice(5).replace('-', '/')} ${item.attendanceType || ''}(${item.reasonType || '구분 없음'})`).join(', ')}`);
  return `${record.studentName || record.studentId} 학생은 같은 달에 같은 사유의 기록이 이미 있습니다.\n${lines.join('\n')}\n\n학교 규정(예: 생리통 월 1회 인정)에 따라 출결 구분을 확인하셨나요?\n그대로 저장하려면 [확인]을 누르세요.`;
}
