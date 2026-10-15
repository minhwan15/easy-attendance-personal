const clean=value=>String(value??'').normalize('NFC').trim().replace(/\s+/g,'');
const initials=value=>[...clean(value)].map(c=>{const n=c.charCodeAt(0)-0xac00;return n>=0&&n<11172?'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(n/588)]:c;}).join('');
export function matchingStudents(students,query){
 const q=clean(query);if(!q)return [];
 const people=[...new Map((students||[]).map(s=>{const studentId=String(s.studentId||'').trim(),studentName=String(s.studentName||s.name||'').trim();return [studentId,{...s,studentId,studentName}];}).filter(([,s])=>/^[1-3]\d{4}$/.test(s.studentId)&&s.studentName)).values()];
 const consonants=/^[ㄱ-ㅎ]+$/.test(q);
 return people.filter(s=>s.studentId.includes(q)||clean(s.studentName).includes(q)||clean(s.studentId+s.studentName).includes(q)||(consonants&&initials(s.studentName).includes(q))).sort((a,b)=>a.studentId.localeCompare(b.studentId));
}
export function exactStudent(students,query){const q=clean(query),matches=matchingStudents(students,query).filter(s=>q===s.studentId||q===clean(s.studentName)||q===clean(s.studentId+s.studentName));return matches.length===1?matches[0]:null;}
let matcherId=0;
export function bindStudentMatcher({inputs,students,onSelect,autoSelectId=true}){
 let applying=false;
 const doc=inputs.find(Boolean)?.ownerDocument;if(!doc)return;
 const boxes=[];
 function clear(){for(const {input,box} of boxes){box.replaceChildren();input.setAttribute('aria-expanded','false');}}
 function select(student,input){if(applying||input.disabled||input.readOnly)return;applying=true;try{onSelect(student,input);clear();}finally{applying=false;}}
 for(const input of inputs.filter(Boolean)){
  input.removeAttribute('list');input.setAttribute('autocomplete','off');input.setAttribute('placeholder','이름 일부 · 초성 · 학번으로 찾기');
  const box=doc.createElement('div');box.id='student-matches-'+(++matcherId);box.className='student-match-options';box.setAttribute('role','group');box.setAttribute('aria-label','명렬표 학생 검색 결과');
  box.style.cssText='display:flex;flex-direction:column;gap:6px;margin-top:6px;max-height:240px;overflow:auto;min-width:0;width:100%;flex-basis:100%';
  if(input.parentElement?.matches?.('.eg-navigation'))input.parentElement.style.flexWrap='wrap';
  input.setAttribute('aria-controls',box.id);input.setAttribute('aria-expanded','false');input.insertAdjacentElement('afterend',box);boxes.push({input,box});
  let composing=false;
  const refresh=event=>{
   if(applying||composing||event?.isComposing||input.disabled||input.readOnly)return;
   clear();const list=typeof students==='function'?students():students;
   const exact=exactStudent(list,input.value);
   if(autoSelectId&&exact&&clean(input.value)===exact.studentId){select(exact,input);return;}
   const matches=matchingStudents(list,input.value);
   for(const student of matches){
    const button=doc.createElement('button');button.type='button';button.className='btn small student-match-option';button.textContent=student.studentName+' · '+student.studentId+' · '+Number(student.studentId.slice(0,1))+'학년 '+Number(student.studentId.slice(1,3))+'반 '+Number(student.studentId.slice(3))+'번';
    button.style.cssText='padding:10px 12px;min-height:44px;border-radius:10px;border:1px solid #c5dace;background:#eaf3ed;color:#224e3f;text-align:left;font:inherit;white-space:normal;flex-shrink:0';
    button.addEventListener('pointerdown',event=>event.preventDefault());
    button.addEventListener('click',()=>select(student,input));
    button.addEventListener('keydown',event=>{const buttons=[...box.querySelectorAll('button')],index=buttons.indexOf(button);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus();}if(event.key==='Escape'){event.preventDefault();clear();input.focus();clear();}});
    box.append(button);
   }
   if(!matches.length&&input.value.trim()){const note=doc.createElement('small');note.textContent=list?.length?'명렬표에서 찾지 못했습니다. 이름·학번을 확인하세요.':'명렬표를 먼저 등록해 주세요.';box.append(note);}
   input.setAttribute('aria-expanded',String(Boolean(matches.length)));
  };
  input.addEventListener('compositionstart',()=>{composing=true;clear();});
  input.addEventListener('compositionend',()=>{composing=false;refresh();});
  input.addEventListener('input',refresh);input.addEventListener('focus',refresh);
  input.addEventListener('blur',()=>{setTimeout(()=>{if(!box.contains?.(doc.activeElement)){box.replaceChildren();input.setAttribute('aria-expanded','false');}},0);});
  input.addEventListener('keydown',event=>{
   if(composing||event.isComposing||event.keyCode===229)return;
   if(event.key==='Escape'){event.preventDefault();clear();event.stopPropagation?.();}
   if((event.key==='Enter'||event.key==='ArrowDown')&&box.querySelector('button')){event.preventDefault();const buttons=box.querySelectorAll('button');if(event.key==='Enter'&&buttons.length===1)buttons[0].click();else buttons[0].focus();}
  });
 }
}

