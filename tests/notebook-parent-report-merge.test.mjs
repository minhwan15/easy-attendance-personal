import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeReportSource,normalizeReportImports,inReportPeriod} from '../public/src/notebook-parent-reports.js';
const src=(start,end,rows,importedAt)=>normalizeReportImports({absence:{name:'x',importedAt,start,end,rows}}).absence;
const row=(id,name,date)=>({studentId:id,studentName:name,kind:'결석',status:'접수',start:date,end:date});
test('a later upload keeps earlier months and only replaces its own period',()=>{
 const oct=src('2026-10-01','2026-10-31',[row('30801','가','2026-10-12')],'2026-11-01T00:00:00Z');
 let merged=mergeReportSource(oct,src('2026-11-01','2026-11-30',[row('30802','나','2026-11-03')],'2026-11-10T00:00:00Z'));
 assert.deepEqual(merged.rows.map(r=>r.studentName).sort(),['가','나']);
 merged=mergeReportSource(merged,src('2026-11-01','2026-11-30',[],'2026-11-12T00:00:00Z'));
 assert.deepEqual(merged.rows.map(r=>r.studentName),['가']);
 assert.equal(merged.importedAt,'2026-11-12T00:00:00Z');
 assert.ok(inReportPeriod(merged,'2026-10-20')&&inReportPeriod(merged,'2026-11-20'));
});
test('separate periods do not cover the gap between them',()=>{
 const merged=normalizeReportImports({absence:mergeReportSource(src('2026-10-01','2026-10-31',[],'a'),src('2027-02-01','2027-02-28',[],'b'))}).absence;
 assert.equal(merged.periods.length,2);assert.equal(inReportPeriod(merged,'2026-12-15'),false);
});
