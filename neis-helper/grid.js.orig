(() => {
  if (globalThis.__teacherNeisGrid) return;
  if (location.protocol!=='https:' || !(location.hostname==='neis.go.kr'||location.hostname.endsWith('.neis.go.kr'))) return;
  const clean=value=>String(value||'').replace(/\s+/g,'');
  const text=node=>clean(node?.textContent);
  const baseName=value=>clean(value).replace(/\([^()]*\)$/,'');
  const visible=node=>Boolean(node?.isConnected&&node.getClientRects().length)&&node.ownerDocument.defaultView.getComputedStyle(node).visibility!=='hidden';
  const enabled=node=>visible(node)&&!node.closest('[inert],[aria-disabled="true"],.cl-disabled');
  const buttons='[role="button"],button';
  let running=false,cancelRequested=false,freeLabels=new Set();
  function checkCancelled(){if(cancelRequested)throw new Error('사용자가 자동입력을 중단했습니다. 현재 학생은 미완료로 남겼습니다.');}
  function documents(d,result=[]) {result.push(d);for(const f of d.querySelectorAll('iframe,frame')){try{if(f.contentDocument)documents(f.contentDocument,result);}catch{}}return result;}
  function identity(row) {
    if(!/^[1-3]\d{4}$/.test(row?.studentId||'')||!clean(row.studentName))throw new Error('학번과 이름이 있는 출결 기록을 선택해 주세요.');
    const id=row.studentId, grade=Number(id[0]), classNumber=Number(id.slice(1,3)), number=Number(id.slice(3));
    if(!classNumber||!number||(row.classNumber&&Number(row.classNumber)!==classNumber)||(row.number&&Number(row.number)!==number))throw new Error('학번과 반·번호가 일치하지 않습니다.');
    const date=String(row.date||'');const parsed=new Date(`${date}T00:00:00Z`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==date)throw new Error('출결 날짜를 확인해 주세요.');
    return {grade,classNumber,number,date,name:clean(row.studentName)};
  }
  function dateCaption(d,id) {
    const prefix=`${id.grade}학년${id.classNumber}반`;
    const [y,m,day]=id.date.split('-').map(Number);
    const datePattern=new RegExp(`${y}[.\\-/]0?${m}[.\\-/]0?${day}(?:[.\\s(]|$)`);
    const found=[...d.querySelectorAll('*')].filter(node=>visible(node)&&String(node.textContent||'').length<=180&&text(node).includes(prefix)&&datePattern.test(String(node.textContent||'')));
    if(!found.length)throw new Error(`나이스에서 ${id.grade}학년 ${id.classNumber}반 ${id.date}를 조회해 주세요.`);
    return found.sort((a,b)=>String(a.textContent).length-String(b.textContent).length)[0];
  }
  function calendar(d) {
    const roots=[...d.querySelectorAll('.cl-calendar-field')].filter(visible);
    if(roots.length>1)throw new Error('달력이 여러 개 열려 있습니다. 일일출결 달력 하나만 열어 주세요.');
    if(!roots.length)return null;
    const root=roots[0],headers=[...root.querySelectorAll('.cl-calendar-header-text')].filter(visible);
    const match=headers.length===1?text(headers[0]).match(/^(\d{4})년?(\d{1,2})월$/):null;
    if(!match||Number(match[2])<1||Number(match[2])>12)throw new Error('달력의 연도와 월을 확인하지 못했습니다.');
    return {root,month:Number(match[1])*12+Number(match[2])-1};
  }
  async function confirmDateTable(d,id,initiallyEmpty=false) {
    const confirmed=()=>{try{dateCaption(d,id);return true;}catch{return false;}};
    try {await waitFor(confirmed,'날짜 선택 후 출결표 갱신을 확인하지 못했습니다.');return;}catch(error) {
      if(!initiallyEmpty||[...d.querySelectorAll('[role="gridcell"]')].some(visible))throw error;
    }
    const search=[...d.querySelectorAll(buttons)].filter(node=>enabled(node)&&text(node)==='조회');
    if(search.length!==1)throw new Error('조회 전 빈 출결표입니다. 나이스의 조회 버튼을 한 번 누른 뒤 다시 시도해 주세요.');
    search[0].click();
    await waitFor(confirmed,'조회 후 반·날짜를 확인하지 못했습니다. 나이스의 학년·반과 출결표를 확인해 주세요.');
  }
  async function pickCalendarDate(d,id,initiallyEmpty=false) {
    let current=calendar(d);if(!current)return false;
    const [year,month,day]=id.date.split('-').map(Number),target=year*12+month-1;
    if(Math.abs(target-current.month)>36)throw new Error('달력 이동 범위가 36개월을 넘습니다. 날짜를 직접 선택해 주세요.');
    while(current.month!==target) {
      checkCancelled();
      const direction=target>current.month?1:-1,label=direction>0?'다음달':'이전달';
      const selector=direction>0?'.cl-calendar-header-next':'.cl-calendar-header-prev';
      const controls=[...current.root.querySelectorAll(selector)].filter(node=>enabled(node)&&node.getAttribute('role')==='button'&&node.getAttribute('aria-label')===label);
      if(controls.length!==1)throw new Error(`${label} 버튼을 정확히 찾지 못했습니다.`);
      const expected=current.month+direction;controls[0].click();
      await waitFor(()=>calendar(d)?.month===expected,'달력의 월 이동을 확인하지 못했습니다.');
      current=calendar(d);
    }
    const pattern=new RegExp(`^(?:선택됨:)?${year}년${month}월${day}일(?:[일월화수목금토]요일)?$`);
    const dates=[...current.root.querySelectorAll('.cl-calendar-content-day')].filter(node=>enabled(node)&&node.getAttribute('role')==='button'&&!String(node.className).split(/\s+/).includes('cl-other-month')&&pattern.test(clean(node.getAttribute('aria-label'))));
    if(dates.length!==1)throw new Error('해당 날짜 칸을 정확히 찾지 못했습니다. 날짜를 직접 선택해 주세요.');
    dates[0].click();
    await confirmDateTable(d,id,initiallyEmpty);
    return true;
  }
  async function openDateCalendar(d,input) {
    // Only use a uniquely labelled calendar button next to the unique date input.
    for(let node=input.parentElement,depth=0;node&&node!==d.body&&depth<3;node=node.parentElement,depth++) {
      if(node.querySelectorAll('input').length!==1)break;
      const controls=[...node.querySelectorAll(buttons)].filter(button=>enabled(button)&&/^(달력|달력열기|달력펼치기|달력으로날짜선택|calendar|opencalendar)$/i.test(clean(button.getAttribute('aria-label')||button.getAttribute('title')||button.textContent)));
      if(controls.length>1)throw new Error('날짜 달력 버튼을 여러 개 찾았습니다. 달력을 직접 열어 주세요.');
      if(controls.length===1){controls[0].click();await waitFor(()=>Boolean(calendar(d)),'날짜 달력이 열리지 않았습니다.');return true;}
    }
    return false;
  }
  async function selectDate(row) {
    const id=identity(row),contexts=[];
    for(const d of documents(document)) {
      const headers=[...d.querySelectorAll('[role="columnheader"]')].filter(visible).map(text);
      if(!['성명','마감','조회','종례','사유'].every(label=>headers.includes(label)))continue;
      const prefix=`${id.grade}학년${id.classNumber}반`;
      const hasClass=[...d.querySelectorAll('*')].some(node=>visible(node)&&String(node.textContent||'').length<=180&&text(node).includes(prefix)&&/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/.test(String(node.textContent||'')));
      const empty=![...d.querySelectorAll('[role="gridcell"]')].some(visible);
      const dates=[...d.querySelectorAll('input')].filter(node=>visible(node)&&/^(?:\d{4})([.\-/])\d{1,2}\1\d{1,2}\.?$/.test(String(node.value||'').trim()));
      // An initial unqueried grid has no class/date caption and only basic headers.
      if(hasClass||(empty&&dates.length===1))contexts.push(d);
    }
    if(contexts.length!==1)throw new Error('나이스에서 해당 반의 일일출결 화면을 열어 주세요.');
    const d=contexts[0];
    const initiallyEmpty=![...d.querySelectorAll('[role="gridcell"]')].some(visible);
    try {dateCaption(d,id);return;}catch{}
    if(await pickCalendarDate(d,id,initiallyEmpty))return;
    const inputs=[...d.querySelectorAll('input')].filter(node=>visible(node)&&!node.disabled&&!node.closest('[inert],[aria-disabled="true"],.cl-disabled')&&/^(?:\d{4})([.\-/])\d{1,2}\1\d{1,2}\.?$/.test(String(node.value||'').trim()));
    if(inputs.length!==1)throw new Error('날짜 입력칸을 정확히 찾지 못했습니다. 나이스에서 날짜를 선택한 뒤 다시 눌러 주세요.');
    const input=inputs[0],original=input.value,view=d.defaultView;
    if(await openDateCalendar(d,input)){await pickCalendarDate(d,id,initiallyEmpty);return;}
    if(input.readOnly)throw new Error('읽기 전용 날짜 칸입니다. 달력 버튼을 확인할 수 없습니다.');
    const separator=original.match(/[.\-/]/)[0];
    const next=id.date.replaceAll('-',separator)+(original.endsWith('.')?'.':'');
    const setter=Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype,'value')?.set;
    if(!setter)throw new Error('날짜 입력 방식을 확인할 수 없습니다. 날짜를 직접 선택해 주세요.');
    setter.call(input,next);
    input.dispatchEvent(new view.Event('input',{bubbles:true}));
    input.dispatchEvent(new view.Event('change',{bubbles:true}));
    input.dispatchEvent(new view.Event('blur',{bubbles:false}));
    // Date changes normally refresh the table. Search is only needed for an empty initial grid.
    await confirmDateTable(d,id,initiallyEmpty);
  }
  function value(cell) {
    const input=cell.querySelector('input,textarea');
    return clean(input?input.value:cell.querySelector('.cl-text')?.textContent??cell.textContent);
  }
  function rowCells(node) {return [...node.querySelectorAll('[role="gridcell"]')].filter(cell=>visible(cell)&&cell.closest('[role="row"]')===node);}
  function mapCells(headers,node) {
    const cells=rowCells(node),map=new Map();
    for(const header of headers) {
      const h=header.getBoundingClientRect(),center=h.left+h.width/2;
      const matches=cells.filter(cell=>{const r=cell.getBoundingClientRect();const c=r.left+r.width/2;return center>r.left&&center<r.right&&c>h.left&&c<h.right;});
      if(matches.length!==1)throw new Error('열 위치를 정확히 대조하지 못했습니다. 표의 좌우 스크롤을 맞추고 다시 눌러 주세요.');
      const label=text(header);
      if(map.has(label))throw new Error('같은 제목의 열이 여러 개 있습니다.');
      map.set(label,matches[0]);
    }
    if(new Set(map.values()).size!==map.size)throw new Error('여러 열이 같은 칸에 겹칩니다. 표 위치를 확인해 주세요.');
    return map;
  }
  function locate(row) {
    const id=identity(row),found=[];let contextError=null;
    for(const d of documents(document)) {
      let caption;try{caption=dateCaption(d,id);}catch(error){contextError=error;continue;}
      for(const head of [...d.querySelectorAll('[role="row"]')].filter(visible)) {
        const headers=[...head.querySelectorAll('[role="columnheader"]')].filter(visible);
        const labels=headers.map(text);
        if(!['번호','성명','마감','조회','1교시','종례','사유'].every(label=>labels.filter(x=>x===label).length===1))continue;
        let root=head.parentElement;
        while(root&&root!==d.body&&!root.querySelector('[role="gridcell"]'))root=root.parentElement;
        if(!root||root===d.body)continue;
        const candidates=[...root.querySelectorAll('[role="row"]')].filter(node=>node!==head&&visible(node)&&rowCells(node).length);
        for(const node of candidates) {
          const map=mapCells(headers,node);
          if(baseName(value(map.get('성명')))!==baseName(id.name)||Number(value(map.get('번호')))!==id.number)continue;
          found.push({d,root,head,headers,node,map,caption,id});
        }
      }
    }
    if(found.length!==1)throw new Error(found.length?'같은 학생 행을 여러 곳에서 찾았습니다. 출결표 하나만 열어 주세요.':contextError?.message||'학생 이름과 번호가 일치하는 행을 찾지 못했습니다. 해당 학생이 보이도록 표를 스크롤해 주세요.');
    return found[0];
  }
  function validatePlan(row,plan) {
    const id=identity(row),day=new Date(`${id.date}T00:00:00Z`).getUTCDay();
    if((!day||day===6)&&![1,2,3,4,5,6,7,8].includes(Number(row.lessonCount)))throw new Error('주말 수업 교시를 먼저 확인해 주세요.');
    const labels=['조회',...Array.from({length:[1,2,3,4,5,6,7,8].includes(Number(row.lessonCount))?Number(row.lessonCount):day===1||day===5?7:6},(_,i)=>`${i+1}교시`),'종례'];
    if(!plan||plan.kind!==row.attendanceType||!Array.isArray(plan.marks)||!['결석','지각','조퇴'].includes(plan.kind))throw new Error('이 출결 종류는 교시 자동입력을 지원하지 않습니다.');
    const index=labels.indexOf(plan.boundary);
    const expected=plan.kind==='결석'?labels:plan.kind==='지각'?labels.slice(0,index+1):labels.slice(index);
    if((plan.kind!=='결석'&&index<0)||expected.length!==plan.marks.length||expected.some((x,i)=>x!==plan.marks[i]))throw new Error('교시 계산 결과를 확인해 주세요.');
    if(!['질병','미인정','기타','출석인정'].includes(row.reasonType)||typeof row.reason!=='string'||!row.reason.trim()||row.reason.length>2000)throw new Error('종류·구분·사유를 확인해 주세요.');
    return labels;
  }
  function state(target) {
    const marks=[],free=[];let unknown=false;
    for(const [label,cell] of target.map)if(/^(조회|[1-8]교시|종례)$/.test(label)){const v=value(cell);if(v==='/'||/^[ØøΦφ∅⌀]$/.test(v))marks.push(label);else if(v==='공강'){free.push(label);freeLabels.add(label);}else if(!['','미마감'].includes(v))unknown=true;}
    return {kind:value(target.map.get('마감')),reason:value(target.map.get('사유')),marks,free,unknown};
  }
  function expectedKind(row) {return [row.reasonType+row.attendanceType,...(row.reasonType==='출석인정'?['인정'+row.attendanceType]:[])];}
  function completed(row,plan,target) {
    const s=state(target),skip=new Set([...freeLabels,...s.free]);
    // 공강 칸은 나이스가 표시하지 않으므로 비교에서 뺍니다.
    const expected=plan.marks.filter(x=>!skip.has(x)),marks=s.marks.filter(x=>!skip.has(x));
    return !s.unknown&&expectedKind(row).includes(s.kind)&&s.reason===clean(row.reason)&&marks.length===expected.length&&expected.every(x=>marks.includes(x));
  }
  async function waitFor(check,message) {const end=Date.now()+6000;while(Date.now()<end){checkCancelled();if(check())return;await new Promise(resolve=>setTimeout(resolve,45));}checkCancelled();throw new Error(message);}
  async function run(row,plan,autoSave=false) {
    if(running)throw new Error('자동입력 중입니다.');running=true;cancelRequested=false;freeLabels=new Set();
    let stage='확인';
    try {
      checkCancelled();validatePlan(row,plan);
      stage='날짜 선택';await selectDate(row);checkCancelled();stage='확인';
      const initial=locate(row), page=location.href;
      if(row.attendanceType==='조퇴'&&row.reasonType==='미인정'&&row.reason==='대입실기준비'){
        const periods=[...initial.map.keys()].filter(label=>/^[1-8]교시$/.test(label)&&enabled(initial.map.get(label))).sort((a,b)=>Number(a[0])-Number(b[0]));
        const labels=['조회',...periods,'종례'];
        if(!initial.map.has('종례')||!periods.length)throw new Error('출결표의 교시·종례를 확인하지 못했습니다.');
        let start=labels.indexOf(plan.boundary);
        if(start<0&&/^[1-8]교시$/.test(plan.boundary)&&Number(plan.boundary[0])>Number(periods.at(-1)[0]))start=labels.length-1;
        if(start<0)throw new Error('조퇴 시작 교시를 출결표에서 확인하지 못했습니다.');
        plan={...plan,boundary:labels[start],marks:labels.slice(start)};
      }

      const again=()=>{if(location.href!==page)throw new Error('나이스 화면이 이동했습니다.');const latest=locate(row);if(latest.root!==initial.root)throw new Error('출결표가 바뀌었습니다.');return latest;};
      for(const label of plan.marks)if(!initial.map.has(label))throw new Error(`${label} 열이 보이지 않습니다.`);
      if(!autoSave&&completed(row,plan,initial))return {ok:true,fields:['attendanceType','reasonType','reason','periods'],message:'같은 내용이 이미 표시되어 있어 다시 클릭하지 않았습니다. 나이스 저장 결과를 확인해 주세요.'};
      const old=state(initial);
      if(old.unknown)throw new Error('알 수 없는 교시 표시가 있습니다. 학생 행을 확인해 주세요.');
      const popupApi=globalThis.__teacherNeisPopup;
      if(!popupApi?.fill||!popupApi?.findPopup)throw new Error('도우미를 업데이트한 뒤 나이스 탭을 새로고침해 주세요.');
      let popupOpen=false;try{popupApi.findPopup();popupOpen=true;}catch{}
      if(popupOpen)throw new Error('열린 출결 창을 닫고 출결표에서 자동입력을 다시 눌러 주세요.');
      checkCancelled();stage='학생 행 선택';
      const nameCell=again().map.get('성명');const selector=nameCell.querySelector('.cl-control')||nameCell;
      if(!enabled(selector))throw new Error('학생 이름 칸을 선택할 수 없습니다.');
      const rect=selector.getBoundingClientRect(),view=selector.ownerDocument.defaultView;
      const mouseOptions={bubbles:true,cancelable:true,view,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,button:0};
      selector.dispatchEvent(new view.MouseEvent('mousedown',{...mouseOptions,buttons:1}));
      selector.dispatchEvent(new view.MouseEvent('mouseup',{...mouseOptions,buttons:0}));
      selector.click();
      await new Promise(resolve=>setTimeout(resolve,250));
      again();
      const cutoff=again().map.get('마감');const opener=cutoff.querySelector('.cl-control')||cutoff;
      if(!enabled(opener))throw new Error('마감 칸을 누를 수 없습니다.');
      checkCancelled();stage='마감 창 열기';opener.click();
      await waitFor(()=>{try{popupApi.findPopup();return true;}catch{return false;}},'마감 창이 열리지 않았습니다.');
      again();stage='종류·구분·사유 입력';
      await popupApi.fill({attendanceType:row.attendanceType,reasonType:row.reasonType,reason:row.reason},true);
      const popup=popupApi.findPopup();again();
      if(!enabled(popup.apply))throw new Error('적용 버튼을 누를 수 없습니다.');
      checkCancelled();stage='적용';popup.apply.click();
      await waitFor(()=>{const t=again();return expectedKind(row).includes(value(t.map.get('마감')))&&value(t.map.get('사유'))===clean(row.reason);},'적용 결과를 확인하지 못했습니다. 학생 행의 마감·사유를 확인해 주세요.');
      if(!completed(row,plan,again())&&plan.boundary) {
        const current=again(),isFree=label=>freeLabels.has(label)||value(current.map.get(label))==='공강';
        // 기준 교시가 공강이면 지각은 앞쪽, 조퇴는 뒤쪽의 가장 가까운 수업 교시를 누릅니다.
        const ordered=plan.kind==='지각'?[...plan.marks].reverse():plan.marks;
        const boundary=isFree(plan.boundary)?ordered.find(label=>!isFree(label)):plan.boundary;
        if(!boundary)throw new Error('빠진 교시가 모두 공강입니다. 나이스 화면을 확인해 주세요.');
        const target=current.map.get(boundary);const clickTarget=target.querySelector('.cl-text')||target.querySelector('.cl-control')||target;
        if(!enabled(clickTarget))throw new Error(`${boundary} 칸을 누를 수 없습니다.`);
        stage='기준 교시 클릭';clickTarget.click();
      }
      stage='표시 확인';await waitFor(()=>completed(row,plan,again()),'교시 표시가 기록과 다릅니다. 나이스의 조회·교시·종례를 확인해 주세요.');
      if(autoSave) {
        stage='나이스 저장';
        const currentTarget=again();
        const saveButtons=[...currentTarget.d.querySelectorAll(buttons)].filter(node=>enabled(node)&&text(node)==='저장');
        if(saveButtons.length!==1)throw new Error('일일출결 저장 버튼을 하나로 찾지 못했습니다.');
        const successText=node=>/^(?:정상적으로)?저장(?:했습니다|되었습니다|하였습니다|완료되었습니다)[.!。]?$/.test(text(node));
        const visibleMessages=()=>[...currentTarget.d.querySelectorAll('*')].filter(node=>visible(node)&&successText(node));
        const previous=new Map(visibleMessages().map(node=>[node,text(node)]));
        checkCancelled();saveButtons[0].click();
        const end=Date.now()+10000;let acknowledged=false,confirmedSave=false;
        function saveConfirmation(noChanges=false,savedMessage=false,failedMessage=false){
          const prompts=[...currentTarget.d.querySelectorAll('*')].filter(node=>visible(node)&&(failedMessage?/^출결마감구분만존재하거나,?교시만체크되어있는학생이존재합니다[.]?확인후다시작업해주시기바랍니다[.]?$/.test(text(node)):savedMessage?successText(node):noChanges?/^변경된내용이없습니다[.!。]?$/.test(text(node)):text(node)==='저장하시겠습니까?'));
          const matches=[];
          for(const prompt of prompts){
            for(let root=prompt,depth=0;root&&depth<7;root=root.parentElement,depth++){
              if(String(root.textContent||'').length>500)break;
              const controls=[...root.querySelectorAll(buttons)].filter(enabled);
              const confirms=controls.filter(node=>text(node)==='확인');
              const cancels=controls.filter(node=>text(node)==='취소');
              if(confirms.length===1&&((noChanges||savedMessage||failedMessage)?cancels.length===0:cancels.length===1)){if(!matches.includes(confirms[0]))matches.push(confirms[0]);break;}
            }
          }
          if(matches.length>1)throw new Error('저장 확인창이 여러 개입니다.');
          return matches[0];
        }
        while(Date.now()<end){
          checkCancelled();
          if(location.href!==page)throw new Error('저장 중 화면이 이동했습니다.');
          const failed=saveConfirmation(false,false,true);
          if(failed){failed.click();return {ok:true,saved:false,skipped:true,fields:[],message:'출결 마감 구분 또는 교시 표시가 불완전하여 저장되지 않았습니다.'};}
          const unchanged=saveConfirmation(true);
          if(unchanged){
            if(!completed(row,plan,locate(row)))throw new Error('변경 없음 알림이지만 학생 출결이 기록과 다릅니다.');
            unchanged.click();acknowledged=true;break;
          }
          if(!confirmedSave){const confirmation=saveConfirmation();if(confirmation){confirmation.click();confirmedSave=true;}}
          if(visibleMessages().some(node=>!previous.has(node)||previous.get(node)!==text(node))){const done=saveConfirmation(false,true);if(done)done.click();acknowledged=true;break;}
          await new Promise(resolve=>setTimeout(resolve,80));
        }
        if(!acknowledged)throw new Error('저장 버튼은 눌렀지만 성공 메시지를 확인하지 못했습니다. 나이스 결과를 확인해 주세요.');
        if(!completed(row,plan,locate(row)))throw new Error('저장 후 학생 출결이 기록과 다릅니다.');
        return {ok:true,saved:true,fields:['attendanceType','reasonType','reason','periods'],message:'나이스 저장 완료'};
      }
      return {ok:true,fields:['attendanceType','reasonType','reason','periods'],message:'입력 완료 · 나이스에서 저장하세요.'};
    } catch(error){throw new Error(`${stage}: ${error.message}${['확인','날짜 선택','학생 행 선택','마감 창 열기'].includes(stage)?'':' 적용한 내용이 남아 있을 수 있습니다. 나이스에서 확인 후 처리해 주세요.'}`);}finally{running=false;}
  }
  globalThis.__teacherNeisGrid={run,locate,validatePlan,selectDate,pickCalendarDate,openDateCalendar};
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||message?.type!=='TEACHER_NOTEBOOK_GRID')return false;
    if(message.command==='cancel'){cancelRequested=true;respond({ok:true});return false;}
    if(message.command!=='fill')return false;
    run(message.row,message.plan,Boolean(message.autoSave)).then(respond).catch(error=>respond({ok:false,error:error.message}));return true;
  });
})();

