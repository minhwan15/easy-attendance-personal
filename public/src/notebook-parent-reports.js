import { isDate } from './model.js';
const clean=value=>String(value??'').normalize('NFC').replace(/\s+/g,'').trim();
const text=value=>String(value??'').trim();
const kinds=['결석','지각','조퇴','결과'];
const excludedReportRecord=record=>record.reasonType==='미인정'||record.note?.startsWith('[예체능 미인정 조퇴]')||record.reason==='대입실기준비';
export const reportFileKind=kind=>kind==='결석'?'absence':'partial';
export function reportDeadline(date,today){
  if(!isDate(date)||!isDate(today))throw Error('제출기한 날짜를 확인해 주세요.');
  const cursor=new Date(date+'T00:00:00Z');let count=0;
  while(count<5){cursor.setUTCDate(cursor.getUTCDate()+1);if(![0,6].includes(cursor.getUTCDay()))count++;}
  const dueDate=cursor.toISOString().slice(0,10);
  const start=today<dueDate?today:dueDate,end=today<dueDate?dueDate:today;
  const day=new Date(start+'T00:00:00Z');let distance=0;
  while(day.toISOString().slice(0,10)<end){day.setUTCDate(day.getUTCDate()+1);if(![0,6].includes(day.getUTCDay()))distance++;}
  return {dueDate,days:today<=dueDate?distance:-distance,label:today===dueDate?'D-Day':today<dueDate?'D-'+distance:distance?'D+'+distance:'기한 지남',overdue:today>dueDate};
}
export function normalizeReportImports(input={}){
  const result={};
  for(const key of ['absence','partial']){
    const value=input?.[key];if(!value)continue;
    if(!isDate(value.start)||!isDate(value.end)||value.start>value.end||!Array.isArray(value.rows)||value.rows.length>2000)throw Error('신고서 조회기간과 행 수를 확인해 주세요.');
    const rows=value.rows.map(row=>{
      const studentId=text(row.studentId),studentName=text(row.studentName),kind=text(row.kind),status=text(row.status),start=text(row.start),end=text(row.end);
      if(!/^[1-3]\d{4}$/.test(studentId)||!Number(studentId.slice(1,3))||!Number(studentId.slice(3))||!studentName||studentName.length>40||!kinds.includes(kind)||reportFileKind(kind)!==key||!isDate(start)||!isDate(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>366||!status||status.length>40)throw Error('신고서 학생·종류·기간·상태를 확인해 주세요.');
      return {studentId,studentName,kind,status,start,end,...(text(row.reasonType)?{reasonType:text(row.reasonType).slice(0,40)}:{})};
    });
    result[key]={name:text(value.name).slice(0,180),importedAt:text(value.importedAt).slice(0,40),start:value.start,end:value.end,rows};
  }
  if(new TextEncoder().encode(JSON.stringify(result)).length>130000)throw Error('신고서 자료를 기간별로 나누어 올려 주세요.');
  return result;
}
function dateParts(value){
  const matches=[...text(value).matchAll(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g)].map(m=>m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'));
  if(!matches.length||matches.some(date=>!isDate(date)))throw Error('신고기간의 날짜를 읽지 못했습니다.');
  return matches;
}
export function parseReportTable(table,name='',now=new Date().toISOString()){
  const headerIndex=table.findIndex(row=>row.map(clean).includes('성명')&&row.map(clean).includes('진행상태'));
  if(headerIndex<0)throw Error('나이스 신고서관리에서 내려받은 엑셀을 올려 주세요.');
  const headers=table[headerIndex].map(clean),col=label=>headers.indexOf(label);
  const key=col('결석기간')>=0?'absence':col('신고종류')>=0&&col('신고기간(학부모)')>=0?'partial':null;
  if(!key||['학년','반','번호','성명','진행상태'].some(label=>col(label)<0))throw Error('신고서 엑셀의 필수 열이 없습니다.');
  const rows=[];
  for(let index=headerIndex+1;index<table.length;index++){
    const source=table[index],get=label=>source[col(label)];
    if(!text(get('성명'))&&!text(get('학년')))continue;
    const grade=Number(get('학년')),klass=Number(get('반')),number=Number(get('번호'));
    if(![1,2,3].includes(grade)||!Number.isInteger(klass)||klass<1||klass>99||!Number.isInteger(number)||number<1||number>99)throw Error((index+1)+'행 학년·반·번호를 확인해 주세요.');
    const dates=dateParts(get(key==='absence'?'결석기간':'신고기간(학부모)'));
    rows.push({studentId:String(grade)+String(klass).padStart(2,'0')+String(number).padStart(2,'0'),studentName:text(get('성명')),kind:key==='absence'?'결석':clean(get('신고종류')),status:text(get('진행상태')),reasonType:clean(get(key==='absence'?'결석신고구분':'신고구분')),start:dates[0],end:key==='absence'?dates.at(-1):dates[0]});
  }
  const dates=rows.flatMap(row=>[row.start,row.end]).sort();
  const month=(dates.at(-1)||now.slice(0,10)).slice(0,7);
  const end=new Date(month+'-01T00:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
  const snapshot={name,importedAt:now,start:month+'-01',end:end.toISOString().slice(0,10),rows};
  return {key,snapshot:normalizeReportImports({[key]:snapshot})[key]};
}
export function compareParentReports(records,imports,today){
  imports=normalizeReportImports(imports);
  const result=[],seen=new Set(),used=new Set();
  const indices={};
  for(const [key,source]of Object.entries(imports)){
    const index=new Map();for(const row of source.rows){const id=row.studentId+'|'+row.kind;index.set(id,[...(index.get(id)||[]),row]);}indices[key]=index;
  }
  for(const record of records){
    if(excludedReportRecord(record)||record.category!=='attendance'||String(record.id).startsWith('exam-')||!kinds.includes(record.attendanceType)||!/^[1-3]\d{4}$/.test(record.studentId||'')||!record.studentName)continue;
    const days=record.attendanceDates?.length?record.attendanceDates:[record.startDate];
    for(const date of days){
      if(!isDate(date)||date>today)continue;
      const key=[record.studentId,date,record.attendanceType].join('|');if(seen.has(key))continue;seen.add(key);
      const source=imports[reportFileKind(record.attendanceType)];
      if(!source||date<source.start||date>source.end)continue;
      const candidates=(indices[reportFileKind(record.attendanceType)].get(record.studentId+'|'+record.attendanceType)||[]).filter(row=>row.start<=date&&row.end>=date);
      const matches=candidates.filter(row=>clean(row.studentName)===clean(record.studentName));
      matches.forEach(row=>used.add(row));
      const active=matches.filter(row=>!/취소|반려|삭제/.test(row.status));
      const status=active.length?(active.some(row=>/접수/.test(row.status)&&!/대기/.test(row.status))?'received':'submitted'):matches.length||candidates.length?'check':'missing';
      result.push({recordId:record.id,studentId:record.studentId,studentName:record.studentName,date,kind:record.attendanceType,reason:record.reason||'',status,...(status==='missing'?{deadline:reportDeadline(date,today)}:{}),detail:active.length?[...new Set(active.map(row=>row.status))].join(' · '):matches.length?[...new Set(matches.map(row=>row.status))].join(' · '):candidates.length?'엑셀 이름과 앱 이름 불일치':'엑셀에서 해당 학생·날짜·종류를 찾지 못함'});
    }
  }
  result.sort((a,b)=>a.date.localeCompare(b.date)||a.studentId.localeCompare(b.studentId)||a.kind.localeCompare(b.kind));
  const unmatched=Object.values(imports).flatMap(source=>source.rows.flatMap(row=>{
    if(row.reasonType?.includes('미인정')||/취소|반려|삭제/.test(row.status))return [];
    const missingDates=[],cursor=new Date((row.start>source.start?row.start:source.start)+'T00:00:00Z');
    const end=[row.end,source.end,today].sort()[0];
    while(cursor.toISOString().slice(0,10)<=end){
      const date=cursor.toISOString().slice(0,10);
      if((row.start===row.end||![0,6].includes(cursor.getUTCDay()))&&!records.some(r=>r.category==='attendance'&&r.studentId===row.studentId&&clean(r.studentName)===clean(row.studentName)&&r.attendanceType===row.kind&&(r.attendanceDates?.length?r.attendanceDates:[r.startDate]).includes(date)))missingDates.push(date);
      cursor.setUTCDate(cursor.getUTCDate()+1);
    }
    return missingDates.length?[{...row,missingDates}]:[];
  })).sort((a,b)=>a.missingDates[0].localeCompare(b.missingDates[0])||a.studentId.localeCompare(b.studentId));
  return {items:result,unmatched};
}
