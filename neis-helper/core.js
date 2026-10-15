export const FIELDS = [
  ['studentId', '학번'], ['studentName', '이름'], ['classNumber', '반'], ['number', '번호'],
  ['date', '날짜'], ['attendanceType', '출결 구분'], ['reasonType', '사유 구분'],
  ['periods', '교시'], ['reason', '사유'], ['note', '메모']
];

export function isNeisUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname === 'neis.go.kr' || url.hostname.endsWith('.neis.go.kr'));
  } catch { return false; }
}

function string(value, field, required = false) {
  if (value === null || value === undefined) value = '';
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string' || value.length > 6000) throw new Error(`${field} 값이 올바르지 않습니다.`);
  value = value.trim();
  if (required && !value) throw new Error(`${field} 값이 비어 있습니다.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`${field}에 잘못된 문자가 있습니다.`);
  return value;
}

function isoDate(value) {
  value = string(value, '날짜', true);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('날짜는 유효한 YYYY-MM-DD 형식이어야 합니다.');
  }
  return value;
}

export function parseQueue(payload) {
  if (!payload || payload.schemaVersion !== 1 || !['teacher-notebook', 'homeroom-notebook'].includes(payload.source) || !Array.isArray(payload.rows)) {
    throw new Error('담임 기록장의 ‘나이스 입력용 JSON’ 파일을 선택해 주세요.');
  }
  if (!payload.rows.length || payload.rows.length > 2000) throw new Error('1~2,000개 날짜별 기록만 불러올 수 있습니다.');
  return payload.rows.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error(`${index + 1}번째 기록이 올바르지 않습니다.`);
    const row = { recordId: string(source.recordId, '기록 번호', true), category: string(source.category, '기록 종류') };
    for (const [key, label] of FIELDS) {
      let value = source[key];
      if (key === 'periods' && Array.isArray(value)) value = value.map(x => string(x, label)).join(', ');
      row[key] = key === 'date' ? isoDate(value) : string(value, label, key === 'studentName');
    }
    if (!row.studentId && !(row.classNumber && row.number)) throw new Error(`${index + 1}번째 기록의 학번 또는 반·번호가 필요합니다.`);
    // Only the supported fields enter extension memory. Source documents and other JSON properties are discarded.
    if(source.lessonCount!==undefined){if(![1,2,3,4,5,6,7,8,'1','2','3','4','5','6','7','8'].includes(source.lessonCount))throw new Error('실제 수업 교시 수를 확인해 주세요.');row.lessonCount=Number(source.lessonCount);}
    row.queueId = `${index}:${row.recordId}:${row.date}`;
    return row;
  });
}

