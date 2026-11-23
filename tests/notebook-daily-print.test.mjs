import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPrintLabel, dailyPrintRows, dailyPrintHtml } from '../public/src/notebook-daily-print.js';
const att=(id,type,reasonType,reason,extra={})=>({category:'attendance',studentId:id,studentName:'학생'+id.slice(-2),startDate:'2026-11-23',attendanceDates:[],attendanceType:type,reasonType,reason,...extra});
test('short labels hide reasons: 생리통 → 인정결석, 질병 → 질병결석',()=>{
  assert.equal(dailyPrintLabel(att('30801','결석','질병','생리통')),'인정결석');
  assert.equal(dailyPrintLabel(att('30802','결석','질병','장염')),'질병결석');
  assert.equal(dailyPrintLabel(att('30803','지각','미인정','늦잠')),'미인정지각');
  assert.equal(dailyPrintLabel({category:'experience',studentId:'30804',approvalStatus:'cancelled'}),'');
});
test('roster rows 1..33 with labels only for that date and no reason text',()=>{
  const students=Array.from({length:30},(_,i)=>({studentId:'308'+String(i+1).padStart(2,'0'),studentName:'이름'+(i+1)}));
  const records=[att('30802','결석','질병','장염'),att('30805','조퇴','질병','두통',{startDate:'2026-11-22'}),{category:'experience',studentId:'30807',startDate:'2026-11-23',endDate:'2026-11-25',approvalStatus:'pending'}];
  const rows=dailyPrintRows(students,records,'2026-11-23');
  assert.equal(rows.length,33);assert.deepEqual(rows[1].labels,['질병결석']);assert.deepEqual(rows[4].labels,[]);assert.deepEqual(rows[6].labels,['체험학습']);
  const html=dailyPrintHtml(students,records,'2026-11-23');
  assert.match(html,/3학년 8반 출결 현황/);assert.doesNotMatch(html,/장염|두통/);
});
