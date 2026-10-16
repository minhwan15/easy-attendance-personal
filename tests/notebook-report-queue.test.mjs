import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyRecord,toNeisRows} from '../public/src/notebook-model.js';
import {queueDateRecords} from '../public/src/notebook-queue-date.js';
import {reportQueueRecords} from '../public/src/notebook-report-queue.js';
const record=()=>({...emptyRecord(),id:'report-example',category:'attendance',studentId:'30801',studentName:'학생',classNumber:8,number:1,startDate:'2026-10-15',endDate:'2026-10-16',attendanceDates:['2026-10-15','2026-10-16'],attendanceType:'결석',reasonType:'질병',reason:'감기',reviewStatus:'reviewed',entryStatus:'confirmed',neisConfirmedDates:['2026-10-15','2026-10-16']});
test('completed attendance can be sent again for a report without changing saved completion',()=>{
 const saved=record(),before=structuredClone(saved);
 assert.equal(queueDateRecords([saved],'2026-10-16').length,0);
 const report=reportQueueRecords([saved],'2026-10-16');
 assert.deepEqual(toNeisRows(report).map(row=>row.date),['2026-10-16']);
 assert.deepEqual(saved,before);
 assert.equal(toNeisRows([saved]).length,0);
});
test('report export respects date, excludes drafts and unrelated categories',()=>{
 assert.equal(reportQueueRecords([record()],'2026-10-17').length,0);
 assert.equal(reportQueueRecords([{...record(),reviewStatus:'draft'}]).length,0);
 assert.equal(reportQueueRecords([{...record(),category:'experience'}]).length,0);
 const partial={...record(),entryStatus:'pending',neisConfirmedDates:['2026-10-15']};
 assert.deepEqual(toNeisRows(reportQueueRecords([partial])).map(row=>row.date),['2026-10-15','2026-10-16']);
});

test('report UI renders a checkbox for completed attendance and hides reset action',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {readiness,withAttendanceMeetings}=await import('../public/src/notebook-model.js');
 const source=await readFile(new URL('../public/src/notebook-app.js',import.meta.url),'utf8');
 const card=source.slice(source.indexOf('function recordCard('),source.indexOf('function workspaceContent('));
 const exercise=new Function('record','reportQueueRecords','readiness','withAttendanceMeetings',`
 const state={neisPurpose:'report',queueDate:'2026-10-16',selected:new Set()};
 const esc=value=>String(value??''),icon=()=>'',categoryIcon=()=>'',rangeLabel=()=>'',isExamRecord=()=>false,isPracticalRecord=()=>false,canIssuePass=()=>false,attendanceStep=()=> '나이스 입력 완료',wasSent=()=>false;
 const labels={attendance:'출결'},sourceLabels={memo:'메모'};
 ${card}
 return recordCard(record,{queue:true});
 `);
 const html=exercise(record(),reportQueueRecords,readiness,withAttendanceMeetings);
 assert.match(html,/data-select="report-example"/);
 assert.doesNotMatch(html,/data-reset-neis=/);
 assert.match(html,/나이스 입력 완료/);
});
