import { isDate, isIsoTimestamp, todaySeoul } from './model.js';
import { normalizeExperienceBaseline } from './notebook-roster.js';

export const EXPERIENCE_ANNUAL_LIMIT = 20;

/** March through the following February form one school year. */
export function academicYear(date=todaySeoul()) {
  if (!isDate(date)) throw new Error('학년도를 계산할 날짜를 확인해 주세요.');
  return Number(date.slice(0,4)) - (Number(date.slice(5,7))<3 ? 1 : 0);
}

/** Count applications, not attendance days; report updates keep the application ID. */
export function experienceUsage({records=[],studentId,year,today=todaySeoul(),baseline=0}={}) {
  if (!isDate(today)) throw new Error('기준 날짜를 확인해 주세요.');
  year = year===undefined ? academicYear(today) : Number(year);
  if (!Number.isInteger(year) || year<1900 || year>2199) throw new Error('체험학습 학년도를 확인해 주세요.');
  if (!Array.isArray(records)) throw new Error('체험학습 기록 목록을 확인해 주세요.');
  if (typeof baseline==='object' && baseline!==null) baseline = normalizeExperienceBaseline(baseline)[String(year)] ?? 0;
  if (!Number.isSafeInteger(baseline) || baseline<0 || baseline>999) throw new Error('기존 체험학습 사용횟수는 0~999 사이 정수로 입력해 주세요.');
  // Keep the latest version before filtering by student/category/year, so moving
  // or cancelling an application cannot leave an old duplicate in the count.
  const unique = new Map();
  const time=value=>isIsoTimestamp(value?.updatedAt) ? Date.parse(value.updatedAt) : 0;
  for (const record of records) {
    if (!record || typeof record!=='object' || typeof record.id!=='string' || !record.id) continue;
    const previous=unique.get(record.id);
    if (!previous || time(record)>=time(previous)) unique.set(record.id,record);
  }
  const entries=[];
  let registeredUsed=0,reserved=0,pending=0;
  for (const record of unique.values()) {
    if (record.category!=='experience' || record.studentId!==studentId || !isDate(record.startDate) || academicYear(record.startDate)!==year) continue;
    let status;
    if (record.approvalStatus==='approved') {
      status=record.startDate<=today ? 'used' : 'reserved';
      if (status==='used') registeredUsed++; else reserved++;
    } else if (record.approvalStatus==='pending' && !(record.sourceType==='report' && record.applicationStatus!=='received')) {
      status='pending'; pending++;
    } else continue;
    entries.push({recordId:record.id,startDate:record.startDate,endDate:record.endDate||record.startDate,status});
  }
  entries.sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.recordId.localeCompare(b.recordId));
  const used=baseline+registeredUsed,total=used+reserved;
  return {year,limit:EXPERIENCE_ANNUAL_LIMIT,baseline,registeredUsed,used,reserved,pending,total,
    remaining:Math.max(0,EXPERIENCE_ANNUAL_LIMIT-used),remainingAfterReserved:Math.max(0,EXPERIENCE_ANNUAL_LIMIT-total),
    overLimit:total>EXPERIENCE_ANNUAL_LIMIT,entries};
}
