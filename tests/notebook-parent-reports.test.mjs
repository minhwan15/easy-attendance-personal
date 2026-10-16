import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReportTable,compareParentReports,normalizeReportImports,reportDeadline} from '../public/src/notebook-parent-reports.js';
import {worksheetRows,readReportWorkbook} from '../public/src/notebook-report-xlsx.js';
const absence=[['진행상태','','신청일자','학년','반','번호','성명','결석기간','결석신고 구분','결석사유(교사)'],['접수대기','미상신','2026.10.16','3','8',1,'가학생','2026.10.12 ~ 2026.10.13','','']];
const partial=[['신고종류','진행상태','','신청일자','학년','반','번호','성명','신고기간(학부모)','신고구분','접수기간(담임/교사)','','지각/조퇴/결과사유(교사)'],['지각','접수','완결','2026.10.16','3','8',1,'가학생','2026.10.14 11:00','질병','2026.10.14','조회 ~ 3교시','감기']];
const record=(date,kind='결석',extra={})=>({id:'record-'+date+kind,category:'attendance',studentId:'30801',studentName:'가학생',startDate:date,attendanceDates:[date],attendanceType:kind,entryStatus:'confirmed',reason:'감기',...extra});
const imports=()=>({absence:parseReportTable(absence,'absence.xlsx').snapshot,partial:parseReportTable(partial,'partial.xlsx').snapshot});
test('both NEIS schemas use actual attendance dates, not application dates',()=>{
 const a=parseReportTable(absence);assert.equal(a.snapshot.rows[0].studentId,'30801');assert.equal(a.snapshot.rows[0].start,'2026-10-12');assert.equal(a.snapshot.rows[0].end,'2026-10-13');
 assert.equal(parseReportTable(partial).snapshot.rows[0].start,'2026-10-14');
});
test('waiting means submitted; completed attendance still participates; missing is separate',()=>{
 const saved=[record('2026-10-12'),record('2026-10-13'),record('2026-10-14','지각'),record('2026-10-15')],before=structuredClone(saved);
 const report=compareParentReports(saved,imports(),'2026-10-16');
 assert.deepEqual(report.items.map(r=>r.status),['submitted','submitted','received','missing']);
 assert.deepEqual(saved,before);
});
test('unuploaded types, out-of-scope dates, future, experience and university exams are not missing',()=>{
 const source={absence:{...imports().absence,start:'2026-10-12',end:'2026-10-16'}};
 assert.equal(compareParentReports([record('2026-10-10'),record('2026-10-14','조퇴'),record('2026-10-17'),record('2026-10-14','결석',{category:'experience'}),record('2026-10-14','결석',{id:'exam-30801-2026-10-14'})],source,'2026-10-16').items.length,0);
});
test('student ID, name and kind must match; returned reports remain attention items',()=>{
 const source=imports();
 assert.equal(compareParentReports([record('2026-10-12','결석',{studentName:'다른이름'})],source,'2026-10-16').items[0].status,'check');
 assert.equal(compareParentReports([record('2026-10-12','결석',{studentId:'30802'})],source,'2026-10-16').items[0].status,'missing');
 source.absence.rows[0].status='반려';
 assert.equal(compareParentReports([record('2026-10-12')],source,'2026-10-16').items[0].status,'check');
});
test('duplicate app records are one student/date/type; rejected file content is not silently skipped',()=>{
 const report=compareParentReports([record('2026-10-12'),record('2026-10-12')],imports(),'2026-10-16');assert.equal(report.items.length,1);
 assert.throws(()=>parseReportTable([absence[0],[...absence[1].slice(0,5),0,...absence[1].slice(6)]]),/번호/);
 assert.throws(()=>normalizeReportImports({absence:{...imports().absence,start:'2026-10-31',end:'2026-10-01'}}),/조회기간/);
});
test('cell reader handles blank merged headings, shared strings, rich inline strings and entities',()=>{
 const xml='<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><r><t>가&amp;</t></r><r><t>나</t></r></is></c><c r="D1"><v>13</v></c></row></sheetData></worksheet>';
 const row=worksheetRows(xml,['진행상태'])[0];assert.equal(row[0],'진행상태');assert.equal(row[1],undefined);assert.equal(row[2],'가&나');assert.equal(row[3],'13');
});
test('invalid workbook is rejected before reading XML',async()=>{await assert.rejects(readReportWorkbook(new ArrayBuffer(50)),/xlsx/);});
test('Monday absence is due next Monday; D count excludes weekends and absence day',()=>{
 assert.deepEqual(reportDeadline('2026-10-12','2026-10-14'),{dueDate:'2026-10-19',days:3,label:'D-3',overdue:false});
 assert.equal(reportDeadline('2026-10-12','2026-10-19').label,'D-Day');
 assert.equal(reportDeadline('2026-10-12','2026-10-20').label,'D+1');
 assert.equal(reportDeadline('2026-10-12','2026-10-17').label,'D-1');
 assert.equal(reportDeadline('2026-10-16','2026-10-16').dueDate,'2026-10-23');
 assert.equal(reportDeadline('2026-10-16','2026-10-24').label,'기한 지남');
 assert.equal(reportDeadline('2026-12-28','2026-12-29').dueDate,'2027-01-04');
});

