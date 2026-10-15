/** Click boundary for the teacher-observed NEIS inclusive slash behavior. */
export function attendancePlan(row) {
  const date=String(row?.date||'');
  const parsed=new Date(`${date}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==date)throw new Error('실제 출결일을 확인해 주세요.');
  const day=parsed.getUTCDay();
  if((day===0||day===6)&&![1,2,3,4,5,6,7,8].includes(Number(row.lessonCount)))throw new Error('주말 수업 교시를 먼저 확인해 주세요.');
  const max=[1,2,3,4,5,6,7,8].includes(Number(row.lessonCount))?Number(row.lessonCount):day===1||day===5?7:6;
  const labels=['조회',...Array.from({length:max},(_,i)=>`${i+1}교시`),'종례'];
  if(row.attendanceType==='결석')return {kind:'결석',boundary:null,marks:labels,hint:'결석은 조회부터 종례까지 전체 표시'};
  if(!['지각','조퇴'].includes(row.attendanceType))throw new Error('결과는 빠진 교시별 클릭 방식을 확인한 뒤 자동화합니다.');
  const source=String(row.periods||'').replace(/\s+/g,'');
  const numeric=new Set();
  let remainder=source.replace(/조회|종례/g,'').replace(/([1-9])(?:[~–-]([1-9]))?(?:교시)?/g,(_,a,b)=>{a=Number(a);b=Number(b||a);if(b<a||a>max||b>max)throw new Error('해당 요일의 교시 범위를 확인해 주세요.');for(let i=a;i<=b;i++)numeric.add(i);return '';}).replace(/[·,、]/g,'');
  if(remainder||!source)throw new Error('빠지는 교시를 확인해 주세요.');
  const selected=new Set([...numeric].map(i=>`${i}교시`));
  if(source.includes('조회'))selected.add('조회');
  if(source.includes('종례'))selected.add('종례');
  const indices=labels.map((x,i)=>selected.has(x)?i:-1).filter(i=>i>=0);
  if(!indices.length)throw new Error('빠지는 교시를 확인해 주세요.');
  const late=row.attendanceType==='지각';
  const boundaryIndex=late?Math.max(...indices):Math.min(...indices);
  const marks=late?labels.slice(0,boundaryIndex+1):labels.slice(boundaryIndex);
  if(marks.length!==selected.size||marks.some(x=>!selected.has(x)))throw new Error(late?'지각은 조회부터 마지막 빠진 교시까지 이어져야 합니다.':'조퇴는 처음 빠진 교시부터 종례까지 이어져야 합니다.');
  return {kind:row.attendanceType,boundary:labels[boundaryIndex],marks,hint:`적용 후 ${labels[boundaryIndex]} 클릭 → ${marks.join(' · ')} 표시`};
}
