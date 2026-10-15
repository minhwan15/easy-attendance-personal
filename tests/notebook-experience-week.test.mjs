import test from 'node:test';import assert from 'node:assert/strict';
import {schoolWeek,weeklyExperience} from '../public/src/notebook-experience-week.js';
import {emptyRecord,normalizeRecord} from '../public/src/notebook-model.js';
const record=()=>normalizeRecord({...emptyRecord(),id:'test',category:'experience',studentId:'30801',studentName:'학생',startDate:'2026-10-09',endDate:'2026-10-19',attendanceDates:['2026-10-09','2026-10-12','2026-10-13','2026-10-14','2026-10-19'],attendanceType:'결석',reasonType:'출석인정',reason:'교외체험학습',reviewStatus:'reviewed',applicationStatus:'received',approvalStatus:'approved',neisConfirmedDates:['2026-10-12']});
test('week spans month/year correctly',()=>assert.deepEqual(schoolWeek('2027-01-01'),{start:'2026-12-28',end:'2027-01-01'}));
test('send only this week pending dates, retain completed and blocked exclusions',()=>{const r=weeklyExperience([record()],'2026-10-15',['2026-10-14']);assert.deepEqual(r.datesByRecord.test,['2026-10-13']);assert.equal(r.excluded.length,2);assert.equal(r.students,1);});
test('pending school approval does not block prepared applications',()=>{const b={...record(),approvalStatus:'pending'};assert.equal(weeklyExperience([b],'2026-10-15').days,2);});
test('cancelled, missing application and duplicates cannot be sent',()=>{const a=record();assert.equal(weeklyExperience([{...a,approvalStatus:'cancelled'}],'2026-10-15').days,0);assert.equal(weeklyExperience([{...a,applicationStatus:'missing'}],'2026-10-15').days,0);assert.equal(weeklyExperience([a,{...a,id:'second'}],'2026-10-15').days,0);});
