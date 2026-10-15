import { schoolWeek, shiftWeek, weeklyExperience } from './notebook-experience-week.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openExperienceWeek({date,today,loadLatest,saveRecord,onDetails,onSend}){
 let records=[],blocked=[],busy=false;
 const dialog=document.createElement('dialog');dialog.className='dialog experience-neis-dialog';dialog.setAttribute('aria-label','체험학습 주간 나이스 입력');
 document.body.append(dialog);
 const short=d=>d.slice(5).replace('-','/');
 const group=items=>{
  const groups=new Map();
  for(const item of items){const key=item.record.id+'|'+item.reason;if(!groups.has(key))groups.set(key,{...item,dates:[]});groups.get(key).dates.push(...item.dates);}
  return [...groups.values()];
 };
 function render(){
  const r=weeklyExperience(records,date,blocked);
  dialog.innerHTML=`<div class="dialog-head"><h2>체험학습 주간 입력</h2><button class="icon-btn" type="button" data-week-close aria-label="닫기">×</button></div><div class="experience-neis-body"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn small" data-week-shift="-1">이전 주</button><button class="btn small" data-week-today>이번 주</button><button class="btn small" data-week-last>지난주</button><button class="btn small" data-week-shift="1">다음 주</button><label>기준일 <input type="date" data-week-date value="${date}"></label></div><h3>${r.start} ~ ${r.end} · 월~금</h3><p><strong>전송 대상 ${r.students}명 · ${r.days}일</strong></p><div>${group(r.ready).map(item=>`<article style="padding:10px 0;border-top:1px solid #dce5df"><strong>${esc(item.record.studentName)} ${esc(item.record.studentId)}</strong><p>${item.dates.map(short).join(' · ')} · ${item.dates.length}일</p><small>${esc(item.record.reason)}</small></article>`).join('')||'<p>이 주에 보낼 미입력 날짜가 없습니다.</p>'}</div><details ${!r.days?'open':''}><summary>제외 내역 · ${r.excluded.length}건</summary>${group(r.excluded).map(item=>`<article style="padding:10px 0;border-top:1px solid #dce5df"><strong>${esc(item.record.studentName)}</strong> · ${item.dates.map(short).join(' · ')||'체험일 미지정'}<p>${esc(item.reason)}</p><button class="btn small" data-week-detail="${esc(item.record.id)}">기록 확인</button></article>`).join('')||'<p>제외된 기록이 없습니다.</p>'}</details><p data-week-error role="alert" style="color:#a33"></p><p class="helper-note">이미 완료한 날짜는 제외합니다. 다시 열면 남은 날짜만 보낼 수 있습니다.</p></div><footer class="dialog-footer"><button class="btn primary" data-week-send ${r.days?'':'disabled'}>이 주의 미입력 ${r.days}일 보내기</button></footer>`;
 }
 async function refresh(){const snapshot=await loadLatest();records=snapshot.records||[];blocked=snapshot.experienceSettings?.blockedDates||[];render();}
 function lock(value){busy=value;dialog.querySelectorAll('button,input').forEach(b=>b.disabled=value);}
 async function change(next){if(busy)return;schoolWeek(next);date=next;lock(true);try{await refresh();}catch(e){dialog.querySelector('[data-week-error]').textContent=e.message;}finally{busy=false;}}
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.addEventListener('change',e=>{if(e.target.matches('[data-week-date]'))change(e.target.value);});
 dialog.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||busy)return;
  if(b.hasAttribute('data-week-close')){dialog.close();return;}
  if(b.hasAttribute('data-week-detail')){const r=records.find(r=>r.id===b.dataset.weekDetail);dialog.close();onDetails(r);return;}
  if(b.hasAttribute('data-week-shift'))return change(shiftWeek(date,Number(b.dataset.weekShift)));
  if(b.hasAttribute('data-week-today'))return change(today);
  if(b.hasAttribute('data-week-last'))return change(shiftWeek(today,-1));
  lock(true);
  try{
   await refresh();lock(true);
   if(b.hasAttribute('data-week-send')){
    const r=weeklyExperience(records,date,blocked);
    if(!r.days)throw new Error('이 주에 보낼 미입력 날짜가 없습니다.');
    dialog.close();onSend({records:records.filter(x=>r.datesByRecord[x.id]),datesByRecord:r.datesByRecord});return;
   }
  }catch(error){await refresh().catch(()=>{});dialog.querySelector('[data-week-error]').textContent=error.message;}
  finally{busy=false;renderWithError();}
 });
 function renderWithError(){const error=dialog.querySelector('[data-week-error]')?.textContent;render();if(error)dialog.querySelector('[data-week-error]').textContent=error;}
 render();dialog.showModal();lock(true);refresh().catch(e=>{dialog.querySelector('[data-week-error]').textContent=e.message;}).finally(()=>{busy=false;renderWithError();});
 return dialog;
}
