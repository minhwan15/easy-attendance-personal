import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNeisTransfer} from '../public/src/notebook-neis-preflight.js';
const row=()=>({recordId:'r1',category:'attendance',studentId:'30801',studentName:'예시학생',date:'2026-10-14',attendanceType:'조퇴',reasonType:'기타',periods:'4~6교시, 종례',reason:'개인 사정'});
const payload=rows=>({schemaVersion:1,source:'teacher-notebook',rows});
test('app prepares the existing helper schema and removes unrelated source data',()=>{const source={...row(),attachment:'private',sourceText:'private'};const result=prepareNeisTransfer({...payload([source]),original:'private'});assert.equal(result.schemaVersion,1);assert.equal(result.rows[0].attachment,undefined);assert.equal(result.original,undefined);assert.equal(source.attachment,'private');});
test('app rejects invalid dates and noncontiguous periods before transfer',()=>{assert.throws(()=>prepareNeisTransfer(payload([{...row(),date:'2026-02-30'}])),/출결일/);assert.throws(()=>prepareNeisTransfer(payload([{...row(),periods:'4교시, 종례'}])),/이어지게/);assert.throws(()=>prepareNeisTransfer(payload([{...row(),periods:'7교시, 종례'}])),/범위/);});
test('app catches two records that would overwrite the same student and date',()=>{assert.throws(()=>prepareNeisTransfer(payload([row(),{...row(),recordId:'r2'}])),/겹칩니다/);});
test('Friday seventh period and inclusive late boundary remain supported',()=>{assert.equal(prepareNeisTransfer(payload([{...row(),date:'2026-10-16',periods:'4~7교시, 종례'}])).rows.length,1);assert.equal(prepareNeisTransfer(payload([{...row(),attendanceType:'지각',periods:'조회, 1~3교시'}])).rows.length,1);});
test('unsupported outing stays a manual task and weekends require explicit lessons',()=>{assert.throws(()=>prepareNeisTransfer(payload([{...row(),attendanceType:'결과'}])),/직접 입력/);assert.throws(()=>prepareNeisTransfer(payload([{...row(),date:'2026-10-17'}])),/주말/);assert.equal(prepareNeisTransfer(payload([{...row(),date:'2026-10-17',lessonCount:6}])).rows.length,1);});

test('report purpose survives preparation without changing legacy envelopes',()=>{
 assert.equal(prepareNeisTransfer({...payload([row()]),workMode:'report'}).workMode,'report');
 assert.equal(prepareNeisTransfer(payload([row()])).workMode,undefined);
});

