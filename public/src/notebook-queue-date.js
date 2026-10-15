import { readiness, toNeisRows } from './notebook-model.js';
/** Limit a queue selection to pending days, without changing saved records. */
export function queueDateRecords(records,date='') {
  return records.flatMap(record=>{
    if(record.entryStatus==='confirmed'||!readiness(record).ready)return [];
    const days=toNeisRows([record]).map(row=>row.date).filter(day=>!date||day===date);
    if(!days.length)return [];
    if(!date)return [record];
    return [{...record,startDate:date,endDate:date,attendanceDates:['attendance','experience'].includes(record.category)?[date]:[],neisConfirmedDates:[],experienceDayStatuses:Object.fromEntries(Object.entries(record.experienceDayStatuses||{}).filter(([day])=>day===date))}];
  });
}
export function queueDates(records){return [...new Set(records.flatMap(record=>record.entryStatus!=='confirmed'&&readiness(record).ready?toNeisRows([record]).map(row=>row.date):[]))].sort().reverse();}

const dailyVisible=record=>record.category!=='experience'||(!['cancelled','rejected'].includes(record.approvalStatus)&&!!record.attendanceDates?.length);

/** Completed and draft records stay in the same list; completion is per day. */
export function recordsForDateDisplay(records,date='') {
  records=records.filter(dailyVisible);
  if(!date)return records;
  return records.flatMap(record=>{
    const explicit=record.attendanceDates?.length;
    if(explicit?!record.attendanceDates.includes(date):!(record.startDate<=date&&(record.endDate||record.startDate)>=date))return [];
    if(!explicit)return [record];
    const completed=record.entryStatus==='confirmed'||record.neisConfirmedDates?.includes(date);
    return[{...record,startDate:date,endDate:date,attendanceDates:[date],neisConfirmedDates:[],entryStatus:completed?'confirmed':'pending',experienceDayStatuses:Object.fromEntries(Object.entries(record.experienceDayStatuses||{}).filter(([day])=>day===date))}];
  });
}
export function displayQueueDates(records){return [...new Set(records.filter(dailyVisible).flatMap(r=>r.attendanceDates?.length?r.attendanceDates:[r.startDate,r.endDate].filter(Boolean)))].sort().reverse();}