test('late and early-leave missing reports have the same weekday countdown; disease lateness stays visible while practical records are excluded',()=>{
 const source=imports();
 const report=compareParentReports([record('2026-10-15','지각',{reasonType:'질병',reason:'감기'}),record('2026-10-15','조퇴'),record('2026-10-15','결과'),record('2026-10-16','조퇴',{reasonType:'미인정',reason:'대입실기준비'}),record('2026-10-16','조퇴',{note:'[예체능 미인정 조퇴] 기간 입력'})],source,'2026-10-16');
 assert.equal(report.items.length,3);
 assert.ok(report.items.every(row=>row.deadline.label==='D-4'&&row.deadline.dueDate==='2026-10-22'));
});

test('all unexcused attendance types are excluded, including unmatched reports for the same student',()=>{
 const source=imports();
 const excluded=['결석','지각','조퇴','결과'].map(kind=>record('2026-10-14',kind,{reasonType:'미인정',reason:'늦잠'}));
 const result=compareParentReports([...excluded,record('2026-10-15','결석',{reasonType:'질병'})],source,'2026-10-16');
 assert.equal(result.items.length,1);assert.equal(result.items[0].date,'2026-10-15');
 assert.equal(result.unmatched.filter(row=>row.kind==='지각').length,0);
 const table=structuredClone(partial);table[1][9]='미인정';
 assert.equal(parseReportTable(table).snapshot.rows[0].reasonType,'미인정');
 const imported={partial:parseReportTable(table).snapshot};
 assert.equal(compareParentReports([record('2026-10-15','지각',{reasonType:'질병'})],imported,'2026-10-16').unmatched.length,0);
});

test('reports identify students with no app history and missing dates in a partly recorded absence range',()=>{
 const source=imports();
 const empty=compareParentReports([],source,'2026-10-16');
 assert.equal(empty.unmatched.length,2);
 assert.deepEqual(empty.unmatched.find(r=>r.kind==='결석').missingDates,['2026-10-12','2026-10-13']);
 const partly=compareParentReports([record('2026-10-12')],source,'2026-10-16');
 assert.deepEqual(partly.unmatched.find(r=>r.kind==='결석').missingDates,['2026-10-13']);
 const complete=compareParentReports([record('2026-10-12'),record('2026-10-13'),record('2026-10-14','지각')],source,'2026-10-16');
 assert.equal(complete.unmatched.length,0);
 source.absence.rows[0].status='취소';
 assert.equal(compareParentReports([],source,'2026-10-16').unmatched.length,1);
});
