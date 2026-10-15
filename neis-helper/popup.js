(() => {
  if (globalThis.__teacherNeisPopup) return;
  if (location.protocol !== 'https:' || !(location.hostname === 'neis.go.kr' || location.hostname.endsWith('.neis.go.kr'))) return;
  globalThis.__teacherNeisPopup = { fill, findPopup };
  const kinds = ['결석','지각','조퇴','결과'];
  const reasons = ['질병','미인정','기타','출석인정'];
  let running = false;
  const text = node => String(node?.textContent || '').replace(/\s+/g,'').trim();
  const visible = node => Boolean(node?.isConnected && node.getClientRects().length) && node.ownerDocument.defaultView.getComputedStyle(node).visibility !== 'hidden';
  const enabled = node => visible(node) && !node.disabled && !node.closest('[inert],[aria-disabled="true"],.cl-disabled');
  function documents(d, result=[]) {
    result.push(d);
    for (const frame of d.querySelectorAll('iframe,frame')) {
      try { if(frame.contentDocument) documents(frame.contentDocument,result); } catch {}
    }
    return result;
  }
  function findPopup() {
    const found = [];
    for (const d of documents(document)) {
      const icons = [...d.querySelectorAll('.cl-radiobutton-item [role="radio"]')].filter(visible);
      for (const icon of icons) {
        let box = icon.closest('.cl-radiobutton-item').parentElement;
        while (box && box !== d.body) {
          const choices = [...box.querySelectorAll('.cl-radiobutton-item')].filter(visible);
          const labels = choices.map(text);
          const buttons = [...box.querySelectorAll('[role="button"],button')].filter(visible);
          const apply = buttons.filter(node=>text(node)==='적용');
          const inputs = [...box.querySelectorAll('input[type="text"],textarea')].filter(visible);
          if (choices.length===8 && [...kinds,...reasons].every(label=>labels.filter(x=>x===label).length===1) && apply.length===1 && inputs.length===1) {
            if (!found.some(item=>item.box===box)) found.push({box,choices,apply:apply[0],input:inputs[0]});
            break;
          }
          box=box.parentElement;
        }
      }
    }
    if(found.length!==1) throw new Error(found.length?'출결 창이 여러 개 열려 있습니다. 하나만 열어 주세요.':'학생의 마감 빈칸을 눌러 출결마감구분 창을 먼저 열어 주세요.');
    return found[0];
  }
  function radio(popup,label) {
    const matches=popup.choices.filter(node=>text(node)===label);
    const icon=matches[0]?.querySelector('[role="radio"]');
    if(matches.length!==1||!enabled(icon))throw new Error(`${label} 선택 버튼을 사용할 수 없습니다.`);
    return icon;
  }
  async function waitFor(check,message) {
    const deadline=Date.now()+1800;
    while(Date.now()<deadline) {
      if(check())return;
      await new Promise(resolve=>setTimeout(resolve,40));
    }
    throw new Error(message);
  }
  async function fill(fields,replace=false) {
    if(running)throw new Error('자동입력 중입니다. 잠시 기다려 주세요.');
    if(!fields||!kinds.includes(fields.attendanceType)||!reasons.includes(fields.reasonType)||typeof fields.reason!=='string'||!fields.reason.trim()||fields.reason.length>2000)throw new Error('기록의 종류·구분·사유를 확인해 주세요.');
    running=true;
    try {
      const initial=findPopup(), view=initial.input.ownerDocument.defaultView;
      if(!enabled(initial.input)||initial.input.readOnly)throw new Error('사유 입력칸을 사용할 수 없습니다.');
      if(initial.input.value && initial.input.value!==fields.reason && !replace)throw new Error('사유에 기존 내용이 있습니다. 기존 내용 바꾸기를 선택해 주세요.');
      if(initial.input.maxLength>=0&&fields.reason.length>initial.input.maxLength)throw new Error('사유가 나이스 입력칸의 최대 길이를 넘습니다.');
      const assertSame=()=>{const popup=findPopup();if(popup.box!==initial.box)throw new Error('출결 창이 바뀌었습니다. 학생과 날짜를 다시 확인해 주세요.');return popup;};
      let popup=assertSame();
      const kind=radio(popup,fields.attendanceType);
      if(kind.getAttribute('aria-checked')!=='true')kind.click();
      await waitFor(()=>radio(assertSame(),fields.attendanceType).getAttribute('aria-checked')==='true','종류 선택을 확인하지 못했습니다. 적용을 누르기 전 확인해 주세요.');
      popup=assertSame();
      const category=radio(popup,fields.reasonType);
      if(category.getAttribute('aria-checked')!=='true')category.click();
      await waitFor(()=>radio(assertSame(),fields.reasonType).getAttribute('aria-checked')==='true','구분 선택을 확인하지 못했습니다. 적용을 누르기 전 확인해 주세요.');
      const input=assertSame().input;
      if(!enabled(input)||input.readOnly)throw new Error('사유 입력칸이 바뀌었습니다.');
      const prototype=input.tagName==='TEXTAREA'?view.HTMLTextAreaElement.prototype:view.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,fields.reason);
      input.dispatchEvent(new view.Event('input',{bubbles:true}));
      input.dispatchEvent(new view.Event('change',{bubbles:true}));
      input.dispatchEvent(new view.Event('blur',{bubbles:false}));
      await waitFor(()=>assertSame().input.value===fields.reason,'사유 입력을 확인하지 못했습니다. 적용을 누르기 전 확인해 주세요.');
      popup=assertSame();
      if(radio(popup,fields.attendanceType).getAttribute('aria-checked')!=='true'||radio(popup,fields.reasonType).getAttribute('aria-checked')!=='true')throw new Error('선택 결과가 달라졌습니다. 적용을 누르기 전 확인해 주세요.');
      // Deliberately leave Apply untouched while the real grid adapter is being verified.
      return {ok:true,fields:['attendanceType','reasonType','reason'],message:'종류·구분·사유를 자동입력했습니다. 아직 적용·교시 선택·저장은 하지 않았습니다.'};
    } finally {running=false;}
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||message?.type!=='TEACHER_NOTEBOOK_POPUP'||message.command!=='fill')return false;
    fill(message.fields,Boolean(message.replace)).then(respond).catch(error=>respond({ok:false,error:error.message}));
    return true;
  });
})();
