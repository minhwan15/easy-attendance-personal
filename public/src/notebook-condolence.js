/** 경조사 출석인정 기준 (학교생활기록부 기재요령 출결상황, 2025학년도 개정 반영).
 *  재량휴업일·공휴일·토요일은 일수에 포함하지 않고, 연속된 결석에 한해 인정. 결혼은 당일에 한함. */
/** 순서 중요: '큰아버지·증조할머니'처럼 긴 친척 호칭을 먼저 판정. */
export const CONDOLENCE_RULES = Object.freeze([
  { kind:'사망', days:3, group:'증조부모·외증조부모·형제자매와 그 배우자·부모의 형제자매와 그 배우자',
    re:/(?:증조|고조|형제|자매|오빠|언니|누나|(?<!외)형(?!님?\s*결혼)|동생|형수|형부|매형|매부|제수|제부|올케|삼촌|외삼촌|숙부|숙모|외숙모|백부|백모|큰아버지|큰어머니|작은아버지|작은어머니|고모|고모부|이모|이모부)/ },
  { kind:'사망', days:5, group:'부모·조부모·외조부모',
    re:/(?:외?조부|외?조모|외?할아버지|외?할머니|외?할아버님|외?할머님|부친|모친|아버지|어머니|아버님|어머님|아빠|엄마|친할아버지|친할머니)/ },
]);
const DEATH = /(?:별세|사망|돌아가|소천|타계|장례|부고|발인|빈소|조문|영결|운명)/;
const MARRIAGE = /(?:결혼|혼례|예식)/;
const MARRIAGE_KIN = /(?:형|오빠|언니|누나|동생|형제|자매|아버지|어머니|아빠|엄마|부모)/;
const ADOPT = /입양/;

/** text → {kind, days, group, note} | null. 관계와 사유가 함께 적혀 있을 때만 판정. */
export function classifyCondolence(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  if (!t.trim()) return null;
  if (ADOPT.test(t)) return { kind:'입양', days:20, group:'학생 본인 입양', note:'경조사(입양) 출석인정 20일' };
  // "조모상", "할머니 상", "외할아버지 돌아가심", "삼촌 장례식" 등
  const death = DEATH.test(t);
  {
    for (const rule of CONDOLENCE_RULES) if ((death && rule.re.test(t)) || new RegExp('(?:' + rule.re.source + ')[가-힣]{0,3}\\s*상(?![담황태처])').test(t)) return { kind:'사망', days:rule.days, group:rule.group, note:`경조사(${rule.group} 사망) 출석인정 ${rule.days}일 · 연속 결석, 토·공휴일·재량휴업일 제외, 사망일 다음 날부터 가능` };
  }
  if (MARRIAGE.test(t) && MARRIAGE_KIN.test(t) && !/본인/.test(t)) return { kind:'결혼', days:1, group:'형제자매·부모 결혼', note:'경조사(형제자매·부모 결혼) 출석인정 1일 · 결혼 당일에 한함' };
  return null;
}

/** 관공서 공휴일(대체공휴일 포함). 학교 재량휴업일은 체험학습 ‘제외 날짜’로 함께 빠집니다. */
export const PUBLIC_HOLIDAYS = Object.freeze(new Set([
  // 2026
  '2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-02','2026-05-05','2026-05-25','2026-06-03','2026-08-17',
  '2026-09-24','2026-09-25','2026-09-28','2026-10-05','2026-10-09','2026-12-25',
  // 2027
  '2027-01-01','2027-02-08','2027-02-09','2027-03-01','2027-05-05','2027-05-13','2027-08-16','2027-09-14','2027-09-15','2027-09-16',
  '2027-10-04','2027-10-11','2027-12-27',
]));

/** 시작일부터 토·일·공휴일·제외 날짜를 건너뛰고 수업일 count일을 고릅니다(시작일 포함). */
export function schoolDaysFrom(start, count, blocked = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start)) || !(count >= 1)) return [];
  const skip = new Set(blocked), dates = [], cursor = new Date(`${start}T12:00:00Z`);
  for (let guard = 0; dates.length < count && guard < 60; guard += 1) {
    const date = cursor.toISOString().slice(0, 10), day = cursor.getUTCDay();
    if (day !== 0 && day !== 6 && !PUBLIC_HOLIDAYS.has(date) && !skip.has(date)) dates.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** 경조사 출석인정 결석 하루만 저장했을 때, 인정 일수만큼 이어서 입력할지 물어볼 내용. */
export function condolenceExtension(record, blocked = []) {
  if (!record || record.category !== 'attendance' || record.attendanceType !== '결석' || record.reasonType !== '출석인정') return null;
  const rule = classifyCondolence(record.reason);
  if (!rule || rule.kind !== '사망' || rule.days < 2) return null;
  const current = record.attendanceDates?.length ? record.attendanceDates : [record.startDate];
  if (current.length !== 1 || (record.endDate && record.endDate !== record.startDate)) return null;
  const dates = schoolDaysFrom(record.startDate, rule.days, blocked);
  if (dates.length !== rule.days || dates[0] !== record.startDate) return null;
  return { rule, dates };
}
