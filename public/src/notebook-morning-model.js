import { emptyRecord, normalizeRecord, parseSourceText, contentReadiness } from './notebook-model.js';
import { missedPeriods } from './school-timetable.js';
export const MORNING_MARK='[아침 출결 메모]';
export const isMorningRecord=record=>record.category==='attendance'&&String(record.note||'').startsWith(MORNING_MARK);
export function morningReasonType(reason,attendanceType){
  const parsed=parseSourceText(`${reason} ${attendanceType}하겠습니다`).fields;
  return parsed.reasonType||'미인정';
}
export function makeMorningRecord({student,reason,attendanceType,date,reasonType,arrivalTime='',id,previous=null}){
  if(!student?.studentId||!(student.studentName||student.name))throw new Error('명렬표에서 학생 이름을 선택해 주세요.');
  if(!['지각','결석'].includes(attendanceType))throw new Error('지각 또는 결석을 선택해 주세요.');
  if(!String(reason||'').trim())throw new Error('사유를 짧게 적어 주세요.');
  const record=normalizeRecord({...emptyRecord(),...(previous||{}),id:id||previous?.id,studentId:student.studentId,studentName:student.studentName||student.name,
    category:'attendance',sourceType:'memo',startDate:date,endDate:date,attendanceDates:[],attendanceType,
    reasonType:reasonType||morningReasonType(reason,attendanceType),reason:String(reason).trim(),periods:'',
    note:`${MORNING_MARK}${arrivalTime?` 등교 ${arrivalTime}`:''}`,sourceText:`${student.studentName||student.name} · ${reason} · ${attendanceType}`,
    entryStatus:'pending',neisConfirmedDates:[],passKind:'',departureTime:'',returnTime:'',actualReturnTime:'',passIssuedAt:''});
  if(attendanceType==='지각'&&arrivalTime){const derived=missedPeriods({kind:'late',date,arrivalTime});if(!derived.valid)throw new Error(derived.error);record.periods=derived.text;}
  record.reviewStatus=contentReadiness(record).ready?'reviewed':'draft';
  if(previous&&['studentId','studentName','startDate','endDate','attendanceType','reasonType','reason','periods'].every(key=>record[key]===previous[key])){record.entryStatus=previous.entryStatus;record.neisConfirmedDates=[...(previous.neisConfirmedDates||[])];}
  return record;
}
export function markMorningArrival(record,time){
  if(!isMorningRecord(record)||record.attendanceType!=='지각')throw new Error('지각 메모를 확인해 주세요.');
  return makeMorningRecord({student:record,reason:record.reason,attendanceType:'지각',date:record.startDate,reasonType:record.reasonType,arrivalTime:time,id:record.id,previous:record});
}
