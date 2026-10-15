import { isDate } from './model.js';
import { emptyRecord, normalizeRecord, readiness, toNeisRows } from './notebook-model.js';
import { schoolPeriodsForDate } from './school-timetable.js';
export const PRACTICAL_MARK = '[예체능 미인정 조퇴]';
export const isPracticalRecord = record => record.category==='attendance' && String(record.note||'').startsWith(PRACTICAL_MARK);
export function practicalDates({startDate,endDate,excludedDates=[]}) {
  if(!isDate(startDate)||!isDate(endDate)||startDate>endDate)throw new Error('시작일과 종료일을 확인해 주세요.');
  const from=new Date(`${startDate}T00:00:00Z`),end=new Date(`${endDate}T00:00:00Z`);
  if((end-from)/86400000>365)throw new Error('기간은 1년 이내로 선택해 주세요.');
  const excluded=new Set(excludedDates);
  return Array.from({length:Math.round((end-from)/86400000)+1},(_,i)=>new Date(+from+i*86400000).toISOString().slice(0,10)).filter(date=>schoolPeriodsForDate(date).length&&!excluded.has(date));
}
export function createPracticalRecords({students,startDate,endDate,lastAttended=0,reason='대입실기준비',excludedDates=[],idFactory}) {
  const dates=practicalDates({startDate,endDate,excludedDates});
  if(!dates.length)throw new Error('입력할 수업일이 없습니다. 기간과 제외일을 확인해 주세요.');
  if(!Array.isArray(students)||!students.length)throw new Error('학생을 선택해 주세요.');
  const last=Number(lastAttended);
  if(!Number.isInteger(last)||last<0||last>7)throw new Error('마지막 참석 교시를 선택해 주세요.');
  const seen=new Set();
  return students.flatMap(student=>{
    if(!/^3\d{4}$/.test(student.studentId)||!(student.studentName||student.name))throw new Error('3학년 학생의 학번과 이름을 확인해 주세요.');
    if(seen.has(student.studentId))throw new Error('같은 학생을 중복 선택했습니다.');seen.add(student.studentId);
    const groups=new Map();
    for(const date of dates){const periods=last>=schoolPeriodsForDate(date).length?'종례':`${last+1}~종례`;groups.set(periods,[...(groups.get(periods)||[]),date]);}
    return [...groups].map(([periods,attendanceDates])=>{
      const record=normalizeRecord({...emptyRecord(),id:idFactory(),studentId:student.studentId,studentName:student.studentName||student.name,
        startDate,endDate,attendanceDates,attendanceType:'조퇴',reasonType:'미인정',reason:'대입실기준비',
        periods,note:`${PRACTICAL_MARK} ${last===0?'조회만':`${last}교시까지`} 참석`,reviewStatus:'reviewed'});
      const ready=readiness(record);if(!ready.ready)throw new Error(ready.errors?.join(' ')||'기간 내 교시를 확인해 주세요.');
      toNeisRows([record]);return record;
    });
  });
}

