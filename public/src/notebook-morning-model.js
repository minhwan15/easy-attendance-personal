import { emptyRecord, normalizeRecord, parseSourceText, contentReadiness } from './notebook-model.js';
import { missedPeriods } from './school-timetable.js';
export const MORNING_MARK='[아침 출결 메모]';
export const isMorningRecord=record=>record.category==='attendance'&&String(record.note||'').startsWith(MORNING_MARK);
export function morningReasonType(reason,attendanceType){
  const parsed=parseSourceText(`${reason} ${attendanceType}하겠습니다`).fields;
  return parsed.reasonType||'미인정';
}
export const MORNING_TYPES=['결석','지각','조퇴'];
export const morningTime=(record,label)=>new RegExp(label+' (\\d\\d:\\d\\d)').exec(record?.note||'')?.[1]||'';
export function makeMorningRecord({student,reason,attendanceType,date,reasonType,arrivalTime='',departureTime='',id,previous=null}){
  if(!student?.studentId||!(student.studentName||student.name))throw new Error('명렬표에서 학생 이름을 선택해 주세요.');
  if(!MORNING_TYPES.includes(attendanceType))throw new Error('결석·지각·조퇴 중 하나를 선택해 주세요.');
  if(!String(reason||'').trim())throw new Error('사유를 짧게 적어 주세요.');
  const record=normalizeRecord({...emptyRecord(),...(previous||{}),id:id||previous?.id,studentId:student.studentId,studentName:student.studentName||student.name,
    category:'attendance',sourceType:'memo',startDate:date,endDate:date,attendanceDates:[],attendanceType,
    reasonType:reasonType||morningReasonType(reason,attendanceType),reason:String(reason).trim(),periods:'',
    note:`${MORNING_MARK}${attendanceType==='지각'&&arrivalTime?` 등교 ${arrivalTime}`:''}${attendanceType==='조퇴'&&departureTime?` 하교 ${departureTime}`:''}`,sourceText:`${student.studentName||student.name} · ${reason} · ${attendanceType}`,
    entryStatus:'pending',neisConfirmedDates:[],passKind:'',departureTime:'',returnTime:'',actualReturnTime:'',passIssuedAt:''});
  if(attendanceType==='지각'&&arrivalTime){const derived=missedPeriods({kind:'late',date,arrivalTime});if(!derived.valid)throw new Error(derived.error);record.periods=derived.text;}
  if(attendanceType==='조퇴'&&departureTime){const derived=missedPeriods({kind:'early',date,departureTime});if(!derived.valid)throw new Error(derived.error);if(!derived.periods.length)throw new Error('하교 시각이 마지막 교시 이후입니다. 시각을 확인해 주세요.');record.periods=derived.text;}
  record.reviewStatus=contentReadiness(record).ready?'reviewed':'draft';
  if(previous&&['studentId','studentName','startDate','endDate','attendanceType','reasonType','reason','periods'].every(key=>record[key]===previous[key])){record.entryStatus=previous.entryStatus;record.neisConfirmedDates=[...(previous.neisConfirmedDates||[])];}
  return record;
}
export function markMorningArrival(record,time){
  if(!isMorningRecord(record)||record.attendanceType!=='지각')throw new Error('지각 메모를 확인해 주세요.');
  return makeMorningRecord({student:record,reason:record.reason,attendanceType:'지각',date:record.startDate,reasonType:record.reasonType,arrivalTime:time,id:record.id,previous:record});
}
export function markMorningDeparture(record,time){
  if(!isMorningRecord(record)||record.attendanceType!=='조퇴')throw new Error('조퇴 메모를 확인해 주세요.');
  return makeMorningRecord({student:record,reason:record.reason,attendanceType:'조퇴',date:record.startDate,reasonType:record.reasonType,departureTime:time,id:record.id,previous:record});
}
