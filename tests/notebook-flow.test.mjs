import test from 'node:test';import assert from 'node:assert/strict';
import {todayAttendance,attendanceStep,nextAttendanceAction} from '../public/src/notebook-flow.js';
import {emptyRecord,normalizeRecord} from '../public/src/notebook-model.js';
const base=normalizeRecord({...emptyRecord(),id:'test',category:'attendance',studentId:'30801',studentName:'학생',startDate:'2026-10-15',endDate:'2026-10-15',attendanceType:'결석',reasonType:'질병',reason:'감기',reviewStatus:'reviewed'});
test('daily overview includes completed records but excludes cancelled experience and other dates',()=>{
 const result=todayAttendance([base,{...base,id:'done',entryStatus:'confirmed'},{...base,id:'tomorrow',startDate:'2026-10-16',endDate:'2026-10-16'},{...base,id:'cancel',category:'experience',approvalStatus:'cancelled',attendanceDates:['2026-10-15']}],'2026-10-15');
 assert.equal(result.counts.결석,2);assert.equal(result.pending,1);
});
test('sending never implies saved completion',()=>{
 assert.equal(attendanceStep(base),'나이스 미입력');
 assert.equal(attendanceStep(base,true),'도우미로 보냄 · 나이스 미입력');
 assert.equal(attendanceStep({...base,entryStatus:'confirmed'},true),'나이스 입력 완료');
 assert.equal(attendanceStep({...base,reviewStatus:'draft'},true),'작성 중');
});
test('correction buttons point to relevant fields',()=>{
 assert.equal(nextAttendanceAction({...base,attendanceType:'지각',note:'[아침 출결 메모]',periods:''}).field,'arrival');
 assert.equal(nextAttendanceAction({...base,category:'experience',applicationStatus:'received',approvalStatus:'pending'}).field,'reason');
 assert.equal(nextAttendanceAction({...base,id:'exam-30801-2026-10-15'}).field,'exam');
 assert.equal(nextAttendanceAction({...base,reason:''}).field,'reason');
});
