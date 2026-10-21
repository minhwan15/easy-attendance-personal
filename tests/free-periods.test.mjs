import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolPeriodsForDate, missedPeriods, lessonPeriodNumbers } from '../public/src/school-timetable.js';
import { emptyRecord, toNeisRows } from '../public/src/notebook-model.js';

const times = [['09:00','09:50'],['10:00','10:50'],['11:00','11:50'],['12:00','12:50'],['13:40','14:30'],['14:40','15:30'],['15:40','16:30'],['','']];
globalThis.easyProfile = { timetable: { counts: [0,7,6,6,6,7,0], periods: times.map(([start,end],i)=>({period:i+1,start,end})), free: [[],[],[],[],[2],[],[]] } };
const thursday = '2026-10-22', wednesday = '2026-10-21';

test('공강 periods stay in the day but are not lessons', () => {
  const day = schoolPeriodsForDate(thursday);
  assert.equal(day.length, 6);
  assert.deepEqual(lessonPeriodNumbers(day), [1,3,4,5,6]);
  assert.deepEqual(lessonPeriodNumbers(schoolPeriodsForDate(wednesday)), [1,2,3,4,5,6]);
});

test('late and early leave ranges stay continuous across a 공강 for NEIS', () => {
  assert.equal(missedPeriods({ kind:'late', date:thursday, arrivalTime:'11:10' }).text, '조회 · 1~3교시');
  assert.equal(missedPeriods({ kind:'late', date:thursday, arrivalTime:'10:30' }).text, '조회 · 1교시');
  assert.equal(missedPeriods({ kind:'early', date:thursday, departureTime:'09:55' }).text, '3~6교시 · 종례');
  assert.equal(missedPeriods({ kind:'outing', date:thursday, departureTime:'09:55', returnTime:'11:55' }).text, '3교시');
  assert.equal(missedPeriods({ kind:'early', date:thursday, departureTime:'09:30' }).text, '1~6교시 · 종례');
  assert.equal(missedPeriods({ kind:'outing', date:thursday, departureTime:'09:30', returnTime:'11:30' }).text, '1~3교시');
});

test('absence sent to NEIS lists only real lessons', () => {
  const record = { ...emptyRecord(), id:'r1', category:'attendance', studentId:'30101', studentName:'예시', startDate:thursday, endDate:thursday, attendanceType:'결석', reasonType:'질병', reason:'감기', reviewStatus:'reviewed' };
  const [row] = toNeisRows([record]);
  assert.equal(row.periods, '1, 3~6교시');
  assert.equal(row.lessonCount, 6);
});
