import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reportPlan} from '../neis-helper/report-plan.js';
const panel=await readFile(new URL('../neis-helper/panel.js',import.meta.url),'utf8');
const controls=panel.slice(panel.indexOf('function updateButtons()'),panel.indexOf('function render(){'));
const item={queueId:'a',studentId:'30801',studentName:'학생',date:'2026-10-16',attendanceType:'결석',reasonType:'질병',reason:'감기'};
test('absence report does not need missed-period selection and validates date',()=>{
 assert.equal(reportPlan(item).kind,'결석');
 assert.throws(()=>reportPlan({...item,date:'2026-02-30'}),/출결일/);
});
test('completed attendance does not disable report and report count is separate',()=>{
 const exercise=new Function('mode','item','reportPlan',`
 const elements={};const $=id=>elements[id]??=( {querySelectorAll:()=>[]} );
 const document={querySelectorAll:()=>[]},workMode=mode,rows=[item],progress={[item.queueId]:{saved:true,autoVerified:true}},busy=false;
 const row=()=>item,completed=()=>true,attendancePlan=()=>({}),renderList=()=>{};
 ${controls}
 updateButtons();updateProgress();return elements;
 `);
 const report=exercise('report',item,reportPlan);
 assert.equal(report['grid-fill'].disabled,false);
 assert.equal(report.count.textContent,'신고서 대상 1건');
 assert.equal(report['skip-summary'].hidden,true);
 assert.equal(exercise('attendance',item,reportPlan)['grid-fill'].disabled,true);
});
