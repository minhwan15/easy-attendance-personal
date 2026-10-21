import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { attendancePlan } from '../neis-helper/attendance-plan.js';
const source=readFileSync(new URL('../neis-helper/grid.js',import.meta.url),'utf8');
const base={studentId:'30801',studentName:'가상학생',classNumber:'8',number:'1',date:'2026-10-12',attendanceType:'지각',reasonType:'질병',reason:'가상 사유',periods:'조회 · 1~3교시'};
function fixture({row=base,wrongDate=false,wrongName=false,existing=false,brokenBoundary=false,reverseCells=false,dateInput=false,dateRefresh=true,calendarMonth=null,calendarDuplicate=false,calendarBroken=false,calendarClosed=false,emptyStart=false,queryRefresh=true,queryWrongClass=false,searchDuplicate=false,dateReadOnly=false,autoSave=false,saveAck=true,saveConfirm=false,noChanges=false,saveNotice=false,saveRejected=false,actualLessonCount=null,markSymbol='/',neisName=null}={}) {
  const all=[],clicks=[];let listener,popupOpen=false,fields,studentSelected=false,pickerRoot,selectedDate=row.date;
  class Node {
    constructor(role='',content='',parent=null,left=0,width=90){this.ownerDocument=parent?.ownerDocument;this.className='';this.attrs={};this.role=role;this.content=content;this.parentElement=parent;this.children=[];this.isConnected=true;this.left=left;this.width=width;parent?.children.push(this);all.push(this);}
    get textContent(){return this.content+this.children.map(x=>x.textContent).join('');}
    getClientRects(){for(let n=this;n;n=n.parentElement)if(!n.isConnected)return [];return [{}];}
    getBoundingClientRect(){return {left:this.left,right:this.left+this.width,width:this.width,top:0,height:30};}
    getAttribute(key){return key==='role'?this.role:this.attrs[key]??null;}
    closest(selector){for(let n=this;n;n=n.parentElement){if(selector==='[role="row"]'&&n.role==='row')return n;}return null;}
    querySelectorAll(selector){const result=[];const visit=n=>{for(const c of n.children){result.push(c);visit(c);}};visit(this);return result.filter(n=>selector==='*'||selector===`[role="${n.role}"]`||selector==='[role="button"],button'&&n.role==='button'||selector==='.cl-text'&&n.kind==='text'||selector==='.cl-control'&&n.kind==='control'||selector==='input'&&n.kind==='input'||selector.startsWith('.cl-calendar')&&n.className.split(' ').includes(selector.slice(1)));}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    dispatchEvent(){return true;}
    click(){clicks.push(this.label);this.onClick?.();}
  }
  const body=new Node(),caption=new Node('',`3학년 8반 ${wrongDate?'2026.10.13.':row.date.replaceAll('-','.')+'.'} (월) Total 33`,body),root=new Node('', '',body),head=new Node('row','',root);
  const labels=['번호','성명','마감','조회',...Array.from({length:7},(_,i)=>`${i+1}교시`),'종례','사유'];
  labels.forEach((label,i)=>new Node('columnheader',label,head,i*100));
  if(actualLessonCount===6){const extra=head.children.find(x=>x.content==='7교시');if(extra)extra.isConnected=false;}
  const maps=[];
  for(let student=0;student<2;student++) {
    const node=new Node('row','',root),map=new Map();
    // Observed body has fourteen cells despite thirteen named headers.
    new Node('gridcell','',node,-120,80);
    labels.forEach((label,i)=>{const cell=new Node('gridcell','',node,i*100),control=new Node('', '',cell);control.kind='control';control.label=label;const value=new Node('',label==='번호'?String(student+1):label==='성명'?(student?'다른학생':wrongName?'이름불일치':neisName??row.studentName):'',control);value.kind='text';value.label=label;map.set(label,{cell,control,value});});
    if(reverseCells)node.children.reverse();
    maps.push(map);
  }
  const wanted=maps[0];
  function activate(date){caption.isConnected=true;caption.content=`3학년 ${queryWrongClass?'7':'8'}반 ${date.replaceAll('-','.')}. Total 33`;for(const m of maps)m.get('성명').cell.parentElement.isConnected=true;for(const n of head.children)n.isConnected=true;}
  if(emptyStart){caption.isConnected=false;for(const m of maps)m.get('성명').cell.parentElement.isConnected=false;for(const n of head.children)if(/^[1-7]교시$/.test(n.content))n.isConnected=false;const search=new Node('button','조회',body);search.label='조회';search.onClick=()=>{if(queryRefresh)activate(selectedDate);};if(searchDuplicate){const other=new Node('button','조회',body);other.label='다른조회';}}
  if(existing)wanted.get('1교시').value.content='/';
  wanted.get('성명').control.onClick=()=>{studentSelected=true;};
  wanted.get('마감').control.onClick=()=>{if(studentSelected)popupOpen=true;};
  for(const label of labels.filter(x=>/^(조회|[1-7]교시|종례)$/.test(x)))wanted.get(label).value.onClick=()=>{
    if(brokenBoundary)return;
    const plan=attendancePlan(actualLessonCount?{...row,lessonCount:actualLessonCount,periods:`1~${actualLessonCount}교시 · 종례`}:row);for(const x of plan.marks)wanted.get(x).value.content=markSymbol;
  };
  const apply=new Node('button','적용',body);apply.label='적용';apply.onClick=()=>{
    popupOpen=false;wanted.get('마감').value.content=fields.reasonType+fields.attendanceType;wanted.get('사유').value.content=fields.reason;
    if(row.attendanceType==='결석')for(const x of attendancePlan(row).marks)wanted.get(x).value.content=markSymbol;
  };
  if(calendarMonth) {
    const picker=new Node('', '',body);pickerRoot=picker;picker.className='cl-calendar-field';picker.isConnected=!calendarClosed;
    const month=new Node('button','',picker);month.className='cl-calendar-header-text';
    const prev=new Node('button','',picker);prev.className='cl-calendar-header-prev';prev.attrs['aria-label']='이전달';prev.label='이전달';
    const next=new Node('button','',picker);next.className='cl-calendar-header-next';next.attrs['aria-label']='다음달';next.label='다음달';
    let serial=Number(calendarMonth.slice(0,4))*12+Number(calendarMonth.slice(5))-1,days=[];
    function render() {
      for(const n of days){n.isConnected=false;picker.children.splice(picker.children.indexOf(n),1);}days=[];
      const y=Math.floor(serial/12),m=serial%12+1;month.content=`${y} ${m}월`;
      for(let day=1;day<=new Date(Date.UTC(y,m,0)).getUTCDate();day++) {
        const n=new Node('button',String(day),picker);n.className='cl-calendar-content-day';n.attrs['aria-label']=`선택됨: ${y}년 ${m}월 ${day}일`;n.label=`날짜:${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        n.onClick=()=>{selectedDate=`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;if(dateRefresh)activate(selectedDate);};days.push(n);
      }
      const other=new Node('button','12',picker);other.className='cl-calendar-content-day cl-other-month';other.attrs['aria-label']=`${y}년 ${m}월 12일`;other.label='다른달';days.push(other);
      if(calendarDuplicate){const duplicate=new Node('button','12',picker);duplicate.className='cl-calendar-content-day';duplicate.attrs['aria-label']=`${y}년 ${m}월 12일`;days.push(duplicate);}
    }
    prev.onClick=()=>{if(!calendarBroken){serial--;render();}};next.onClick=()=>{if(!calendarBroken){serial++;render();}};render();
  }
  class Input extends Node {set value(v){this.stored=v;}get value(){return this.stored;}dispatchEvent(e){if(e.type==='change'){selectedDate=this.value.replaceAll('.','-').replace(/-$/,'');if(dateRefresh)activate(selectedDate);}return true;}}
  if(dateInput){const wrap=new Node('', '',body),input=new Input('', '',wrap);input.kind='input';input.value='2026.10.13';input.readOnly=dateReadOnly;if(calendarClosed){const button=new Node('button','',wrap);button.className='cl-dateinput-button cl-right';button.attrs['aria-label']='달력으로 날짜 선택';button.label='달력으로 날짜 선택';const spin=new Node('', '',wrap);spin.className='cl-dateinput-spinbuttons';for(const label of ['1 증가','1 감소']){const n=new Node('button','',spin);n.attrs['aria-label']=label;n.label=label;}button.onClick=()=>{pickerRoot.isConnected=true;};}}
  if(autoSave){const save=new Node('button','저장',body);save.label='저장';save.onClick=()=>{if(saveRejected){const box=new Node('', '',body);new Node('', '출결마감구분만 존재하거나, 교시만 체크되어있는 학생이 존재합니다. 확인 후 다시 작업해 주시기 바랍니다.',box);const yes=new Node('button','확인',box);yes.label='미입력확인';yes.onClick=()=>{box.isConnected=false;};}else if(noChanges){const box=new Node('', '',body);new Node('', '변경된 내용이 없습니다.',box);const yes=new Node('button','확인',box);yes.label='변경없음확인';yes.onClick=()=>{box.isConnected=false;};}else if(saveConfirm){const box=new Node('', '',body);new Node('', '저장하시겠습니까?',box);const yes=new Node('button','확인',box);yes.label='저장확인';const no=new Node('button','취소',box);no.label='취소';yes.onClick=()=>{box.isConnected=false;if(saveAck)new Node('', '저장되었습니다.',body);};}else if(saveNotice){const box=new Node('', '',body);new Node('', '저장했습니다.',box);const yes=new Node('button','확인',box);yes.label='저장완료확인';yes.onClick=()=>{box.isConnected=false;};}else if(saveAck)new Node('', '저장되었습니다.',body);};}
  const doc={body,defaultView:{getComputedStyle:()=>({visibility:'visible'}),HTMLInputElement:Input,Event:class {constructor(type,options){this.type=type;Object.assign(this,options);}},MouseEvent:class {constructor(type,options){this.type=type;Object.assign(this,options);}}},querySelectorAll:s=>body.querySelectorAll(s)};
  for(const n of all)n.ownerDocument=doc;
  const popupApi={findPopup:()=>{if(!popupOpen)throw Error('not open');return {apply};},fill:async (data,replace)=>{if(wanted.get('사유').value.content&&!replace)throw Error('replace required');fields=data;return {ok:true};}};
  const ctx=vm.createContext({document:doc,location:{protocol:'https:',hostname:'test.neis.go.kr',href:'https://test.neis.go.kr/page'},chrome:{runtime:{id:'extension-test',onMessage:{addListener:fn=>listener=fn}}},__teacherNeisPopup:popupApi,setTimeout,Date});vm.runInContext(source,ctx);
  return {clicks,wanted,maps,ctx,call:()=>new Promise(resolve=>listener({type:'TEACHER_NOTEBOOK_GRID',command:'fill',row,plan:attendancePlan(row),autoSave},{id:'extension-test'},resolve))};
}
test('finds the matching student despite an extra cell and reversed DOM order; late boundary is inclusive',async()=>{
  const f=fixture({reverseCells:true});const r=await f.call();assert.equal(r.ok,true,r.error);assert.deepEqual(f.clicks,['성명','마감','적용','3교시']);for(const label of ['조회','1교시','2교시','3교시'])assert.equal(f.wanted.get(label).value.content,'/');assert.equal(f.wanted.get('4교시').value.content,'');assert.equal(f.maps[1].get('마감').value.content,'');assert.equal(f.clicks.includes('저장'),false);
});
test('early leave runs one boundary click through dismissal, including six-lesson weekdays',async()=>{
  for(const date of ['2026-10-12','2026-10-13']){const row={...base,date,attendanceType:'조퇴',periods:date.endsWith('12')?'4~7교시 · 종례':'4~6교시 · 종례'};const f=fixture({row});const r=await f.call();assert.equal(r.ok,true,r.error);assert.deepEqual(f.clicks,['성명','마감','적용','4교시']);assert.equal(f.wanted.get('종례').value.content,'/');assert.equal(f.wanted.get('3교시').value.content,'');if(date.endsWith('13'))assert.equal(f.wanted.get('7교시').value.content,'');}
});
test('absence relies on Apply marking the whole day and repeated execution does not toggle it',async()=>{
  const f=fixture({row:{...base,attendanceType:'결석',reasonType:'출석인정',periods:''}});assert.equal((await f.call()).ok,true);assert.deepEqual(f.clicks,['성명','마감','적용']);assert.equal((await f.call()).ok,true);assert.deepEqual(f.clicks,['성명','마감','적용']);
});
test('mismatched date, student identity prevent opening the dialog',async()=>{
  for(const options of [{wrongDate:true},{wrongName:true}]){const f=fixture(options);const r=await f.call();assert.equal(r.ok,false);assert.deepEqual(f.clicks,[]);}
});
test('missing mark acknowledgement reports partial application and never a completed save',async()=>{
  const f=fixture({brokenBoundary:true});const r=await f.call();assert.equal(r.ok,false);assert.match(r.error,/표시 확인/);assert.match(r.error,/남아 있을 수/);assert.deepEqual(f.clicks,['성명','마감','적용','3교시']);
});

