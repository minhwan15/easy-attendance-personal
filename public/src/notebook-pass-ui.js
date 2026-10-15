import { bindStudentMatcher } from './student-matcher.js';
import { emptyRecord, parseSourceText, readiness, withAttendanceMeetings, REASON_TYPES } from './notebook-model.js';
import { todaySeoul } from './model.js';
import { preparePassRecord } from './notebook-pass-model.js';
import { printPass } from './notebook-pass-print.js';
import { missedPeriods, seoulNow, schoolPeriodsForDate } from './school-timetable.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const schoolEmblem = new URL('/favicon.svg',import.meta.url).href;
const neisKeys = ['category','studentId','studentName','classNumber','number','startDate','endDate','attendanceType','reasonType','periods','reason','lessonCount'];
const sameNeisContent = (previous,next) => neisKeys.every(key=>String(previous?.[key]||'')===String(next[key]||'')) && JSON.stringify(previous?.attendanceDates||[])===JSON.stringify(next.attendanceDates||[]);

/** One record is used for the printed pass and the existing NEIS input queue. */
export function openPassEditor({record,students=[],user,save,onSaved=()=>{},notify=()=>{},demo=false}) {
  const now=seoulNow();
  let previous=record ? clone(record) : null;
  let current={...emptyRecord(),...(record ? clone(record) : {}),id:record?.id||crypto.randomUUID(),passKind:record?.passKind||(record?.attendanceType==='결과'?'outing':'early'),startDate:record?.startDate||now.date,departureTime:record?.departureTime||now.time,returnTime:record?.returnTime||'',actualReturnTime:record?.actualReturnTime||'',teacherName:user?.displayName||user?.username||''};
  current.periods=withAttendanceMeetings(current.periods,current.passKind==='early'?'조퇴':'결과',{date:current.startDate,lessonCount:current.lessonCount});
  let busy=false, dirty=false, manualReason=Boolean(current.reasonType);
  let periodsMode=record?'manual':'time', periodsTouched=false, liveClock=!record, clockId=null;
  let autofilledName=students.some(student=>student.studentId===current.studentId&&(student.studentName||student.name)===current.studentName)?current.studentName:'';
  const dialog=document.createElement('dialog');
  dialog.className='dialog pass-editor';
  dialog.setAttribute('aria-labelledby','pass-editor-title');
  const field=(label,name,{type='text',placeholder='',list='',max='',required=false}={})=>`<div class="field"><label for="pass-${name}">${label}</label><input id="pass-${name}" name="${name}" type="${type}" value="${esc(current[name])}" ${placeholder?`placeholder="${esc(placeholder)}"`:''} ${list?`list="${list}"`:''} ${max?`maxlength="${max}"`:''} ${required?'required':''} ${name==='studentId'?'inputmode="numeric"':''}></div>`;
  dialog.innerHTML=`<div class="dialog-head"><div class="pass-heading"><div><p>${esc(globalThis.easyProfile?.schoolName||'우리 학교')}</p><h2 id="pass-editor-title">외출·조퇴증</h2></div></div><button type="button" class="icon-btn" id="pass-close" aria-label="외출·조퇴증 닫기">×</button></div>
    <form id="pass-form"><div class="pass-body"><div id="pass-error" class="form-error" role="alert"></div><div class="pass-kind" role="group" aria-label="증서 종류"><button type="button" data-pass-kind="early" aria-pressed="${current.passKind==='early'}">조퇴증</button><button type="button" data-pass-kind="outing" aria-pressed="${current.passKind==='outing'}">외출증</button></div>
    <datalist id="pass-student-ids">${students.map(student=>`<option value="${esc(student.studentId)}">${esc(student.studentName||student.name)}</option>`).join('')}</datalist><datalist id="pass-student-names">${students.map(student=>`<option value="${esc(student.studentName||student.name)}">${esc(student.studentId)}</option>`).join('')}</datalist>
    <div class="form-grid">${field('학번','studentId',{placeholder:'30801',list:'pass-student-ids',max:5,required:true})}${field('학생 이름','studentName',{placeholder:'이름 또는 명렬표 선택',list:'pass-student-names',max:40,required:true})}</div>
    <div class="form-grid pass-time-grid">${field('날짜','startDate',{type:'date',required:true})}<div class="pass-departure-field">${field('나가는 시각','departureTime',{type:'time',required:true})}<button type="button" class="pass-text-button" id="pass-current-time">현재 시각</button></div><div id="pass-return-field">${field('돌아올 예정 시각','returnTime',{type:'time'})}</div></div>
    <div class="form-grid pass-reason-grid"><div class="field"><label for="pass-reasonType">사유 구분</label><select id="pass-reasonType" name="reasonType"><option value="">선택</option>${REASON_TYPES.map(type=>`<option value="${esc(type)}" ${current.reasonType===type?'selected':''}>${esc(type)}</option>`).join('')}</select></div><div class="field"><label for="pass-reason">사유</label><input id="pass-reason" name="reason" maxlength="2000" value="${esc(current.reason)}" placeholder="예: 복통으로 병원 진료" required></div></div>
    <div class="field"><label for="pass-lessonCount">이 날짜 실제 수업</label><select name="lessonCount" id="pass-lessonCount"><option value="0" ${!current.lessonCount?'selected':''}>기본 요일 시간표</option>${Array.from({length:8},(_,i)=>`<option value="${i+1}" ${Number(current.lessonCount)===i+1?'selected':''}>${i+1}교시 수업</option>`).join('')}</select></div><div class="pass-period-fields"><div class="pass-period-input">${field('빠지는 교시','periods',{placeholder:'시간으로 계산 · 직접 수정 가능',max:100})}<button type="button" class="pass-text-button" id="pass-calculate-periods">시간으로 계산</button></div><p id="pass-period-hint" aria-live="polite"></p><p class="pass-timetable-hint">내 학교 시간표 적용 · 조퇴는 종례까지</p></div>
    <details class="pass-neis-fields" id="pass-return-details" ${record?.actualReturnTime?'open':''}><summary>실제 복귀 시각 <span>복귀 후 입력</span></summary><div id="pass-actual-return-field">${field('실제 복귀 시각','actualReturnTime',{type:'time'})}</div></details><p id="pass-neis-hint" class="pass-neis-hint"></p>
    <p class="pass-teacher">담임교사 <strong>${esc(current.teacherName)}</strong> 확인</p><p id="pass-save-status" class="pass-save-status" role="status"></p></div>
    <footer class="dialog-footer"><span class="save-state">${demo?'예시 모드':'출력 전 내 계정에 자동 저장'}</span><span class="footer-spacer"></span><button type="button" class="btn" id="pass-save-only" ${previous?'':'hidden'}>수정 저장</button><button type="submit" class="btn primary" id="pass-save-print">저장하고 출력</button></footer></form>`;
  document.body.append(dialog);
  const el=id=>dialog.querySelector(`#${id}`);
  const form=el('pass-form');
  function read() {
    const data=Object.fromEntries(new FormData(form));
    current={...current,...data,endDate:data.startDate,attendanceDates:data.startDate?[data.startDate]:[]};
    if(/^[1-3]\d{4}$/.test(current.studentId)){current.classNumber=Number(current.studentId.slice(1,3));current.number=Number(current.studentId.slice(3));}
    return current;
  }
  function updateKind() {
    const outing=current.passKind==='outing';
    dialog.querySelectorAll('[data-pass-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.passKind===current.passKind)));
    el('pass-return-field').hidden=!outing;el('pass-returnTime').required=outing;
    el('pass-actual-return-field').hidden=!outing;
    el('pass-return-details').hidden=!outing;
    el('pass-returnTime').disabled=!outing;el('pass-actualReturnTime').disabled=!outing;
    dialog.querySelector('.pass-time-grid').classList.toggle('outing',outing);
    el('pass-neis-hint').textContent=outing?'실제 빠진 교시가 있을 때 결과로 나이스 입력 대기함에 연결됩니다.':'빠지는 교시를 조퇴로 나이스 입력 대기함에 연결합니다.';
  }
  function updatePeriods() {
    const outing=current.passKind==='outing';
    const date=el('pass-startDate').value;
    const lessons=schoolPeriodsForDate(date,Number(el('pass-lessonCount').value));
    dialog.querySelector('.pass-timetable-hint').textContent=lessons.length?`${date} · ${lessons.length}교시 수업 · 내 학교 시간표${outing?'':' · 종례 포함'}`:'수업일을 선택해 주세요. · 내 학교 시간표';
    const result=missedPeriods({kind:current.passKind,date,lessonCount:Number(el('pass-lessonCount').value),departureTime:el('pass-departureTime').value,returnTime:outing?el('pass-actualReturnTime').value:''});
    const manual=periodsMode==='manual';
    if(periodsMode==='time')el('pass-periods').value=(!outing||el('pass-actualReturnTime').value)&&result.valid?result.text:'';
    el('pass-periods').dataset.mode=periodsMode;
    let hint='';
    if(manual)hint='직접 입력한 교시를 사용합니다.';
    else if(periodsMode==='source')hint='사유에 적은 수업 내용을 반영했습니다.';
    else if(outing&&!el('pass-actualReturnTime').value) {
      const expected=missedPeriods({kind:'outing',date,lessonCount:Number(el('pass-lessonCount').value),departureTime:el('pass-departureTime').value,returnTime:el('pass-returnTime').value});
      hint=expected.valid&&expected.text?`예상 ${expected.text} · 실제 복귀 시각을 입력하면 확정됩니다.`:'복귀 후 실제 시각을 입력하거나 빠진 교시를 직접 적어 주세요.';
    }else if(result.valid)hint=result.text?`${el('pass-departureTime').value}${outing?`~${el('pass-actualReturnTime').value}`:' 조퇴'} → ${result.text}`:'빠지는 수업이 없습니다.';
    else hint=result.error||'시각을 입력하면 빠지는 교시를 계산합니다.';
    el('pass-period-hint').textContent=hint;
  }
  function stopClock() {liveClock=false;if(clockId!==null){clearInterval(clockId);clockId=null;}}
  function refreshClock() {
    if(!liveClock||busy||previous)return;
    const latest=seoulNow();
    if(el('pass-startDate').value!==latest.date){stopClock();return;}
    if(el('pass-departureTime').value!==latest.time){el('pass-departureTime').value=latest.time;updatePeriods();}
  }
  function markChanged() {dirty=true;el('pass-save-status').textContent='';el('pass-save-print').textContent='저장하고 출력';}
  function close() {
    if(busy)return;
    if(dirty&&!confirm('저장하지 않은 변경이 있습니다. 닫을까요?'))return;
    stopClock();dialog.close();dialog.remove();
  }
  el('pass-close').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',stopClock);
  dialog.querySelectorAll('[data-pass-kind]').forEach(button=>button.onclick=()=>{if(current.passKind===button.dataset.passKind)return;read();current.passKind=button.dataset.passKind;if(periodsMode==='source')periodsMode='time';markChanged();updateKind();updatePeriods();});
  el('pass-current-time').onclick=()=>{stopClock();el('pass-departureTime').value=seoulNow().time;markChanged();updatePeriods();};
  el('pass-calculate-periods').onclick=()=>{periodsMode='time';periodsTouched=false;markChanged();updatePeriods();};
  form.addEventListener('input',event=>{
    markChanged();
    if(event.target.name==='departureTime'||event.target.name==='startDate')stopClock();
    if(event.target.name==='lessonCount'){periodsMode='time';periodsTouched=false;}
    if(event.target.name==='periods'){periodsMode='manual';periodsTouched=true;}
    if(event.target.name==='actualReturnTime'&&current.passKind==='outing'&&!el('pass-periods').value&&!periodsTouched)periodsMode='time';
    if(event.target.name==='startDate'&&periodsMode==='source') {
      const parsed=parseSourceText(el('pass-reason').value,{referenceDate:el('pass-startDate').value||todaySeoul()}).fields;
      if(Object.hasOwn(parsed,'periods'))el('pass-periods').value=parsed.periods;
      else periodsMode='time';
    }
    if(['startDate','departureTime','returnTime','actualReturnTime','periods','lessonCount'].includes(event.target.name))updatePeriods();
    if(event.target.name==='studentId') {
      const match=students.find(student=>student.studentId===event.target.value.trim());
      if(match){autofilledName=match.studentName||match.name||'';el('pass-studentName').value=autofilledName;}
      else if(autofilledName&&el('pass-studentName').value===autofilledName){el('pass-studentName').value='';autofilledName='';}
    }
    if(event.target.name==='studentName') {
      const linked=students.find(student=>student.studentId===el('pass-studentId').value.trim());
      if(linked&&(linked.studentName||linked.name)!==event.target.value.trim())el('pass-studentId').value='';
      autofilledName='';
    }
    if(event.target.name==='reason') {
      const parsed=parseSourceText(event.target.value,{referenceDate:el('pass-startDate').value||todaySeoul()}).fields;
      if(!manualReason)el('pass-reasonType').value=parsed.reasonType||'';
      if(periodsMode!=='manual') {
        if(Object.hasOwn(parsed,'periods')){periodsMode='source';el('pass-periods').value=parsed.periods;}
        else if(periodsMode==='source')periodsMode='time';
        updatePeriods();
      }
    }
  });
  el('pass-studentName').onchange=()=>{
    const matches=students.filter(student=>(student.studentName||student.name)===el('pass-studentName').value.trim());
    if(matches.length===1){el('pass-studentId').value=matches[0].studentId;autofilledName=matches[0].studentName||matches[0].name;}
  };
  bindStudentMatcher({inputs:[el('pass-studentId'),el('pass-studentName')],students,onSelect:student=>{el('pass-studentId').value=student.studentId;el('pass-studentName').value=student.studentName;autofilledName=student.studentName;read();markChanged();}});
  el('pass-reasonType').onchange=()=>{manualReason=true;};
  function setBusy(value) {
    busy=value;
    form.querySelectorAll('input,select,button').forEach(control=>{control.disabled=value;});
    el('pass-close').disabled=value;
    if(!value)updateKind();
  }
  async function commit(shouldPrint) {
    if(busy||!form.reportValidity())return;
    refreshClock();stopClock();
    read();el('pass-error').textContent='';
    try {
      if(previous&&!sameNeisContent(previous,current))current.neisConfirmedDates=[];
      const prepared=preparePassRecord(current,{teacherName:user?.displayName||user?.username||''});
      if(!prepared.ready)throw new Error(prepared.errors.join(' · '));
      const record={...prepared.record,entryStatus:previous?.entryStatus==='confirmed'&&sameNeisContent(previous,prepared.record)?'confirmed':'pending'};
      setBusy(true);el('pass-save-print').textContent='저장 중…';
      const saved=await save(record,previous);
      if(!saved?.id)throw new Error('저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
      current=clone(saved);previous=clone(saved);dirty=false;
      el('pass-periods').value=saved.periods||'';updatePeriods();
      onSaved(saved);el('pass-save-only').hidden=false;
      const ready=readiness(saved).ready;
      el('pass-save-status').textContent=ready?(saved.entryStatus==='confirmed'?'저장 완료 · 나이스 저장 확인 상태를 유지했습니다.':'저장 완료 · 나이스 입력 대기함에 연결했습니다.'):!saved.periods?'저장 완료 · 교시를 입력하면 나이스 입력을 준비합니다.':'저장 완료 · 나이스 입력에 필요한 항목을 보완해 주세요.';
      if(shouldPrint) {
        el('pass-save-print').textContent='인쇄 창 여는 중…';
        try {await printPass(saved);notify(demo?'예시 증서를 저장하고 인쇄 창을 열었습니다.':'기록을 저장하고 인쇄 창을 열었습니다.');}
        catch(error) {el('pass-error').textContent=`기록은 저장했습니다. ${error.message||'인쇄 창을 열지 못했습니다.'} 다시 출력해 주세요.`;}
      } else notify('같은 기록에 수정 내용을 저장했습니다.');
    }catch(error){
      el('pass-error').textContent=error.status===409?'다른 기기에서 변경된 기록입니다. 입력한 내용은 유지했습니다. 닫은 뒤 최신 기록을 불러와 주세요.':error.message;
      el('pass-error').scrollIntoView?.({block:'nearest'});
    }finally{
      setBusy(false);el('pass-save-print').textContent=previous&&!dirty?'다시 출력':'저장하고 출력';
    }
  }
  form.onsubmit=event=>{event.preventDefault();commit(true);};
  el('pass-save-only').onclick=()=>commit(false);
  updateKind();updatePeriods();dialog.showModal();el('pass-studentId').focus();
  if(liveClock)clockId=setInterval(refreshClock,30000);
  return dialog;
}

