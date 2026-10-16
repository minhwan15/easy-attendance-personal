import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const script=await readFile(new URL('../neis-helper/report.js',import.meta.url),'utf8');
const fillSource=script.slice(script.indexOf('  async function fill('),script.indexOf('  globalThis.__teacherNeisReport='));
test('absence maps recognized category and uses app reason without a prompt before requesting save',async()=>{
 const exercise=new Function(`return (async()=>{
 let running=false,saved=0;
 class Area {}
 Object.defineProperty(Area.prototype,'value',{set(v){this.content=v},get(){return this.content||''}});
 const area=new Area();Object.assign(area,{maxLength:-1,readOnly:false,dispatchEvent(){},closest(){return null}});
 const p={box:{},area,category:{value:'인정결석'},status:{value:'접수대기'},periods:[]};
 p.d={};area.ownerDocument={defaultView:{HTMLTextAreaElement:Area,Event:class{}}};
 const find=()=>p,verify=()=>{},enabled=()=>true,wait=async check=>{if(!check())throw Error('verification failed')};
 const choose=async(e,value)=>{e.value=value},selected=(e,value)=>e.value===value;
 const saveButtons=()=>[{scrollIntoView(){},click(){saved++}}];
 ${fillSource}
 const row={attendanceType:'결석',reasonType:'출석인정',reason:'앱에서 보낸 사유'};
 const result=await fill(row,{kind:'결석',reasonType:'출석인정',reason:row.reason,status:'접수'});
 return {saved,result,reason:area.value,category:p.category.value,status:p.status.value};
 })()`);
 const result=await exercise();
 assert.equal(result.reason,'앱에서 보낸 사유');
 assert.equal(result.category,'인정결석');
 assert.equal(result.status,'접수');
 assert.equal(result.saved,1);
 assert.equal(result.result.saveRequested,true);
});
test('new queue applies requested report mode and updates the button',async()=>{
 const panel=await readFile(new URL('../neis-helper/panel.js',import.meta.url),'utf8');
 const fn=panel.slice(panel.indexOf('function setWorkMode('),panel.indexOf("for(const button of document.querySelectorAll('[data-work-mode]'))button.addEventListener"));
 const run=new Function('mode',`let workMode='attendance';const els={};const $=id=>els[id]??={};const document={querySelectorAll:()=>[]};const updateProgress=()=>{},updateButtons=()=>{};${fn};setWorkMode(mode);return {workMode,els};`);
 const report=run('report');assert.equal(report.workMode,'report');assert.equal(report.els['grid-fill'].textContent,'열린 신고서 접수 · 저장');
 assert.equal(run(undefined).workMode,'attendance');
 assert.match(panel,/setWorkMode\(saved\?\.workMode\)/);
});