test('date field changes refresh the class/date caption before student selection without a Search click',async()=>{const f=fixture({wrongDate:true,dateInput:true});const r=await f.call();assert.equal(r.ok,true,r.error);assert.deepEqual(f.clicks,['성명','마감','적용','3교시']);});
test('a date change without table refresh never selects or edits a student',async()=>{const f=fixture({wrongDate:true,dateInput:true,dateRefresh:false});const r=await f.call();assert.equal(r.ok,false);assert.match(r.error,/갱신/);assert.deepEqual(f.clicks,[]);});

test('calendar clicks full date label before selecting student, excluding other-month duplicate numbers',async()=>{
  const f=fixture({wrongDate:true,dateInput:true,calendarMonth:'2026-10'});const r=await f.call();assert.equal(r.ok,true,r.error);assert.deepEqual(f.clicks,['날짜:2026-10-12','성명','마감','적용','3교시']);
});
test('calendar navigates months across year boundaries and forward before clicking exact date',async()=>{
  for(const [start,arrows] of [['2027-01',['이전달','이전달','이전달']],['2026-08',['다음달','다음달']]]) {
    const f=fixture({wrongDate:true,calendarMonth:start});const r=await f.call();assert.equal(r.ok,true,r.error);assert.deepEqual(f.clicks,[...arrows,'날짜:2026-10-12','성명','마감','적용','3교시']);
  }
});
test('calendar ambiguity, excessive navigation, failed navigation and missing table refresh stop before student edits',async()=>{
  for(const options of [{calendarDuplicate:true},{calendarMonth:'2020-01'},{calendarMonth:'2026-09',calendarBroken:true},{dateRefresh:false}]) {
    const f=fixture({wrongDate:true,calendarMonth:'2026-10',...options});const r=await f.call();assert.equal(r.ok,false);assert.equal(f.clicks.includes('성명'),false);assert.equal(f.clicks.includes('마감'),false);
  }
});

