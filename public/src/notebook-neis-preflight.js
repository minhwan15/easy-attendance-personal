const allowed=['recordId','category','studentId','studentName','classNumber','number','date','attendanceType','reasonType','periods','reason','note','lessonCount'];
export function prepareNeisTransfer(payload){
 if(!payload||payload.schemaVersion!==1||!['teacher-notebook','homeroom-notebook'].includes(payload.source)||!Array.isArray(payload.rows)||!payload.rows.length||payload.rows.length>2000)throw new Error('보낼 기록은 1~2,000건으로 선택해 주세요.');
 const seen=new Set();
 const rows=payload.rows.map((source,index)=>{
  if(!source||typeof source!=='object'||Array.isArray(source))throw new Error((index+1)+'번째 기록을 확인해 주세요.');
  const row=Object.fromEntries(allowed.filter(key=>Object.hasOwn(source,key)).map(key=>[key,source[key]]));
  for(const key of ['recordId','studentName','reason'])if(!String(row[key]??'').trim())throw new Error((index+1)+'번째 기록의 학생·사유를 확인해 주세요.');
  for(const value of Object.values(row))if(typeof value==='string'&&(value.length>6000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)))throw new Error((index+1)+'번째 기록의 입력 내용을 확인해 주세요.');
  const date=new Date(String(row.date)+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==row.date)throw new Error((index+1)+'번째 기록의 실제 출결일을 확인해 주세요.');
  if(!/^[1-3]\d{4}$/.test(String(row.studentId||'')))throw new Error(row.studentName+': 명렬표에서 학번을 확인해 주세요.');
  if(!['결석','지각','조퇴'].includes(row.attendanceType))throw new Error(row.studentName+': '+(row.attendanceType||'출결 구분')+'은 도우미 자동입력 지원 전입니다. 나이스에서 직접 입력해 주세요.');
  if(!['질병','미인정','출석인정','기타'].includes(row.reasonType))throw new Error(row.studentName+': 사유 구분을 확인해 주세요.');
  if(row.lessonCount!==undefined&&![1,2,3,4,5,6,7,8,'1','2','3','4','5','6','7','8'].includes(row.lessonCount))throw new Error(row.studentName+': 실제 수업 교시 수를 확인해 주세요.');
  const day=date.getUTCDay();if((day===0||day===6)&&!row.lessonCount)throw new Error(row.studentName+': 주말 실제 수업 교시 수를 먼저 지정해 주세요.');
  const max=Number(row.lessonCount)||(day===1||day===5?7:6);
  if(row.attendanceType!=='결석'){
   const sourcePeriods=Array.isArray(row.periods)?row.periods.join(','):String(row.periods||'');const text=sourcePeriods.replace(/\s+/g,'');const numbers=new Set();
   const rest=text.replace(/조회|종례/g,'').replace(/([1-9])(?:[~–-]([1-9]))?(?:교시)?/g,(_,a,b)=>{a=Number(a);b=Number(b||a);if(a>b||b>max)throw new Error(row.studentName+': 빠진 교시 범위를 확인해 주세요.');for(let n=a;n<=b;n++)numbers.add(n);return '';}).replace(/[·,、]/g,'');
   if(!text||rest)throw new Error(row.studentName+': 빠진 교시를 확인해 주세요.');
   const labels=['조회',...Array.from({length:max},(_,i)=>(i+1)+'교시'),'종례'];
   const selected=new Set([...numbers].map(n=>n+'교시'));if(text.includes('조회'))selected.add('조회');if(text.includes('종례'))selected.add('종례');
   const indices=labels.map((label,i)=>selected.has(label)?i:-1).filter(i=>i>=0);
   if(!indices.length)throw new Error(row.studentName+': 빠진 교시를 확인해 주세요.');
   const expected=row.attendanceType==='지각'?labels.slice(0,Math.max(...indices)+1):labels.slice(Math.min(...indices));
   if(expected.length!==selected.size||expected.some(label=>!selected.has(label)))throw new Error(row.studentName+': '+(row.attendanceType==='지각'?'조회부터 마지막 빠진 교시까지':'처음 빠진 교시부터 종례까지')+' 이어지게 선택해 주세요.');
  }
  const key=row.studentId+'|'+row.date;if(seen.has(key))throw new Error(row.studentName+' · '+row.date+': 같은 학생·날짜의 기록이 겹칩니다. 앱에서 내용을 확인한 뒤 한 건으로 보내 주세요.');seen.add(key);
  return row;
 });
 const result={schemaVersion:payload.schemaVersion,source:payload.source,...(payload.exportedAt?{exportedAt:payload.exportedAt}:{}),rows};
 if(new TextEncoder().encode(JSON.stringify(result)).length>4*1024*1024)throw new Error('보낼 기록을 4MB 이하로 나누어 선택해 주세요.');
 return result;
}
