const clean=value=>String(value??'').normalize('NFC').trim().replace(/\s+/g,'');
const initials=value=>[...clean(value)].map(c=>{const n=c.charCodeAt(0)-0xac00;return n>=0&&n<11172?'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(n/588)]:c;}).join('');
const jamo=value=>[...clean(value)].map(c=>{const n=c.charCodeAt(0)-0xac00;if(n<0||n>=11172)return c;return 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(n/588)]+'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'[Math.floor(n%588/28)]+('ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'[n%28-1]||'');}).join('');
function editDistance(a,b){
 const matrix=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 for(let i=0;i<=a.length;i++)matrix[i][0]=i;
 for(let j=0;j<=b.length;j++)matrix[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
  matrix[i][j]=Math.min(matrix[i-1][j]+1,matrix[i][j-1]+1,matrix[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])matrix[i][j]=Math.min(matrix[i][j],matrix[i-2][j-2]+1);
 }
 return matrix[a.length][b.length];
}
export function matchingStudents(students,query){
 const q=clean(query);if(!q||q.length>40)return [];
 const people=[...new Map((students||[]).map(s=>{const studentId=String(s.studentId||'').trim(),studentName=String(s.studentName||s.name||'').trim();return [studentId,{...s,studentId,studentName}];}).filter(([,s])=>/^[1-3]\d{4}$/.test(s.studentId)&&s.studentName)).values()];
 const consonants=/^[ㄱ-ㅎ]+$/.test(q),partial=jamo(q);
 const score=s=>{
  const name=clean(s.studentName);
  if(q===s.studentId||q===name||q===clean(s.studentId+name))return 0;
  if(name.startsWith(q))return 1;
  if(name.includes(q))return 2;
  if(s.studentId.includes(q)||clean(s.studentId+name).includes(q))return 3;
  if(consonants&&initials(name).includes(q))return 4;
  if(/[가-힣ㄱ-ㅎ]/.test(q)&&jamo(name).includes(partial))return 5;
  if(/^[가-힣]{2,}$/.test(q)){
   let distance=editDistance(q,name);
   for(let i=0;i<name.length;i++)distance=Math.min(distance,editDistance(q,name.slice(i,i+q.length)));
   if(distance<=1)return 10+distance;
  }
  return Infinity;
 };
 return people.map(s=>({student:s,score:score(s)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>a.score-b.score||a.student.studentId.localeCompare(b.student.studentId)).map(x=>x.student);
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
   if(applying||input.disabled||input.readOnly)return;
   clear();const list=typeof students==='function'?students():students;
   const exact=exactStudent(list,input.value);
   if(!composing&&!event?.isComposing&&autoSelectId&&exact&&clean(input.value)===exact.studentId){select(exact,input);return;}
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
  input.addEventListener('compositionstart',()=>{composing=true;});
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