test('uniquely labelled adjacent calendar button opens the picker before date and student clicks',async()=>{
  const f=fixture({wrongDate:true,dateInput:true,calendarMonth:'2026-11',calendarClosed:true});const r=await f.call();assert.equal(r.ok,true,r.error);assert.deepEqual(f.clicks,['달력으로 날짜 선택','이전달','날짜:2026-10-12','성명','마감','적용','3교시']);
});

test('empty initial grid chooses date before querying and selecting the correct student',async()=>{
  const f=fixture({emptyStart:true,dateInput:true,dateRefresh:false,calendarMonth:'2026-10'});const r=await f.call();assert.equal(r.ok,true,r.error);assert.deepEqual(f.clicks,['날짜:2026-10-12','조회','성명','마감','적용','3교시']);
});
test('empty grid with automatic date refresh never triggers an additional query',async()=>{
  const f=fixture({emptyStart:true,dateInput:true,calendarMonth:'2026-10'});const r=await f.call();assert.equal(r.ok,true,r.error);assert.deepEqual(f.clicks,['날짜:2026-10-12','성명','마감','적용','3교시']);
});
test('empty initial grid can change date input without an open calendar before one query',async()=>{
  const f=fixture({emptyStart:true,dateInput:true,dateRefresh:false});const r=await f.call();assert.equal(r.ok,true,r.error);assert.deepEqual(f.clicks,['조회','성명','마감','적용','3교시']);
});
test('wrong class after initial query or ambiguous query controls prevent student edits',async()=>{
  for(const options of [{queryWrongClass:true},{searchDuplicate:true}]) {
    const f=fixture({emptyStart:true,dateInput:true,dateRefresh:false,...options});const r=await f.call();assert.equal(r.ok,false);assert.equal(f.clicks.includes('성명'),false);assert.equal(f.clicks.includes('마감'),false);
  }
});

