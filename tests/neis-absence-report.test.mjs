import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../neis-helper/report.js',import.meta.url),'utf8');
const verifySource=source.slice(source.indexOf('  function verify('),source.indexOf('  async function wait('));
const verify=new Function(`const text=e=>String(e?.textContent||'').replace(/\\s+/g,''),visible=()=>true; ${verifySource};return verify;`)();
const row={studentId:'30801',studentName:'곽도연',attendanceType:'결석',date:'2026-10-16'};
function popup({title='결석신고서 상세조회',range='2026.10.16 ~ 2026.10.16',name='곽도연'}={}){
 const nodes=[title,'3학년 8반 1번 '+name,'결석기간',range,'신청일자','2026.10.15'].map(textContent=>({textContent,children:[]}));
 return {box:{textContent:nodes.map(n=>n.textContent).join(' '),querySelectorAll:()=>nodes},periods:[]};
}
test('absence uses title and absence range even when application date differs',()=>assert.doesNotThrow(()=>verify(row,popup())));
test('wrong student, report type and absence date are rejected',()=>{
 assert.throws(()=>verify(row,popup({name:'다른학생'})),/학생/);
 assert.throws(()=>verify(row,popup({title:'지각신고서 상세조회'})),/종류/);
 assert.throws(()=>verify(row,popup({range:'2026.10.15 ~ 2026.10.15'})),/결석기간/);
 assert.throws(()=>verify(row,popup({range:'2026.10.15 ~ 2026.10.16'})),/여러 날/);
});
