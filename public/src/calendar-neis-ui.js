import { examNeisEligibility, prepareExamNeis } from './calendar-neis-model.js';
import { compareEvent } from './editor-model.js';
import { sendToNeisHelper } from './notebook-neis-bridge.js';
import { neisGuideHtml } from './notebook-neis-guide.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function openExamNeis({events,getLatestEvents,title='고사일정 → 나이스 출석인정'}) {
  const originals=structuredClone(events),selected=new Set(originals.filter(event=>examNeisEligibility(event).ready&&!event.issues.length).map(event=>event.id));
  const reviewed=new Set();let busy=false;
  const dialog=document.createElement('dialog');dialog.className='exam-neis-dialog';
  dialog.setAttribute('aria-labelledby','exam-neis-title');
  dialog.innerHTML=`<header><div><h2 id="exam-neis-title">${esc(title)}</h2><p>확정한 학생·날짜를 출석인정 결석으로 준비합니다.</p></div><button type="button" class="icon-btn" data-exam-close aria-label="고사 나이스 입력 닫기">×</button></header>
    <div class="exam-neis-body"><p class="exam-neis-note">하루 전체 결석 기준입니다. 일부 교시만 빠지는 경우는 담임 기록함에서 지각·조퇴 등으로 작성하세요. 후보 기간과 주말은 자동 입력 자료에서 제외됩니다.</p>
      <div class="exam-neis-table"><table><thead><tr><th><input type="checkbox" data-exam-all aria-label="불일치 없는 확정 고사 전체 선택"></th><th>학생</th><th>날짜</th><th>고사</th><th>확인 상태</th></tr></thead><tbody>${originals.map(event=>{const eligible=examNeisEligibility(event);return `<tr><td><input type="checkbox" data-exam-select="${esc(event.id)}" aria-label="${esc(event.studentId+' '+event.name+' '+event.startDate+' '+event.university+' 선택')}" ${selected.has(event.id)?'checked':''} ${eligible.ready?'':'disabled'}></td><td>${esc(event.studentId)}<br><strong>${esc(event.name)}</strong></td><td>${esc(event.startDate)}${event.dateMode!=='single'?` ~ ${esc(event.endDate)}`:''}</td><td>${esc(event.university)}<br>${esc(event.kind)}</td><td class="${event.issues.length?'exam-neis-warning':''}">${esc(eligible.label)}${event.issues.length?`<small>${event.issues.map(esc).join(' · ')}<br>증빙서류 기준으로 수정 요망. 확인한 일정만 선택하세요.</small>`:''}</td></tr>`;}).join('')}</tbody></table></div>
      <p data-exam-count role="status"></p><div class="exam-neis-preview" data-exam-preview></div><p class="exam-neis-error" data-exam-error role="alert"></p><p class="exam-neis-status" data-exam-status role="status"></p>
      <p class="exam-neis-note">같은 학생·날짜의 고사는 한 건으로 합칩니다. 도우미로 보낸 뒤 나이스에서 학생·날짜와 출결 구분을 선택하고 최종 저장하세요. 새로 보내면 도우미의 이전 입력 대기 목록이 교체됩니다.</p>
      ${neisGuideHtml({exam:true})}</div>
    <footer><details class="neis-other-methods" data-exam-other><summary>다른 방법 · 복사 또는 파일 저장</summary><div class="neis-alternative-actions"><div><button class="btn" data-exam-copy>붙여넣을 내용 복사</button></div><div><button class="btn" data-exam-csv>엑셀로 확인할 파일 저장</button></div><div><button class="btn" data-exam-json>도우미에서 불러올 파일 저장</button><p>도우미의 ‘나이스 입력용 JSON 열기’에서 불러옵니다.</p></div></div></details><button class="btn primary" data-exam-send>출석인정으로 보내기</button></footer>`;
  document.body.append(dialog);
  const q=selector=>dialog.querySelector(selector),error=q('[data-exam-error]'),status=q('[data-exam-status]');
  const chosen=()=>originals.filter(event=>selected.has(event.id));
  const prepared=()=>prepareExamNeis(chosen(),{reviewedIssueIds:[...reviewed]});
  function update() {
    error.textContent='';
    for(const input of dialog.querySelectorAll('[data-exam-select]'))input.checked=selected.has(input.dataset.examSelect);
    const clean=originals.filter(event=>examNeisEligibility(event).ready&&!event.issues.length);
    q('[data-exam-all]').checked=clean.length>0&&clean.every(event=>selected.has(event.id));
    q('[data-exam-all]').disabled=busy||!clean.length;
    q('[data-exam-count]').textContent=`고사 ${selected.size}건 선택 · 출석인정 결석`;
    q('[data-exam-preview]').innerHTML='';
    try{if(selected.size){const ready=prepared();q('[data-exam-count]').textContent=`고사 ${selected.size}건 → 학생·날짜별 출석인정 결석 ${ready.rows.length}건`;q('[data-exam-preview]').innerHTML=`<h3>나이스에 넣을 내용</h3>${ready.rows.map(row=>`<p><strong>${esc(row.studentId+' '+row.studentName)}</strong> · ${esc(row.date)} · 출석인정 결석<br><span>${esc(row.reason)}</span></p>`).join('')}`;}}
    catch(problem){error.textContent=problem.message;}
    for(const button of dialog.querySelectorAll('[data-exam-send],[data-exam-copy],[data-exam-json],[data-exam-csv]'))button.disabled=busy||!selected.size||!!error.textContent;
  }
  async function validated() {
    const latest=await getLatestEvents();
    for(const event of chosen())if(!compareEvent(event,latest.find(item=>item.id===event.id)))throw new Error('선택한 고사일정이 변경되었습니다. 창을 닫고 최신 학생·날짜를 확인한 뒤 다시 보내 주세요.');
    return prepared();
  }
  const download=(content,extension,mime)=>{const url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement('a');a.href=url;a.download=`고사_출석인정.${extension}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  q('[data-exam-close]').onclick=()=>{if(!busy)dialog.close();};
  q('[data-exam-all]').onchange=event=>{if(busy)return;if(event.target.checked){for(const exam of originals.filter(item=>examNeisEligibility(item).ready&&!item.issues.length))selected.add(exam.id);}else{selected.clear();reviewed.clear();}status.textContent='';update();};
  for(const input of dialog.querySelectorAll('[data-exam-select]'))input.onchange=()=>{if(busy)return;const id=input.dataset.examSelect;if(input.checked){selected.add(id);reviewed.add(id);}else{selected.delete(id);reviewed.delete(id);}status.textContent='';update();};
  dialog.addEventListener('click',async event=>{
    const button=event.target.closest('[data-exam-send],[data-exam-copy],[data-exam-json],[data-exam-csv]');if(!button||busy)return;
    busy=true;for(const input of dialog.querySelectorAll('input'))input.disabled=true;q('[data-exam-close]').disabled=true;update();
    const sending=button.hasAttribute('data-exam-send');if(sending)button.textContent='보내는 중…';status.textContent='';
    try {
      const ready=await validated();
      if(sending){const result=await sendToNeisHelper(ready.payload);if(result.sent)status.textContent=`${ready.rows.length}건을 도우미로 보냈습니다. 나이스 탭 → 오른쪽 위 퍼즐 모양 🧩 → 담임 기록 → 나이스 입력 도우미에서 이어서 입력하세요.`;else{status.textContent='도우미와 연결되지 않았습니다. PC Chrome에서 도우미를 켜고 캘린더를 새로고침하세요. 파일로 옮기려면 다른 방법을 펼치세요.';q('[data-exam-other]').open=true;}}
      else if(button.hasAttribute('data-exam-copy')){await navigator.clipboard.writeText(ready.rows.map(row=>[row.studentId,row.studentName,row.date,'출석인정 결석',row.reason].join('\t')).join('\n'));status.textContent='나이스에 붙여넣을 내용을 복사했습니다.';}
      else if(button.hasAttribute('data-exam-json')){download(JSON.stringify(ready.payload,null,2),'json','application/json');status.textContent='도우미에서 불러올 파일을 저장했습니다.';}
      else{download(ready.csv,'csv','text/csv;charset=utf-8');status.textContent='엑셀로 확인할 CSV 파일을 저장했습니다.';}
    }catch(problem){error.textContent=problem.message;}
    finally{busy=false;q('[data-exam-close]').disabled=false;for(const input of dialog.querySelectorAll('[data-exam-select]'))input.disabled=!examNeisEligibility(originals.find(exam=>exam.id===input.dataset.examSelect)).ready;const message=error.textContent;update();error.textContent=message;if(sending)button.textContent='출석인정으로 보내기';}
  });
  update();dialog.showModal();return dialog;
}
