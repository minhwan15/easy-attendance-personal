/** 학교별로 저장한 시간표만 사용합니다. 시간표 설정 전에는 자동 교시 계산을 하지 않습니다. */
export const SCHOOL_PERIODS = Object.freeze(
  Array.from({length:8},(_,i)=>Object.freeze({period:i+1,start:'',end:''}))
);

const minuteOfDay = value => typeof value==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
  ? Number(value.slice(0,2))*60+Number(value.slice(3)) : null;

/** Only the weekday timetable is known. Weekend lessons require an explicit teacher choice. */
export function schoolPeriodsForDate(date, lessonCount = 0) {
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
  const parsed=new Date(`${date}T00:00:00Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return [];
  const weekday=parsed.getUTCDay(),settings=globalThis.easyProfile?.timetable;
  if(!settings || !Array.isArray(settings.counts) || !Array.isArray(settings.periods))return [];
  const configuredCount=Number(settings.counts[weekday])||0;
  const count=Number(lessonCount)>=1&&Number(lessonCount)<=8?Number(lessonCount):configuredCount;
  if(count<1)return [];
  const free=new Set(freePeriodsForWeekday(settings,weekday));
  const periods=settings.periods.slice(0,count).map((x,i)=>free.has(i+1)?{period:i+1,start:'',end:'',free:true}:{...x,period:i+1});
  if(periods.length!==count || periods.every(x=>x.free) || periods.some(x=>!x.free&&(minuteOfDay(x.start)===null||minuteOfDay(x.end)===null||minuteOfDay(x.end)<=minuteOfDay(x.start))))return [];
  return periods;
}

/** 요일별 공강(비워두기) 교시. 공강은 나이스 교시 칸이 비어 있거나 ‘공강’으로 표시되는 시간입니다. */
export function freePeriodsForWeekday(settings,weekday){
  const list=Array.isArray(settings?.free)?settings.free[weekday]:null;
  return Array.isArray(list)?[...new Set(list.map(Number))].filter(n=>Number.isInteger(n)&&n>=1&&n<=8).sort((a,b)=>a-b):[];
}

/** 공강을 뺀 실제 수업 교시 번호 */
export function lessonPeriodNumbers(periods){
  return periods.filter(period=>!period.free).map(period=>period.period);
}

/** 시간으로 찾은 교시를 이어진 범위로 만듭니다. 사이의 공강도 포함해 나이스 연속 표시와 맞춥니다. */
function spanPeriods(scheduled,matched){
  if(!matched.length)return [];
  const first=Math.min(...matched),last=Math.max(...matched);
  return scheduled.map(period=>period.period).filter(n=>n>=first&&n<=last);
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
    const lessons=scheduled.filter(period=>!period.free),matched=lessons.filter(period=>arrival>minuteOfDay(period.start)).map(period=>period.period);
    const periods=matched.length?scheduled.map(period=>period.period).filter(n=>n<=Math.max(...matched)):[];
    return {valid:true,periods,meetings:['조회'],text:formatSchoolPeriods(['조회',...periods]),error:''};
  }
  if(departure===null)return invalid('출발 시각을 입력해 주세요.');
  if(kind==='outing'&&returned===null)return invalid('실제 복귀 시각을 입력해 주세요.');
  if(kind==='outing'&&returned<departure)return invalid('실제 복귀 시각은 출발 시각보다 빠를 수 없습니다.');
  const end=kind==='early'?24*60:returned;
  const matched=end===departure?[]:scheduled.filter(period=>!period.free&&departure<minuteOfDay(period.end)&&end>minuteOfDay(period.start)).map(period=>period.period);
  const periods=kind==='early'&&matched.length?scheduled.map(period=>period.period).filter(n=>n>=Math.min(...matched)):spanPeriods(scheduled,matched);
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

/** 배포용은 ‘내 출결함 설정’의 시간표를 사용합니다. 아래 값은 공용 설정 창과 호환하기 위한 참고값입니다. */
export const DEFAULT_WEEKDAY_LESSONS = Object.freeze({1:7,2:6,3:6,4:6,5:7});
export const WEEKDAY_LESSON_MIN = 4, WEEKDAY_LESSON_MAX = 8;
export function weekdayLessonsLabel(map = DEFAULT_WEEKDAY_LESSONS) {
  const groups=new Map();
  for(const day of [1,2,3,4,5]){const count=map[day];groups.set(count,[...(groups.get(count)||[]),'월화수목금'[day-1]]);}
  return [...groups].map(([count,days])=>`${days.join('·')} ${count}교시`).join(' / ');
}
