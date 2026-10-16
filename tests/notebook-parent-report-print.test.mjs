import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parentReportPrintHtml} from '../public/src/notebook-parent-report-print.js';
const item=(id,date='2026-10-15',due='2026-10-22')=>({studentId:String(id),studentName:'학생 '+id,status:'missing',date,kind:'지각',deadline:{label:'D-4',dueDate:due}});
test('print groups one line per student and retains earliest deadline with extra count',()=>{
 const html=parentReportPrintHtml([item(30801),item(30801,'2026-10-14','2026-10-21'),{...item(30802),status:'received'}],{},'2026-10-16');
 assert.match(html,/1명 \/ 2건/);assert.match(html,/10\/21까지/);assert.match(html,/외 1건/);assert.doesNotMatch(html,/30802/);
});
test('large class uses one fixed A4 vector with two columns, escapes names, and retains every student',()=>{
 const rows=Array.from({length:40},(_,n)=>item(30801+n));rows[0].studentName='<script>김</script>';
 const html=parentReportPrintHtml(rows,{},'2026-10-16');
 assert.equal((html.match(/<svg /g)||[]).length,1);assert.match(html,/width="190mm" height="270mm"/);
 assert.match(html,/40명 \/ 40건/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 for(const row of rows)assert.ok(html.includes(row.studentId));
});
test('report viewer does not save uploads or load stored imports',async()=>{
 const ui=await readFile(new URL('../public/src/notebook-parent-reports-ui.js',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/data-pr-save|await save\(|localStorage|sessionStorage/);
 assert.match(ui,/let draft=\{\}/);
 const app=await readFile(new URL('../public/src/notebook-app.js',import.meta.url),'utf8');
 assert.doesNotMatch(app,/save-report-imports/);
});
