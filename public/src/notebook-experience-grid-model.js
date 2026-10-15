import { isDate, isIsoTimestamp, todaySeoul } from './model.js';
import { emptyRecord, normalizeRecord, contentReadiness } from './notebook-model.js';
import { academicYear, EXPERIENCE_ANNUAL_LIMIT } from './notebook-experience-usage.js';

const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const unique=values=>[...new Set(values)];
const active=record=>record?.category==='experience'&&!['cancelled','rejected'].includes(record.approvalStatus);
const selectedDates=record=>unique((record.attendanceDates||[]).filter(isDate)).sort();
const validStudentId=value=>typeof value==='string'&&/^[1-3]\d{4}$/.test(value)&&Number(value.slice(1,3))>0&&Number(value.slice(3))>0;

/** A repeated snapshot never creates a second application or revives a cancelled one. */
function latestRecords(records) {
  if (!Array.isArray(records)) throw new Error('체험학습 기록 목록을 확인해 주세요.');
  const latest=new Map();
  const time=record=>isIsoTimestamp(record?.updatedAt)?Date.parse(record.updatedAt):0;
  for (const [index,record] of records.entries()) {
    if (!record||typeof record!=='object') continue;
    const key=record.id||`unsaved:${index}`, previous=latest.get(key);
    if (!previous||time(record)>=time(previous)) latest.set(key,record);
  }
  return [...latest.values()];
}

/** Visible columns only. Displaying a weekday does not create an attendance day. */
export function gridDates(month,count=2,{includeWeekends=false}={}) {
  if (typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!isDate(`${month}-01`)) throw new Error('표의 시작 월을 확인해 주세요.');
  if (!Number.isSafeInteger(count)||count<1||count>12) throw new Error('표에 표시할 기간은 1~12개월로 선택해 주세요.');
  const cursor=new Date(`${month}-01T00:00:00Z`), end=new Date(cursor);
  end.setUTCMonth(end.getUTCMonth()+count);
  const dates=[];
  while (cursor<end) {
    if (includeWeekends||![0,6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0,10));
    cursor.setUTCDate(cursor.getUTCDate()+1);
  }
  return dates;
}

export function normalizeGridMark(value) {
  if (value===null||value===undefined) return '';
  const mark=String(value).trim();
  if (!mark||mark==='신'||mark==='보') return mark;
  if (['0','O','o','ㅇ'].includes(mark)) return '보';
  throw new Error('신(신청서), 보(보고서), 또는 빈칸으로 입력해 주세요.');
}

function recordMark(record,date) {
  const status=record.experienceDayStatuses?.[date];
  if (status==='report') return '보';
  if (status==='application') return '신';
  if (Object.keys(record.experienceDayStatuses||{}).length) return '대';
  if (record.reportStatus==='reviewed') return '보';
  return record.applicationStatus==='received'?'신':'대';
}

/** Unspecified legacy ranges remain visible, but are not counted as confirmed days. */
export function cellInfo(records,studentId,date) {
  if (!isDate(date)) throw new Error('표의 날짜를 확인해 주세요.');
  const matches=latestRecords(records).filter(record=>{
    if (!active(record)||record.studentId!==studentId) return false;
    const dates=selectedDates(record);
    if (dates.length) return dates.includes(date);
    return isDate(record.startDate)&&isDate(record.endDate)&&record.startDate<=date&&date<=record.endDate;
  });
  const uncertain=matches.some(record=>!selectedDates(record).length);
  return {mark:matches.length?(uncertain?'대':recordMark(matches[0],date)):'',records:matches,conflict:matches.length>1,uncertain};
}

/** Count distinct teacher-selected days by school year. Old application counts are untouched. */
export function usageDays({records=[],studentId,year=academicYear(todaySeoul()),baseline=0}={}) {
  year=Number(year);
  if (!Number.isInteger(year)||year<1900||year>2199) throw new Error('체험학습 학년도를 확인해 주세요.');
  if (!Number.isSafeInteger(baseline)||baseline<0||baseline>366) throw new Error('기존 사용일수는 0~366 사이 정수로 입력해 주세요.');
  const days=new Set(),uncertainRecords=[];
  for (const record of latestRecords(records)) {
    if (!active(record)||record.studentId!==studentId) continue;
    const dates=selectedDates(record);
    if (!dates.length) {
      const start=record.startDate,end=record.endDate||start;
      if (isDate(start)&&isDate(end)&&start<`${year+1}-03-01`&&end>=`${year}-03-01`) uncertainRecords.push(record);
      continue;
    }
    for (const date of dates) if (academicYear(date)===year) days.add(date);
  }
  const dates=[...days].sort(),registeredDays=dates.length,total=baseline+registeredDays;
  const remaining=Math.max(0,EXPERIENCE_ANNUAL_LIMIT-total);
  return {year,limit:EXPERIENCE_ANNUAL_LIMIT,baseline,registeredDays,total,totalDays:total,remaining,remainingDays:remaining,overLimit:total>EXPERIENCE_ANNUAL_LIMIT,dates,uncertainRecords};
}

