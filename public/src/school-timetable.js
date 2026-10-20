/** 내 출결함의 학교 시간표를 사용합니다. 설정 전 기본값은 각 교시 50분입니다. */
export const SCHOOL_PERIODS = Object.freeze([
  {period:1,start:'09:10',end:'10:00'},
  {period:2,start:'10:10',end:'11:00'},
  {period:3,start:'11:10',end:'12:00'},
  {period:4,start:'12:10',end:'13:00'},
  {period:5,start:'13:50',end:'14:40'},
  {period:6,start:'14:50',end:'15:40'},
  {period:7,start:'15:50',end:'16:40'},
  {period:8,start:'16:50',end:'17:40'},
].map(Object.freeze));

const minuteOfDay = value => typeof value==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
  ? Number(value.slice(0,2))*60+Number(value.slice(3)) : null;

/** Only the weekday timetable is known. Weekend lessons require an explicit teacher choice. */
export function schoolPeriodsForDate(date, lessonCount = 0) {
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
  const parsed=new Date(`${date}T00:00:00Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return [];
  const weekday=parsed.getUTCDay(),settings=globalThis.easyProfile?.timetable;
  const count=Number(lessonCount)>=1&&Number(lessonCount)<=8?Number(lessonCount):settings?.counts?.[weekday]??0;
  return (settings?.periods||SCHOOL_PERIODS).slice(0,count).map((x,i)=>({...x,period:i+1}));
}

export function formatSchoolPeriods(periods) {
  const values=[...new Set(periods)].filter(value=>Number.isInteger(value)&&value>=1&&value<=20).sort((a,b)=>a-b);
  const groups=[];
  for(let index=0;index<values.length;index++) {
    const start=values[index]; let end=start;
    while(values[index+1]===end+1) end=values[++index];
    groups.push(start===end ? String(start) : `${start}~${end}`);
  }
  return [periods.includes('조회')?'조회':'',groups.length ? `${groups.join(', ')}교시` : '',periods.includes('종례')?'종례':''].filter(Boolean).join(' · ');
}

/** Half-open class/absence intervals: leaving at a lesson's end does not miss that lesson.
 * For outings, callers must supply the ACTUAL return time, never an expected return time. */
export function missedPeriods({kind,date,departureTime,returnTime,arrivalTime,lessonCount=0}={}) {
  const departure=minuteOfDay(departureTime), returned=minuteOfDay(returnTime),arrival=minuteOfDay(arrivalTime);
  const invalid=error=>({valid:false,periods:[],meetings:[],text:'',error});
  if(!['early','outing','late'].includes(kind))return invalid('외출·조퇴·지각을 선택해 주세요.');
  const scheduled=schoolPeriodsForDate(date,lessonCount);
  if(!scheduled.length)return invalid('해당 날짜의 수업 시간표가 없습니다. 빠진 교시를 직접 선택해 주세요.');
  if(kind==='late') {
    if(arrival===null)return invalid('등교 시각을 입력해 주세요.');
    const periods=scheduled.filter(period=>arrival>minuteOfDay(period.start)).map(period=>period.period);
    return {valid:true,periods,meetings:['조회'],text:formatSchoolPeriods(['조회',...periods]),error:''};
  }
  if(departure===null)return invalid('출발 시각을 입력해 주세요.');
  if(kind==='outing'&&returned===null)return invalid('실제 복귀 시각을 입력해 주세요.');
  if(kind==='outing'&&returned<departure)return invalid('실제 복귀 시각은 출발 시각보다 빠를 수 없습니다.');
  const end=kind==='early'?24*60:returned;
  const periods=end===departure?[]:scheduled.filter(period=>departure<minuteOfDay(period.end)&&end>minuteOfDay(period.start)).map(period=>period.period);
  // Meeting times have not been supplied: the attendance type determines the required label.
  const meetings=kind==='early'?['종례']:[];
  return {valid:true,periods,meetings,text:formatSchoolPeriods([...periods,...meetings]),error:''};
}

/** A single instant supplies both fields, including around Seoul midnight. */
export function seoulNow(date=new Date()) {
  const instant=date instanceof Date?date:new Date(date);
  if(!Number.isFinite(instant.getTime()))throw new RangeError('현재 시각을 확인할 수 없습니다.');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(instant).map(part=>[part.type,part.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