test('observed calendar opener supports read-only date inputs and never clicks spin controls',async()=>{
  const f=fixture({wrongDate:true,dateInput:true,dateReadOnly:true,calendarMonth:'2026-10',calendarClosed:true});const r=await f.call();assert.equal(r.ok,true,r.error);assert.deepEqual(f.clicks,['달력으로 날짜 선택','날짜:2026-10-12','성명','마감','적용','3교시']);
});

test('existing attendance is replaced for the matching student without editing another row',async()=>{const f=fixture({existing:true});f.wanted.get('마감').value.content='기타지각';f.wanted.get('사유').value.content='기존 사유';const r=await f.call();assert.equal(r.ok,true,r.error);assert.equal(f.wanted.get('사유').value.content,base.reason);assert.equal(f.wanted.get('마감').value.content,'질병지각');assert.equal(f.maps[1].get('사유').value.content,'');});

test('automatic save only reports saved after a new success acknowledgement and matching row',async()=>{const f=fixture({autoSave:true});const r=await f.call();assert.equal(r.ok,true,r.error);assert.equal(r.saved,true);assert.equal(f.clicks.at(-1),'저장');assert.equal(f.maps[1].get('사유').value.content,'');});

test('a save click without a success acknowledgement never reports saved',async()=>{const f=fixture({autoSave:true,saveAck:false});const r=await f.call();assert.equal(r.ok,false);assert.equal(r.saved,undefined);assert.match(r.error,/성공 메시지/);assert.equal(f.clicks.filter(x=>x==='저장').length,1);});

