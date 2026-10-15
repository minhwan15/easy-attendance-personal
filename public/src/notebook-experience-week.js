import { isDate } from './model.js';
import { normalizeRecord, readiness, contentReadiness } from './notebook-model.js';
export function schoolWeek(date){
 if(!isDate(date))throw new Error('주간 기준 날짜를 확인해 주세요.');
 const d=new Date(date+'T00:00:00Z'),offset=(d.getUTCDay()+6)%7;
 d.setUTCDate(d.getUTCDate()-offset);
 const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+4);
 return {start,end:d.toISOString().slice(0,10)};
}
export function shiftWeek(date,amount){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+7*amount);return d.toISOString().slice(0,10);}
export function weeklyExperience(records,date,blockedDates=[]){
 const week=schoolWeek(date),blocked=new Set(blockedDates),items=[];
 for(const r of records.filter(r=>r.category==='experience')){
  const explicit=r.attendanceDates||[],days=explicit.filter(d=>d>=week.start&&d<=week.end);
  if(!days.length){
   if(!explicit.length&&r.startDate<=week.end&&(r.endDate||r.startDate)>=week.start)items.push({record:r,dates:[],reason:'실제 체험일 미지정'});
   continue;
  }
  for(const day of days){
   let reason='';
   if(['cancelled','rejected'].includes(r.approvalStatus))reason=r.approvalStatus==='cancelled'?'신청 취소':'신청 반려';
   else if(r.entryStatus==='confirmed'||r.neisConfirmedDates?.includes(day))reason='나이스 입력 완료';
   else if(blocked.has(day))reason='시험·행사 제외일';
   else if(r.applicationStatus!=='received')reason='신청서 접수 미확인';
   else if(!readiness(r).ready)reason=readiness(r).errors[0];
   items.push({record:r,dates:[day],reason});
  }
 }
 const occurrences=new Map();
 for(const item of items.filter(x=>x.dates.length&&!['신청 취소','신청 반려'].includes(x.reason))){const key=item.record.studentId+'|'+item.dates[0];occurrences.set(key,(occurrences.get(key)||0)+1);}
 for(const item of items)if(item.dates.length&&occurrences.get(item.record.studentId+'|'+item.dates[0])>1)item.reason='같은 학생·날짜 중복 기록';
 const ready=items.filter(x=>!x.reason),excluded=items.filter(x=>x.reason),datesByRecord={};
 for(const item of ready)(datesByRecord[item.record.id]??=[]).push(...item.dates);
 return {...week,ready,excluded,datesByRecord,students:new Set(ready.map(x=>x.record.studentId)).size,days:ready.length};
}