export function retainedExperienceConfirmations(previous,next) {
  if(previous?.category!=="experience"||next?.category!=="experience")return [];
  const keys=["studentId","studentName","classNumber","number","attendanceType","reasonType","periods","lessonCount","reason","applicationStatus","approvalStatus"];
  if(!keys.every(key=>String(previous[key]??"")===String(next[key]??"")))return [];
  const completed=previous.entryStatus=== "confirmed"?selectedDates(previous):previous.neisConfirmedDates||[];
  return completed.filter(date=>selectedDates(next).includes(date));
}

export function rectangleCells(students,dates,from,to,blockedDates=[]) {
  const a=students.findIndex(s=>s.studentId===from.studentId),b=students.findIndex(s=>s.studentId===to.studentId);
  const x=dates.indexOf(from.date),y=dates.indexOf(to.date);
  if([a,b,x,y].some(n=>n<0))return [];
  const blocked=new Set(blockedDates);
  return students.slice(Math.min(a,b),Math.max(a,b)+1).flatMap(s=>dates.slice(Math.min(x,y),Math.max(x,y)+1).filter(d=>!blocked.has(d)).map(date=>({studentId:s.studentId,date})));
}

function sameNeisContent(previous,next) {
  const keys=['category','studentId','studentName','classNumber','number','startDate','endDate','attendanceType','reasonType','periods','lessonCount','reason','applicationStatus','approvalStatus'];
  return keys.every(key=>String(previous[key]??'')===String(next[key]??''))
    &&JSON.stringify(selectedDates(previous))===JSON.stringify(selectedDates(next));
}

function copyRecord(record) {
  return {...record,attendanceDates:selectedDates(record),experienceDayStatuses:{...(record.experienceDayStatuses||{})},attachments:[...(record.attachments||[])]};
}

/** Materialize current per-day state before changing one cell, to preserve the other cells. */
function dayStatuses(record) {
  const statuses={};
  for (const date of selectedDates(record)) {
    const mark=recordMark(record,date);
    if (mark==='보') statuses[date]='report';
    else if (mark==='신') statuses[date]='application';
  }
  return statuses;
}

function deriveReportStatus(record,before,reportEdited) {
  const dates=selectedDates(record);
  if (!dates.length||!reportEdited) return record.reportStatus;
  if (dates.every(date=>record.experienceDayStatuses[date]==='report')) return 'reviewed';
  if (dates.some(date=>record.experienceDayStatuses[date]==='report')) return 'received';
  if (before?.reportStatus==='received'&&!Object.values(before.experienceDayStatuses||{}).includes('report')) return 'received';
  return 'missing';
}

