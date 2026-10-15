(() => {
  if(globalThis.__teacherNeisReport)return;
  if(location.protocol!=='https:'||!(location.hostname==='neis.go.kr'||location.hostname.endsWith('.neis.go.kr')))return;
  let running=false;
  const text=e=>String(e?.textContent||'').replace(/\s+/g,'');
  const visible=e=>Boolean(e?.isConnected&&e.getClientRects().length)&&e.ownerDocument.defaultView.getComputedStyle(e).visibility!=='hidden';
  const enabled=e=>visible(e)&&!e.disabled&&!e.closest('[inert],[aria-disabled="true"],.cl-disabled');
  const docs=(d,out=[])=>{out.push(d);for(const f of d.querySelectorAll('iframe,frame')){try{if(f.contentDocument)docs(f.contentDocument,out);}catch{}}return out;};
  const label=e=>String(e.getAttribute('aria-label')||'').split(',')[0].trim();
  function saveButtons(box){
    const leaves=[...box.querySelectorAll('*')].filter(e=>visible(e)&&(text(e)==='저장'||label(e)==='저장'||e.getAttribute('title')==='저장'||e.getAttribute('value')==='저장'));
    return [...new Set(leaves.map(e=>e.closest('.cl-button,button,[role="button"],input[type="button"],input[type="submit"]')).filter(e=>e&&box.contains(e)&&visible(e)))];
  }
  function find(){
    const found=[];
    for(const d of docs(document))for(const area of [...d.querySelectorAll('textarea')].filter(e=>visible(e)&&/사유.*담임.*교사/.test(label(e).replace(/\s+/g,'')))){
      for(let box=area.parentElement;box&&box!==d.body;box=box.parentElement){
        const combos=[...box.querySelectorAll('[role="combobox"]')].filter(visible);
        const category=combos.filter(e=>/신고구분$/.test(label(e))),status=combos.filter(e=>/교육활동처리상태코드$|접수상태$/.test(label(e)));
        const periods=combos.filter(e=>!category.includes(e)&&!status.includes(e));
        const saves=saveButtons(box);
        if(category.length===1&&status.length===1&&periods.length===2&&text(box).includes('신고서상세조회')){
          if(!found.some(x=>x.box===box))found.push({box,area,category:category[0],status:status[0],periods,save:saves.length===1?saves[0]:null,d});break;
        }
      }
    }
    if(found.length!==1){
      const labels=docs(document).flatMap(d=>[...d.querySelectorAll('textarea,[role="combobox"]')].filter(visible).map(label)).filter(Boolean);
      const areas=labels.filter(x=>/사유.*담임.*교사/.test(x.replace(/\s+/g,'')));
      throw new Error(found.length?'상세조회가 여러 개 열려 있습니다. 하나만 열어 주세요.':!areas.length?'담임·교사 사유 입력칸을 찾지 못했습니다. 상세조회에서 사유 칸이 보이도록 내려 주세요.':'상세조회에서 신고구분·접수상태·교시 두 칸·저장 버튼을 함께 찾지 못했습니다. 상세조회 아래 저장 버튼까지 보이도록 내려 주세요.');
    }
    return found[0];
  }
  function verify(row,p){
    const id=String(row.studentId||'');if(!/^[1-3]\d{4}$/.test(id)||!row.studentName)throw new Error('학생 학번·이름을 확인해 주세요.');
    const source=text(p.box),identity=`${Number(id[0])}학년${Number(id.slice(1,3))}반${Number(id.slice(3))}번${String(row.studentName).replace(/\s+/g,'')}`;
    if(!source.includes(identity))throw new Error('열린 신고서의 학생이 앱에서 선택한 학생과 다릅니다.');
    const kinds=[...p.box.querySelectorAll('*')].filter(e=>visible(e)&&!e.children.length&&['지각','조퇴','결과'].includes(text(e)));
    if(kinds.length!==1||text(kinds[0])!==row.attendanceType)throw new Error('열린 신고서의 종류가 앱 기록과 다릅니다.');
    let dateFound=false;
    for(let range=p.periods[0].parentElement;range&&range!==p.box;range=range.parentElement){
      if(!range.contains(p.periods[1]))continue;
      const sources=[text(range),...[...range.querySelectorAll('input')].filter(visible).map(e=>String(e.value||''))];
      const dates=[...new Set(sources.flatMap(source=>source.match(/\d{4}[-.]\d{2}[-.]\d{2}/g)||[]).map(date=>date.replaceAll('.','-')))];
      if(dates.length===1){if(dates[0].replaceAll('.','-')!==row.date)throw new Error('담임·교사 교시 행의 날짜가 앱 기록과 다릅니다.');dateFound=true;break;}
    }
    if(!dateFound)throw new Error('담임·교사 교시 행의 날짜를 확인하지 못했습니다.');
  }
  async function wait(check,message){const end=Date.now()+2500;while(Date.now()<end){if(check())return;await new Promise(r=>setTimeout(r,40));}throw new Error(message);}
  const selected=(e,value)=>text(e)===value||String(e.getAttribute('aria-label')||'').split(',').slice(1).join(',').trim()===value;
  async function choose(e,value,p,same){
    const initial=same();const slot=[initial.category,initial.status,...initial.periods].indexOf(e);
    if(slot<0)throw new Error('선택할 입력칸이 바뀌었습니다.');
    if(selected(e,value))return;
    if(!enabled(e))throw new Error(`${value} 선택칸을 사용할 수 없습니다.`);
    const before=new Set(docs(document).flatMap(d=>[...d.querySelectorAll('*')]).filter(visible));
    let opener=e;
    for(let container=e.parentElement,n=0;container&&n<3;container=container.parentElement,n++){
      const arrows=[...container.querySelectorAll('.cl-combobox-button')].filter(enabled);
      const controls=[...container.querySelectorAll('[role="combobox"]')].filter(visible);
      if(arrows.length===1&&controls.length===1&&controls[0]===e){opener=arrows[0];break;}
    }
    const view=opener.ownerDocument.defaultView;
    // eXBuilder custom controls may open on mousedown rather than click.
    if(view.MouseEvent)for(const type of ['mousedown','mouseup'])opener.dispatchEvent(new view.MouseEvent(type,{bubbles:true,cancelable:true,view,button:0}));
    opener.click();
    let option;
    await wait(()=>{
      const nodes=docs(document).flatMap(d=>[...d.querySelectorAll('*')]);
      const explicit=nodes.filter(x=>enabled(x)&&x.getAttribute('role')==='option'&&text(x)===value);
      const inList=explicit.filter(x=>x.closest('[role="listbox"]'));
      const options=inList.length?inList:explicit.length?explicit:nodes.filter(x=>enabled(x)&&!before.has(x)&&!x.children.length&&text(x)===value);
      if(options.length>1)throw new Error(`${value} 선택 항목이 여러 개입니다.`);
      option=options[0];
      if(!option&&value==='종례'){
        // The framework can render the last option only after its viewport scrolls.
        const allLists=nodes.filter(x=>visible(x)&&x.getAttribute('role')==='listbox');
        const lists=allLists.filter(x=>!allLists.some(other=>other!==x&&other.contains(x)));
        if(lists.length===1){
          const containers=[lists[0],...lists[0].querySelectorAll('*')];
          for(let parent=lists[0].parentElement,n=0;parent&&n<4;parent=parent.parentElement,n++)containers.push(parent);
          for(const container of containers.filter(x=>visible(x)&&x.scrollHeight>x.clientHeight&&x.clientHeight>0)){
            container.scrollTop=container.scrollHeight-container.clientHeight;
            const view=container.ownerDocument.defaultView;
            container.dispatchEvent(new view.Event('scroll',{bubbles:false}));
          }
        }
      }
      return Boolean(option);
    },`${value} 선택 항목을 찾지 못했습니다.`);
    same();
    // NEIS uses a clipped custom viewport, not a native scrolling list.
    // Nested listbox roles belong to one popup; reveal the option with wheel events.
    const viewport=option.closest('.cl-viewport');
    if(viewport&&viewport.getBoundingClientRect&&option.getBoundingClientRect){
      await wait(()=>{
        const bounds=viewport.getBoundingClientRect(),rect=option.getBoundingClientRect();
        if(rect.top>=bounds.top&&rect.bottom<=bounds.bottom)return true;
        const view=viewport.ownerDocument.defaultView;
        if(view.WheelEvent)viewport.dispatchEvent(new view.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:rect.bottom>bounds.bottom?120:-120,deltaMode:0,clientX:bounds.left+10,clientY:bounds.top+10}));
        return false;
      },`${value} 항목을 목록 안으로 스크롤하지 못했습니다.`);
    }
    // Dispatch at the actual text child: the NEIS list delegates using event.target.
    const target=[...option.querySelectorAll('*')].find(x=>visible(x)&&!x.children.length&&text(x)===value)||option;
    target.scrollIntoView?.({block:'nearest'});
    const optionView=target.ownerDocument.defaultView;
    const rect=target.getBoundingClientRect?.();
    const coordinates=rect?{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2}:{};
    if(optionView.MouseEvent)for(const type of ['mousedown','mouseup'])target.dispatchEvent(new optionView.MouseEvent(type,{bubbles:true,cancelable:true,view:optionView,button:0,...coordinates}));
    target.click();await wait(()=>{const fresh=same();const current=[fresh.category,fresh.status,...fresh.periods][slot];return selected(e,value)||selected(current,value);},`${value} 선택 결과를 확인하지 못했습니다.`);
  }
  async function fill(row,plan){
    if(running)throw new Error('신고서 처리 중입니다.');running=true;
    try{
      if(!plan||plan.kind!==row.attendanceType||plan.reason!==row.reason||plan.reasonType!==row.reasonType||plan.status!=='접수')throw new Error('신고서 입력 자료를 확인해 주세요.');
      const p=find();verify(row,p);
      const same=()=>{const next=find();if(next.box!==p.box)throw new Error('신고서 화면이 바뀌었습니다.');verify(row,next);return next;};
      if(!enabled(p.area)||p.area.readOnly)throw new Error('이 신고서는 수정·저장할 수 없습니다.');
      await choose(p.category,plan.reasonType,p,same);
      await choose(same().status,'접수',p,same);
      await choose(same().periods[0],plan.start,p,same);
      await choose(same().periods[1],row.attendanceType==='조퇴'?'종례':plan.end,p,same);
      const area=same().area,view=area.ownerDocument.defaultView;
      if(!enabled(area)||area.readOnly)throw new Error('담임 사유 입력칸을 수정할 수 없습니다.');
      if(area.maxLength>=0&&plan.reason.length>area.maxLength)throw new Error('사유가 입력칸 최대 길이를 넘습니다.');
      Object.getOwnPropertyDescriptor(view.HTMLTextAreaElement.prototype,'value').set.call(area,plan.reason);
      for(const name of ['input','change','blur'])area.dispatchEvent(new view.Event(name,{bubbles:name!=='blur'}));
      await wait(()=>same().area.value===plan.reason,'담임 사유 입력을 확인하지 못했습니다.');
      const current=same();
      if(!selected(current.category,plan.reasonType)||!selected(current.status,'접수')||!selected(current.periods[0],plan.start)||!selected(current.periods[1],row.attendanceType==='조퇴'?'종례':plan.end))throw new Error('저장 전 선택 값이 달라졌습니다.');
      if(current.area.value!==plan.reason)throw new Error('저장 전 담임 사유가 달라졌습니다.');
      const dialog=current.area.closest('.cl-dialog')||current.box;
      const saves=saveButtons(dialog);
      if(saves.length!==1||!enabled(saves[0]))return {ok:true,saveRequested:false,message:'신고구분·접수·교시·담임 사유를 입력했습니다. 저장 버튼을 찾지 못해 저장은 누르지 않았습니다. 상세조회 아래 저장을 눌러 주세요.'};
      saves[0].scrollIntoView?.({block:'nearest'});saves[0].click();
      return {ok:true,saveRequested:true,message:'신고서 접수·교시·담임 사유를 입력하고 저장을 눌렀습니다. 나이스 저장 결과를 확인해 주세요. 일일출결 완료로 표시하지 않습니다.'};
    }finally{running=false;}
  }
  globalThis.__teacherNeisReport={fill,find};
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||message?.type!=='TEACHER_NOTEBOOK_REPORT'||message.command!=='fill')return false;
    fill(message.row,message.plan).then(respond).catch(error=>respond({ok:false,error:error.message}));return true;
  });
})();
