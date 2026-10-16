import test from 'node:test';
import assert from 'node:assert/strict';
import {mailmergeRows,mailmergeWorkbook,smsBytes} from '../public/src/notebook-parent-report-mailmerge.js';
import {readReportWorkbook} from '../public/src/notebook-report-xlsx.js';
test('one message per student, pending excluded, duplicates removed, deadlines included without health reasons',()=>{
 const row={studentId:'30801',studentName:'가학생',status:'missing',date:'2026-10-12',kind:'결석',reason:'민감한 사유',deadline:{dueDate:'2026-10-19',overdue:false}};
 const rows=mailmergeRows([row,row,{...row,date:'2026-10-13',kind:'지각'},{...row,studentId:'30802',status:'submitted'}],'2026-10-16');
 assert.equal(rows.length,2);assert.deepEqual(rows[0],['학번','']);assert.equal(rows[1][0],'30801');
 assert.match(rows[1][1],/10\/12 결석/);assert.match(rows[1][1],/10\/13 지각/);assert.match(rows[1][1],/10\/19/);assert.doesNotMatch(rows[1][1],/민감한 사유/);
});
test('xlsx round trips Korean text, identifiers and XML escaping without formulas',async()=>{
 const rows=[['학번','안내문'],['30801','가&나 <학생> "학부모님"'],['30802','=literal']];
 const bytes=mailmergeWorkbook(rows);
 const tables=await readReportWorkbook(bytes.buffer);
 assert.deepEqual(tables[0],rows);
});

test('approved short message is exact and 83 bytes; no prior-submission disclaimer',()=>{
 const rows=mailmergeRows([{studentId:'30801',studentName:'곽도연',status:'missing',date:'2026-10-16',kind:'결석',deadline:{dueDate:'2026-10-23'}}],'2026-10-16');
 assert.equal(rows[1][1],'[출결신고서 누락] 곽도연 10/16 결석. 10/23까지 나이스 학부모서비스에 제출 바랍니다.');
 assert.equal(smsBytes(rows[1][1]),83);assert.doesNotMatch(rows[1][1],/이미|확인되지/);
});