/** Plan one CAS-preserving update per application. Does not mutate or save the supplied records. */
export function planGridChanges({records=[],students=[],edits=[],blockedDates=[],makeId=()=>globalThis.crypto.randomUUID(),approve=false}={}) {
  const snapshot=latestRecords(records);
  if (!Array.isArray(students)||!Array.isArray(edits)||!Array.isArray(blockedDates)||!blockedDates.every(isDate)) throw new Error('체험학습 표 입력 형식을 확인해 주세요.');
  if (typeof makeId!=='function'||typeof approve!=='boolean') throw new Error('체험학습 저장 설정을 확인해 주세요.');
  const blocked=new Set(blockedDates),studentMap=new Map(),cellEdits=new Map(),groups=new Map();
  for (const student of students) {
    if (!student||!validStudentId(student.studentId)) continue;
    if (studentMap.has(student.studentId)&&studentMap.get(student.studentId).studentName!==student.studentName) throw new Error('명렬표에 같은 학번의 다른 이름이 있습니다.');
    studentMap.set(student.studentId,student);
  }
  for (const edit of edits) {
    if (!edit||!validStudentId(edit.studentId)||!isDate(edit.date)) throw new Error('입력할 학생과 날짜를 확인해 주세요.');
    const approvalOnly=approve&&(!own(edit,'mark')||edit.mark===undefined);
    const mark=approvalOnly?undefined:normalizeGridMark(edit.mark);
    if (blocked.has(edit.date)) throw new Error(`${edit.date}는 체험학습 제외일입니다.`);
    const key=`${edit.studentId}|${edit.date}`,previous=cellEdits.get(key);
    if (previous&&previous.mark!==mark) throw new Error('같은 학생·날짜에 서로 다른 입력이 있습니다.');
    cellEdits.set(key,{...edit,mark,approvalOnly});
  }
  for (const edit of cellEdits.values()) {
    const info=cellInfo(snapshot,edit.studentId,edit.date);
    if (info.conflict) throw new Error(`${edit.studentId} 학생의 ${edit.date}에 체험학습 기록이 겹칩니다. 상세 기록에서 정리해 주세요.`);
    const before=info.records[0];
    if (!before&&(!edit.mark||edit.approvalOnly)) continue;
    if (before&&!before.id) throw new Error('기존 체험학습 기록의 식별자를 확인해 주세요.');
    if (edit.approvalOnly&&info.uncertain) throw new Error('상세 기록에서 실제 출결 날짜를 선택해 주세요.');
    if (!edit.mark&&!edit.approvalOnly&&info.uncertain&&before.startDate!==before.endDate) throw new Error('날짜가 지정되지 않은 기간은 상세 기록에서 수정해 주세요.');
    const key=before?`record:${before.id}`:`student:${edit.studentId}`;
    let group=groups.get(key);
    if (!group) {
      let record;
      if (before) record={...copyRecord(before),experienceDayStatuses:dayStatuses(before)};
      else {
        const student=studentMap.get(edit.studentId),studentName=student?.studentName||student?.name;
        if (!studentName||typeof studentName!=='string') throw new Error(`${edit.studentId} 학생의 이름을 명렬표에 먼저 등록해 주세요.`);
        record={...emptyRecord(),category:'experience',studentId:edit.studentId,studentName:studentName.trim(),classNumber:Number(edit.studentId.slice(1,3)),number:Number(edit.studentId.slice(3)),
          attendanceType:'결석',reasonType:'출석인정',reason:'교외체험학습',sourceType:'application',applicationStatus:'received',experienceDayStatuses:{}};
      }
      group={record,before,reportEdited:false};groups.set(key,group);
    }
    if (edit.approvalOnly) continue;
    const {record}=group;
    group.reportEdited=true;
    if (edit.mark) {
      record.attendanceDates=unique([...record.attendanceDates,edit.date]).sort();
      record.experienceDayStatuses[edit.date]=edit.mark==='보'?'report':'application';
      record.applicationStatus='received';
    } else {
      record.attendanceDates=record.attendanceDates.filter(date=>date!==edit.date);
      delete record.experienceDayStatuses[edit.date];
    }
  }
  const knownIds=new Set(snapshot.map(record=>record.id).filter(Boolean)),changes=[];
  for (const group of groups.values()) {
    const {record,before}=group,dates=record.attendanceDates;
    if (!before) {
      if (!dates.length) continue;
      record.id=makeId({studentId:record.studentId,dates:[...dates]});
      if (!record.id||knownIds.has(record.id)) throw new Error('새 체험학습 기록 식별자가 중복됩니다. 다시 저장해 주세요.');
      knownIds.add(record.id);record.startDate=dates[0];record.endDate=dates.at(-1);
    }
    if (!dates.length) record.approvalStatus='cancelled';
    else if (approve) {record.approvalStatus='approved';record.applicationStatus='received';}
    if(before)record.neisConfirmedDates=retainedExperienceConfirmations(before,record);
    record.reportStatus=deriveReportStatus(record,before,group.reportEdited);
    record.reviewStatus=contentReadiness(record).ready?'reviewed':'draft';
    record.entryStatus=before?.entryStatus==='confirmed'&&sameNeisContent(before,record)?'confirmed':'pending';
    // Shared validation checks contents without discarding additional server/CAS metadata.
    normalizeRecord(record);
    const unchanged=before&&JSON.stringify(record)===JSON.stringify(before);
    if (!unchanged) changes.push({record,before});
  }
  return changes;
}
