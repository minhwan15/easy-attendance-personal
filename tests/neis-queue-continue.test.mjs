import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../neis-helper/panel.js',import.meta.url),'utf8');
const fill=source.slice(source.indexOf('async function fillCurrentGrid(){'),source.indexOf('async function fillReport(){'));
const advance=source.slice(source.indexOf('async function advanceAfterSave('),source.indexOf("$('retry-pending').addEventListener"));
test('each queued date is tried, failed ones retried twice automatically, then left as 미입력',async()=>{
 const rows=Array.from({length:10},(_,i)=>({queueId:String(i),studentName:'가상학생'+i,date:'2026-10-'+String(i+12)})),attempts=[],progress={},elements={};
 const ctx={rows,progress,current:0,busy:false,stopRequested:false,autoRetries:{},setTimeout:fn=>fn(),transferId:'same',row:()=>rows[ctx.current],completed:r=>progress[r.queueId]?.saved===true,attendancePlan:()=>({}),activeNeisTab:async()=>({id:1}),persist:async()=>{},updateProgress(){},updateButtons(){},render(){},status(){},$:id=>elements[id]??(elements[id]={}),chrome:{scripting:{executeScript:async()=>{}},tabs:{sendMessage:async(id,msg)=>{attempts.push(msg.row.queueId);if(msg.row.queueId==='2')throw Error('날짜 갱신 실패');if(msg.row.queueId==='6')return {ok:false,error:'학생 입력 실패'};return {ok:true,saved:true,fields:[],message:'완료'};}}}};
 vm.createContext(ctx);vm.runInContext(fill+'\n'+advance,ctx);await ctx.fillCurrentGrid();assert.deepEqual(attempts,rows.flatMap(r=>['2','6'].includes(r.queueId)?[r.queueId,r.queueId,r.queueId]:[r.queueId]));assert.equal(Object.values(progress).filter(p=>p.saved).length,8);assert.match(progress['2'].skipError,/날짜/);assert.match(progress['6'].skipError,/학생/);assert.equal(progress['2'].autoVerified,false);
});