test('observed save confirmation is accepted once before success and never clicks cancel',async()=>{const f=fixture({autoSave:true,saveConfirm:true});const r=await f.call();assert.equal(r.ok,true,r.error);assert.equal(r.saved,true);assert.deepEqual(f.clicks.slice(-2),['저장','저장확인']);assert.equal(f.clicks.includes('취소'),false);});

test('unchanged attendance acknowledgement is accepted when the row exactly matches the record',async()=>{const f=fixture({autoSave:true,noChanges:true});const r=await f.call();assert.equal(r.ok,true,r.error);assert.equal(r.saved,true);assert.deepEqual(f.clicks.slice(-2),['저장','변경없음확인']);});

test('observed saved notice is acknowledged before returning completion',async()=>{const f=fixture({autoSave:true,saveNotice:true});const r=await f.call();assert.equal(r.ok,true,r.error);assert.equal(r.saved,true);assert.deepEqual(f.clicks.slice(-2),['저장','저장완료확인']);});

test('observed incomplete attendance save warning is acknowledged but never marked saved',async()=>{const f=fixture({autoSave:true,saveRejected:true});const r=await f.call();assert.equal(r.ok,true,r.error);assert.equal(r.saved,false);assert.equal(r.skipped,true);assert.deepEqual(f.clicks.slice(-2),['저장','미입력확인']);});

test('actual lesson override reaches final grid validation and saves on changed weekdays',async()=>{
 for(const [date,lessonCount]of [['2026-10-13',7],['2026-10-16',6]]){
 const row={...base,date,lessonCount,attendanceType:'조퇴',periods:`5~${lessonCount}교시 · 종례`};
 const f=fixture({row,autoSave:true});const result=await f.call();assert.equal(result.ok,true,result.error);assert.equal(result.saved,true);assert.equal(f.wanted.get('종례').value.content,'/');assert.equal(f.wanted.get('7교시').value.content,lessonCount===7?'/':'');
 }
});


test("practical early leave follows actual table through dismissal on changed timetables",async()=>{for(const [date,actualLessonCount]of [["2026-10-13",7],["2026-10-16",6]]){const normal=date.endsWith("13")?6:7;const row={...base,date,attendanceType:"조퇴",reasonType:"미인정",reason:"대입실기준비",periods:`1~${normal}교시 · 종례`};const f=fixture({row,actualLessonCount,autoSave:true}),r=await f.call();assert.equal(r.ok,true,r.error);assert.equal(r.saved,true);assert.equal(f.wanted.get("종례").value.content,"/");assert.equal(f.wanted.get("7교시").value.content,actualLessonCount===7?"/":"");}});

test('출석인정 결석 marked with Ø in NEIS is read as completed, not as an unknown period mark',async()=>{
  for(const markSymbol of ['Ø','ø','∅']){
    const f=fixture({row:{...base,attendanceType:'결석',reasonType:'출석인정',periods:''},markSymbol,autoSave:true});
    const result=await f.call();assert.equal(result.ok,true,markSymbol);assert.equal(result.saved,true,markSymbol);
  }
});
test('NEIS names with a trailing note such as (위탁) or (공동) still match the roster name and number',async()=>{
  for(const neisName of [`${base.studentName}(위탁)`,`${base.studentName} (공동)`]){
    const f=fixture({neisName});const result=await f.call();assert.equal(result.ok,true,neisName);assert.equal(f.clicks[0],'성명');
  }
  const other=fixture({neisName:'다른이름(위탁)'});assert.equal((await other.call()).ok,false);assert.deepEqual(other.clicks,[]);
});
