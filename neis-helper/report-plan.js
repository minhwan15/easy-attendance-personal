export function reportPlan(row) {
  if(!['지각','조퇴','결과'].includes(row?.attendanceType))throw new Error('지각·조퇴·결과 기록을 선택해 주세요.');
  if(!['질병','미인정','기타','출석인정'].includes(row.reasonType)||!row.reason?.trim())throw new Error('앱에서 신고구분과 사유를 확인해 주세요.');
  const labels=['조회',...Array.from({length:8},(_,i)=>`${i+1}교시`),'종례'];
  const values=new Set();let rest=String(row.periods||'').replace(/\s+/g,'');
  for(const x of ['조회','종례'])if(rest.includes(x)){values.add(x);rest=rest.replace(x,'');}
  rest=rest.replace(/([1-8])(?:[~–-]([1-8]))?(?:교시)?/g,(_,a,b)=>{a=Number(a);b=Number(b||a);if(b<a)throw new Error('교시 순서를 확인해 주세요.');for(let n=a;n<=b;n++)values.add(`${n}교시`);return '';}).replace(/[·,、]/g,'');
  if(rest||!values.size)throw new Error('앱에서 빠지는 교시를 지정해 주세요.');
  const selected=labels.filter(x=>values.has(x));
  const parsed=new Date(`${row.date}T00:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==row.date)throw new Error('실제 출결일을 확인해 주세요.');
  const day=parsed.getUTCDay();
  if((day===0||day===6)&&![1,2,3,4,5,6,7,8].includes(Number(row.lessonCount)))throw new Error('주말 수업 교시를 확인해 주세요.');
  const max=[1,2,3,4,5,6,7,8].includes(Number(row.lessonCount))?Number(row.lessonCount):day===1||day===5?7:6;
  const active=labels.filter(x=>!/^\d교시$/.test(x)||Number(x[0])<=max);
  const span=active.slice(active.indexOf(selected[0]),active.indexOf(selected.at(-1))+1);
  if(span.length!==selected.length||span.some(x=>!values.has(x)))throw new Error('신고서에는 이어진 교시 범위만 입력할 수 있습니다.');
  if(row.attendanceType==='지각'&&selected[0]!=='조회')throw new Error('지각은 조회부터 빠진 교시를 지정해 주세요.');
  if(row.attendanceType==='조퇴'&&selected.at(-1)!=='종례')throw new Error('조퇴는 종례까지 빠진 교시를 지정해 주세요.');
  return {kind:row.attendanceType,reasonType:row.reasonType,status:'접수',start:selected[0],end:selected.at(-1),reason:row.reason};
}
