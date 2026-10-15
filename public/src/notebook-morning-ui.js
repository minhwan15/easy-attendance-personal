import { bindStudentMatcher, exactStudent } from './student-matcher.js';
import { normalizeParentReplies } from './notebook-parent-replies.js';
import { morningReasonType,makeMorningRecord,markMorningArrival,isMorningRecord } from './notebook-morning-model.js';
import { readiness } from './notebook-model.js';
import { seoulNow } from './school-timetable.js';
export function mountMorning({root,students,records,today,escape,save,onSaved,onNeis,onRoster,notify,replies,saveReplies}){
  let parentReplies=normalizeParentReplies(replies),replyDirty=false;
  let type='결석',busy=false,dirty=false,editing=null;
  const todays=records.filter(record=>isMorningRecord(record)&&record.startDate===today).sort((a,b)=>a.studentId.localeCompare(b.studentId)||(b.updatedAt||'').localeCompare(a.updatedAt||''));
  root.innerHTML=`<section class="morning-card"><div class="morning-top"><span>${today.replaceAll('-','.')} · 오늘</span><button type="button" class="text-btn" id="morning-roster">명렬표</button></div><form id="morning-form"><label class="morning-label" for="morning-name">학생 이름</label><input id="morning-name" autocomplete="off" placeholder="이름을 입력하거나 선택" list="morning-students" required><datalist id="morning-students">${students.map(student=>`<option value="${escape(student.studentName||student.name)}">${escape(student.studentId)}</option>`).join('')}</datalist><div id="morning-matches" class="morning-matches"></div><label class="morning-label" for="morning-reason">사유</label><input id="morning-reason" autocomplete="off" placeholder="예: 감기, 병원 들렀다가 등교" maxlength="2000" required><div class="morning-reason-shortcuts" role="group" aria-label="자주 쓰는 사유">${['생리통','감기','두통','복통','늦잠'].map(reason=>`<button type="button" data-morning-reason="${reason}">${reason}</button>`).join('')}</div><div class="morning-type" role="group" aria-label="출결 선택"><button type="button" data-morning-type="지각" aria-pressed="false">지각</button><button type="button" data-morning-type="결석" aria-pressed="true">결석</button></div><div class="morning-result"><span id="morning-result" role="status"></span><select id="morning-reason-type" aria-label="사유 구분 수정"><option value="질병">질병</option><option value="미인정">미인정</option><option value="출석인정">출석인정</option><option value="기타">기타</option></select></div><details class="morning-more"><summary>날짜·등교 시각</summary><label>날짜<input id="morning-date" type="date" value="${today}" required></label><label id="morning-arrival-label" hidden>실제 등교 시각<input id="morning-arrival" type="time"></label></details><p class="form-error" id="morning-error" role="alert"></p><button class="btn primary morning-save" id="morning-save" type="submit">메모 저장</button></form><section class="morning-replies" aria-label="학부모 답장 복사"><p>학부모 답장 <small>누르면 복사</small><button type="button" class="text-btn" id="morning-reply-edit">편집</button></p>${parentReplies.map((reply,index)=>`<button type="button" data-parent-reply="${index}" aria-label="답장 복사: ${escape(reply)}"><span>${escape(reply)}</span><small>복사</small></button>`).join('')}<div id="morning-reply-form" hidden>${parentReplies.map((reply,index)=>`<label>답장 ${index+1}<textarea data-reply-text="${index}" maxlength="500" rows="2">${escape(reply)}</textarea></label>`).join('')}<div class="morning-reply-actions"><button class="btn small primary" id="morning-reply-save" type="button">답장 저장</button><button class="btn small" id="morning-reply-cancel" type="button">취소</button></div></div><span class="morning-copy-status" role="status" id="morning-copy-status"></span></section></section><section class="morning-today"><div class="practical-student-heading"><h2>오늘 메모 <span>${todays.length}</span></h2><button class="btn small" id="morning-neis" type="button">나이스로 보내기</button></div>${todays.length?todays.map(record=>`<article class="morning-row"><button class="morning-row-edit" type="button" data-morning-edit="${record.id}"><strong>${escape(record.studentName)}</strong><span>${escape(record.reason)} · ${record.reasonType} ${record.attendanceType}</span><small>${record.entryStatus==='confirmed'?'나이스 입력 완료':readiness(record).ready?'나이스 입력 준비':'등교 확인 대기'} · 수정</small></button><button class="btn small danger" type="button" data-delete="${record.id}" aria-label="${escape(record.studentName)} 삭제">삭제</button>${record.attendanceType==='지각'&&!record.periods?`<button class="btn small" type="button" data-morning-arrived="${record.id}">등교 확인</button>`:''}</article>`).join(''):'<p class="muted">저장한 메모가 여기에 모입니다.</p>'}</section>`;
  const el=id=>root.querySelector('#'+id),form=el('morning-form');
  root.querySelectorAll('[data-parent-reply]').forEach(button=>button.addEventListener('click',async()=>{
    const reply=parentReplies[Number(button.dataset.parentReply)];
    try{await navigator.clipboard.writeText(reply);el('morning-copy-status').textContent='복사했습니다. 문자창에 붙여넣으세요.';}
    catch{el('morning-copy-status').textContent='복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.';}
  }));
  root.querySelectorAll('[data-morning-reason]').forEach(button=>button.addEventListener('click',()=>{el('morning-reason').value=button.dataset.morningReason;if(button.dataset.morningReason==='늦잠')type='지각';dirty=true;update();}));
  const replyInputs=[...root.querySelectorAll('[data-reply-text]')];
  const replyCopyButtons=[...root.querySelectorAll('[data-parent-reply]')];
  const showReplyEdit=show=>{el('morning-reply-form').hidden=!show;replyCopyButtons.forEach(button=>button.hidden=show);el('morning-reply-edit').hidden=show;};
  el('morning-reply-edit').onclick=()=>{showReplyEdit(true);replyInputs[0].focus();};
  replyInputs.forEach(input=>input.addEventListener('input',()=>{replyDirty=true;}));
  el('morning-reply-cancel').onclick=()=>{if(busy)return;replyInputs.forEach((input,index)=>input.value=parentReplies[index]);replyDirty=false;showReplyEdit(false);el('morning-copy-status').textContent='';};
  el('morning-reply-save').onclick=async()=>{
    if(busy)return;
    try{const desired=normalizeParentReplies(replyInputs.map(input=>input.value));busy=true;el('morning-reply-save').disabled=true;
      parentReplies=normalizeParentReplies(await saveReplies(desired,parentReplies));
      replyCopyButtons.forEach((button,index)=>{button.querySelector('span').textContent=parentReplies[index];button.setAttribute('aria-label','답장 복사: '+parentReplies[index]);replyInputs[index].value=parentReplies[index];});
      replyDirty=false;showReplyEdit(false);el('morning-copy-status').textContent='답장을 저장했습니다.';
    }catch(error){el('morning-copy-status').textContent=error.message;}finally{busy=false;el('morning-reply-save').disabled=false;}
  };
  const matchStudent=()=>exactStudent(students,el('morning-name').value);
  function update(autoReason=true){
    root.querySelectorAll('[data-morning-type]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.morningType===type)));
    el('morning-arrival-label').hidden=type!=='지각';
    if(autoReason)el('morning-reason-type').value=morningReasonType(el('morning-reason').value,type);
    el('morning-result').textContent=`${el('morning-reason-type').value} ${type}${type==='지각'&&!el('morning-arrival').value?' · 등교하면 ‘등교 확인’':''}`;
  }
  bindStudentMatcher({inputs:[el('morning-name')],students:()=>students,onSelect:student=>{el('morning-name').value=student.studentId+' '+student.studentName;dirty=true;el('morning-reason').focus();}});

  form.addEventListener('input',event=>{dirty=true;update(event.target===el('morning-reason'));});el('morning-reason-type').addEventListener('change',()=>{dirty=true;update(false);});
  root.querySelectorAll('[data-morning-type]').forEach(button=>button.onclick=()=>{type=button.dataset.morningType;dirty=true;update();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;if(replyDirty){el('morning-copy-status').textContent='편집한 답장을 먼저 저장해 주세요.';return;}el('morning-error').textContent='';
    try{const student=matchStudent();if(!student)throw new Error('이름을 입력한 뒤 아래 학생을 선택해 주세요.');
      const previous=editing||records.find(record=>isMorningRecord(record)&&record.studentId===student.studentId&&record.startDate===el('morning-date').value&&record.attendanceType===type);
      const record=makeMorningRecord({student,reason:el('morning-reason').value,attendanceType:type,date:el('morning-date').value,reasonType:el('morning-reason-type').value,arrivalTime:type==='지각'?(el('morning-arrival').value||/등교 (\d\d:\d\d)/.exec(previous?.note||'')?.[1]||''):'',id:previous?.id||crypto.randomUUID(),previous});
      busy=true;el('morning-save').disabled=true;await save(record,previous||null);dirty=false;notify('메모를 저장했습니다.');onSaved();
    }catch(error){el('morning-error').textContent=error.message;busy=false;el('morning-save').disabled=false;}
  });
  root.querySelectorAll('[data-morning-arrived]').forEach(button=>button.onclick=async()=>{if(busy)return;const record=records.find(record=>record.id===button.dataset.morningArrived);try{busy=true;button.disabled=true;await save(markMorningArrival(record,seoulNow().time),record);dirty=false;notify('등교 시각과 빠진 교시를 반영했습니다.');onSaved();}catch(error){notify(error.message);busy=false;button.disabled=false;}});
  root.querySelectorAll('[data-morning-edit]').forEach(button=>button.onclick=()=>{const record=records.find(record=>record.id===button.dataset.morningEdit);editing=record;el('morning-name').value=`${record.studentId} ${record.studentName}`;el('morning-reason').value=record.reason;el('morning-date').value=record.startDate;el('morning-arrival').value=/등교 (\d\d:\d\d)/.exec(record.note)?.[1]||'';el('morning-reason-type').value=record.reasonType;type=record.attendanceType;dirty=true;update(false);el('morning-name').focus();});
  el('morning-neis').onclick=()=>{if(dirty){notify('작성한 메모를 먼저 저장해 주세요.');return;}onNeis(todays.filter(record=>readiness(record).ready&&record.entryStatus!=='confirmed'));};
  el('morning-roster').onclick=onRoster;update();
  return {isBusy:()=>busy,hasPendingChanges:()=>dirty||replyDirty,setStudents:value=>{students=value;el('morning-students').innerHTML=students.map(student=>`<option value="${escape(student.studentName||student.name)}">${escape(student.studentId)}</option>`).join('');}};
}

