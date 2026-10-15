import { parseDataset } from './model.js';
import { schoolPeriodsForDate } from './school-timetable.js';
import { emptyRecord, normalizeRecord, toNeisRows, exportCsv } from './notebook-model.js';

export function examNeisEligibility(event) {
  if(event.dateMode!=='single'||event.startDate!==event.endDate)return {ready:false,label:'개별 고사일 미확정'};
  if(!schoolPeriodsForDate(event.startDate).length)return {ready:false,label:'주말 · 수업일 확인 필요'};
  return {ready:true,label:event.issues?.length?'증빙 확인 후 선택':'확정된 고사일'};
}

/** One confirmed school day per student; never expand a candidate period. */
export function prepareExamNeis(events, {reviewedIssueIds=[]}={}) {
  if(!Array.isArray(events)||!events.length)throw new Error('보낼 확정 고사일정을 선택해 주세요.');
  parseDataset({schemaVersion:1,title:'고사 출결',sourceLabel:'고사 캘린더',sourceDate:events[0].startDate,defaultMonth:events[0].startDate.slice(0,7),events});
  const reviewed=new Set(reviewedIssueIds), grouped=new Map();
  for(const event of events) {
    const eligible=examNeisEligibility(event);
    if(!eligible.ready)throw new Error(`${event.name}: ${eligible.label}`);
    if(event.issues.length&&!reviewed.has(event.id))throw new Error(`${event.name}: 불일치 일정은 증빙을 확인한 뒤 직접 선택해 주세요.`);
    const key=`${event.studentId}|${event.startDate}`;
    if(!grouped.has(key))grouped.set(key,{event,reasons:new Set()});
    grouped.get(key).reasons.add(`${event.university} ${event.kind==='미기재'?'대학별 고사':event.kind} 응시`);
  }
  const records=[...grouped.values()].map(({event,reasons})=>normalizeRecord({...emptyRecord(),
    id:`exam-${event.studentId}-${event.startDate}`,category:'attendance',studentId:event.studentId,studentName:event.name,
    classNumber:event.classNumber,number:Number(event.studentId.slice(3)),startDate:event.startDate,endDate:event.startDate,
    attendanceDates:[event.startDate],attendanceType:'결석',reasonType:'출석인정',reason:[...reasons].join(' / '),reviewStatus:'reviewed',entryStatus:'pending'}));
  const rows=toNeisRows(records);
  if(rows.length>2000)throw new Error('한 번에 2,000건 이하로 나누어 보내 주세요.');
  return {records,rows,payload:{schemaVersion:1,source:'teacher-notebook',exportedAt:new Date().toISOString(),rows},csv:exportCsv(records)};
}
