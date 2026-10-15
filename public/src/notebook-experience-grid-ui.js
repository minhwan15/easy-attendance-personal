import { bindStudentMatcher } from './student-matcher.js';
import { academicYear } from './notebook-experience-usage.js';
import { normalizeExperienceSettings } from './notebook-experience-settings.js';
import { gridDates, cellInfo, normalizeGridMark, usageDays, planGridChanges, rectangleCells } from './notebook-experience-grid-model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy = value => JSON.parse(JSON.stringify(value));
const keyOf = (studentId, date) => `${studentId}|${date}`;
const splitKey = key => { const [studentId, date] = key.split('|'); return { studentId, date }; };
const nameOf = student => student.studentName || student.name || '';
const shiftMonth = (month, delta) => { const [y,m] = month.split('-').map(Number), date = new Date(Date.UTC(y,m-1+delta,1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`; };
const weekday = date => ['일','월','화','수','목','금','토'][new Date(`${date}T00:00:00Z`).getUTCDay()];

/** A mounted grid keeps unsaved drafts until its parent explicitly saves or destroys it. */
export function createExperienceGrid({root, records = [], students = [], settings = {}, today,
  saveRecord, saveSettings, loadLatest, onSaved = () => {}, onDetails = () => {}, onNeis = () => {}, onRoster = () => {}, notify = () => {}}) {
  let savedRecords = copy(records), savedSettings = normalizeExperienceSettings(settings), draftSettings = copy(savedSettings);
  const roster = [...students].sort((a,b) => a.studentId.localeCompare(b.studentId));
  const drafts = new Map(), approvalDrafts = new Map(), newIds = new Map();
  let month = today.slice(0,7), search = '', dates = [], visibleStudents = [], selected = new Set(), anchor = null, busy = false, destroyed = false, lastError = '', dragStart = null, dragged = false;
  let baselineInvalid = new Map(), activeMark = null;
  const controller = new AbortController(), signal = controller.signal;
  const year = () => academicYear(`${month}-01`);
  const isSettingsDirty = () => JSON.stringify(savedSettings) !== JSON.stringify(draftSettings);
  const hasPendingChanges = () => drafts.size > 0 || approvalDrafts.size > 0 || isSettingsDirty() || baselineInvalid.size > 0;
  const q = selector => root.querySelector(selector);
  const qa = selector => [...root.querySelectorAll(selector)];
  const makeId = ({studentId}) => { if (!newIds.has(studentId)) newIds.set(studentId,crypto.randomUUID()); return newIds.get(studentId); };
  function editList() {
    return [...drafts].map(([key, raw]) => ({...splitKey(key), mark:normalizeGridMark(raw)}));
  }
  function projectedRecords() {
    try {
      const projected = new Map(savedRecords.map(record => [record.id,record]));
      for (const item of planGridChanges({records:savedRecords,students:roster,edits:editList(),blockedDates:draftSettings.blockedDates,makeId})) projected.set(item.record.id,item.record);
      return [...projected.values()];
    } catch { return savedRecords; }
  }
  function setError(message = '') {
    lastError = message;
    if(q('[data-grid-error]')) q('[data-grid-error]').textContent = message;
    if(q('[data-grid-recovery]')) q('[data-grid-recovery]').hidden = !message || !hasPendingChanges();
  }
  function infoFor(studentId,date) { return cellInfo(savedRecords,studentId,date); }
  function currentMark(studentId,date) { const key=keyOf(studentId,date); return drafts.has(key) ? drafts.get(key) : infoFor(studentId,date).mark; }
  function cellLabel(student,date) {
    const info = infoFor(student.studentId,date);
    return `${student.studentId} ${nameOf(student)} ${Number(date.slice(5,7))}월 ${Number(date.slice(8))}일${info.conflict?' 중복 기록':info.uncertain?' 날짜 확인 필요':''}`;
  }
  function patchCells() {
    for(const input of qa('[data-grid-cell]')) {
      const key = input.dataset.gridCell, {studentId,date}=splitKey(key), info=infoFor(studentId,date), td=input.closest('td'), raw=currentMark(studentId,date);
      if(document.activeElement!==input) input.value=raw;
      let mark=''; try { mark=normalizeGridMark(raw); } catch { /* Keep invalid drafts visible. */ }
      td.classList.toggle('eg-application',mark==='신'); td.classList.toggle('eg-report',mark==='보');
      td.classList.toggle('eg-dirty',drafts.has(key)); td.classList.toggle('eg-selected',selected.has(key));
      td.classList.toggle('eg-conflict',info.conflict||info.uncertain);
      const approved=Boolean(mark)&&info.records.length>0&&info.records.every(record=>record.approvalStatus==='approved');
      td.classList.toggle('eg-approved',approved);
      input.title=`${input.getAttribute('aria-label')}${approved?' · 초록 점: 승인 완료':''}`;
      input.setAttribute('aria-selected',String(selected.has(key)));
      input.disabled=busy||draftSettings.blockedDates.includes(date);
      input.readOnly=activeMark!==null||info.conflict||info.uncertain;
    }
  }
  function refreshSummary() {
    const projected=projectedRecords(), currentYear=year();
    for(const student of visibleStudents) {
      const row=q(`[data-grid-student="${student.studentId}"]`); if(!row)continue;
      const usage=usageDays({records:projected,studentId:student.studentId,year:currentYear,baseline:draftSettings.baselineDays[String(currentYear)]?.[student.studentId]||0});
      row.querySelector('[data-grid-total]').textContent=String(usage.total);
      row.querySelector('[data-grid-remaining]').textContent=String(usage.remaining);
      row.querySelector('[data-grid-remaining]').classList.toggle('eg-over',usage.overLimit);
      row.querySelector('[data-grid-total]').title=usage.uncertainRecords.length?'날짜를 확정하지 않은 기존 기록이 있습니다. 상세에서 날짜를 선택해 주세요.':`${currentYear}학년도 신청·보고서 날짜 중복 없이 계산`;
    }
    const count=selected.size;
    q('[data-grid-selection]').textContent=activeMark!==null?`${activeMark==='신'?'신청서':activeMark==='보'?'보고서':'지우기'} 선택됨 · 날짜를 누르거나 드래그하세요`:count?`${count}칸 선택`:'먼저 신청서·보고서를 선택하세요';
    for(const button of qa('[data-grid-mark]')) { button.disabled=busy; button.setAttribute('aria-pressed',String(button.dataset.gridMark===activeMark)); }
    const pending=drafts.size+approvalDrafts.size;
    q('[data-grid-save-state]').textContent=busy?'저장 중…':hasPendingChanges()?`${pending?`${pending}칸 · `:''}저장 전`:'저장됨';
    q('[data-grid-save]').disabled=busy||!hasPendingChanges();
    q('[data-grid-approve]').disabled=busy||!count;
    q('[data-grid-neis]').disabled=busy;
    q('[data-grid-detail]').disabled=busy||!count;
    patchCells();
  }
  function tableHtml() {
    const groups=[];
    for(const date of dates){const group=groups.at(-1);if(group?.month===date.slice(0,7))group.count++;else groups.push({month:date.slice(0,7),count:1});}
    const currentYear=year();
    return `<table class="eg-table" aria-label="학생별 체험학습 날짜 입력표"><thead><tr><th class="eg-fixed eg-number" rowspan="3" scope="col">번호</th><th class="eg-fixed eg-name" rowspan="3" scope="col">이름</th><th class="eg-fixed eg-baseline" rowspan="3" scope="col">기존<br>사용일</th><th class="eg-fixed eg-total" rowspan="3" scope="col">누적</th><th class="eg-fixed eg-remaining" rowspan="3" scope="col">남은<br>일수</th>${groups.map(group=>`<th colspan="${group.count}" scope="colgroup" class="eg-month">${group.month.slice(0,4)}년 ${Number(group.month.slice(5))}월</th>`).join('')}</tr><tr>${dates.map(date=>`<th scope="col" class="eg-date ${draftSettings.blockedDates.includes(date)?'eg-blocked':''} ${date===today?'eg-today':''}"><span>${Number(date.slice(8))}</span><small>${weekday(date)}</small></th>`).join('')}</tr><tr>${dates.map(date=>`<th class="eg-exclusion ${draftSettings.blockedDates.includes(date)?'eg-blocked':''}"><button type="button" data-grid-block="${date}" aria-label="${esc(date)} ${draftSettings.blockedDates.includes(date)?'제외 해제':'시험·행사일 제외'}" aria-pressed="${draftSettings.blockedDates.includes(date)}" title="시험·행사일 제외 · X">${draftSettings.blockedDates.includes(date)?'X':'·'}</button></th>`).join('')}</tr></thead><tbody>${visibleStudents.map(student=>`<tr data-grid-student="${student.studentId}"><th scope="row" class="eg-fixed eg-number" title="${student.studentId}">${Number(student.number||student.studentId.slice(3))}</th><th scope="row" class="eg-fixed eg-name" title="${student.studentId}">${esc(nameOf(student))}<small>${student.studentId}</small></th><td class="eg-fixed eg-baseline"><input type="text" inputmode="numeric" data-grid-baseline="${student.studentId}" aria-label="${esc(nameOf(student))} ${currentYear}학년도 기존 사용 일수" value="${esc(baselineInvalid.get(`${currentYear}|${student.studentId}`)??draftSettings.baselineDays[String(currentYear)]?.[student.studentId]??0)}" autocomplete="off"></td><td class="eg-fixed eg-total" data-grid-total>0</td><td class="eg-fixed eg-remaining" data-grid-remaining>20</td>${dates.map(date=>{const info=infoFor(student.studentId,date),blocked=draftSettings.blockedDates.includes(date);return `<td class="eg-cell ${blocked?'eg-blocked':''} ${date===today?'eg-today':''}"><input type="text" data-grid-cell="${keyOf(student.studentId,date)}" aria-label="${esc(cellLabel(student,date))}" title="${esc(cellLabel(student,date))}" value="${esc(currentMark(student.studentId,date))}" ${blocked?'disabled':''} ${info.conflict||info.uncertain?'readonly':''} autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2"></td>`;}).join('')}</tr>`).join('')}</tbody></table>${!visibleStudents.length?'<div class="eg-no-match">검색한 학생이 없습니다.</div>':''}`;
  }
  function renderTable({keepScroll=false}={}) {
    const scroll=q('[data-grid-scroll]'), left=keepScroll?scroll.scrollLeft:0,top=keepScroll?scroll.scrollTop:0;
    dates=gridDates(month,2); visibleStudents=roster.filter(student=>`${student.studentId} ${nameOf(student)}`.includes(search.trim()));
    scroll.innerHTML=tableHtml(); scroll.scrollLeft=left;scroll.scrollTop=top;
    q('[data-grid-year]').textContent=`${year()}학년도 · 20일 기준`;
    q('[data-grid-month]').value=month;
    refreshSummary();
  }
  function selectCell(key,event={}) {
    const point=splitKey(key);
    if(event.shiftKey&&anchor){
      selected=new Set(rectangleCells(visibleStudents,dates,anchor,point,draftSettings.blockedDates).map(p=>keyOf(p.studentId,p.date)));
    }else if(event.ctrlKey||event.metaKey){if(selected.has(key))selected.delete(key);else selected.add(key);anchor=point;}
    else {selected=new Set([key]);anchor=point;}
    refreshSummary();
  }
  function applyValues(entries) {
    const normalized=entries.map(({studentId,date,mark})=>({studentId,date,mark:normalizeGridMark(mark)}));
    for(const entry of normalized){
      const info=infoFor(entry.studentId,entry.date);
      if(draftSettings.blockedDates.includes(entry.date))throw new Error('시험·행사일로 제외된 날짜입니다. 위의 X를 해제하면 입력할 수 있습니다.');
      if(info.conflict||info.uncertain)throw new Error('날짜가 불분명하거나 겹친 기록입니다. 해당 칸을 선택하고 상세에서 먼저 확인해 주세요.');
    }
    const combined=new Map(drafts);
    for(const entry of normalized){const key=keyOf(entry.studentId,entry.date);if(infoFor(entry.studentId,entry.date).mark===entry.mark)combined.delete(key);else combined.set(key,entry.mark);}
    // Validate the whole paste/bulk edit before modifying any draft.
    planGridChanges({records:savedRecords,students:roster,edits:[...combined].map(([key,mark])=>({...splitKey(key),mark:normalizeGridMark(mark)})),blockedDates:draftSettings.blockedDates,makeId});
    drafts.clear();for(const [key,value]of combined)drafts.set(key,value);
    for(const entry of normalized){const input=q(`[data-grid-cell="${keyOf(entry.studentId,entry.date)}"]`);if(input)input.value=entry.mark;}
    setError();refreshSummary();
  }
  function updateInput(input) {
    if(input.readOnly||input.disabled||busy)return;
    const key=input.dataset.gridCell,{studentId,date}=splitKey(key),raw=input.value;
    try{applyValues([{studentId,date,mark:raw}]);input.removeAttribute('aria-invalid');}
    catch(error){drafts.set(key,raw);input.setAttribute('aria-invalid','true');setError(error.message);refreshSummary();}
  }
  function absorbSnapshot(snapshot) {
    if(snapshot?.records)savedRecords=copy(snapshot.records);
    onSaved(snapshot);
  }
  function clearSavedEdits(item,editMap) {
    const affected=new Set([...(item.record.attendanceDates||[]),...(item.before?.attendanceDates||[])]);
    for(const [key]of editMap){const entry=splitKey(key);if(entry.studentId===item.record.studentId&&affected.has(entry.date))editMap.delete(key);}
  }
  function setBusy(value) {
    busy=value;
    qa('button,input').forEach(control=>control.disabled=value);
    if(!value){qa('[data-grid-block],[data-grid-baseline]').forEach(control=>control.disabled=false);refreshSummary();}
    else q('[data-grid-save-state]').textContent='저장 중…';
  }
  async function savePending() {
    if(busy)return false;
    if(!hasPendingChanges())return true;
    let plans;
    try{
      if(baselineInvalid.size)throw new Error('기존 사용 일수는 0~366 사이의 정수로 입력해 주세요.');
      plans=planGridChanges({records:savedRecords,students:roster,edits:editList(),blockedDates:draftSettings.blockedDates,makeId});
      normalizeExperienceSettings(draftSettings);
    }catch(error){setError(error.message);return false;}
    setError();setBusy(true);
    let successes=0;
    try {
      if(isSettingsDirty()){
        const proposed=copy(draftSettings),snapshot=await saveSettings(proposed,copy(savedSettings));
        savedSettings=normalizeExperienceSettings(snapshot?.experienceSettings||proposed);draftSettings=copy(savedSettings);absorbSnapshot(snapshot);successes++;
      }
      for(const item of plans){
        const snapshot=await saveRecord(copy(item.record),item.before?copy(item.before):null);
        if(!snapshot?.records){savedRecords=savedRecords.filter(record=>record.id!==item.record.id);savedRecords.push(copy(item.record));}
        absorbSnapshot(snapshot);clearSavedEdits(item,drafts);if(!item.before)newIds.delete(item.record.studentId);successes++;
      }
      // Approval is an explicit action, kept separate from ordinary mark entry.
      const approvals=planGridChanges({records:savedRecords,students:roster,edits:[...approvalDrafts].map(([key])=>({...splitKey(key),mark:undefined})),blockedDates:draftSettings.blockedDates,makeId,approve:true});
      for(const item of approvals){
        const snapshot=await saveRecord(copy(item.record),item.before?copy(item.before):null);
        if(!snapshot?.records){savedRecords=savedRecords.filter(record=>record.id!==item.record.id);savedRecords.push(copy(item.record));}
        absorbSnapshot(snapshot);clearSavedEdits(item,approvalDrafts);successes++;
      }
      // No-op edits/approvals do not produce a transaction.
      drafts.clear();approvalDrafts.clear();newIds.clear();notify('체험학습 표를 저장했습니다.');return true;
    }catch(error){
      setError(error.status===409?'다른 기기에서 내용이 바뀌었습니다. 저장하지 못한 입력은 이 표에 남겨 두었습니다. 최신 기록을 확인한 후 다시 저장해 주세요.':`${successes?'일부 내용은 저장되었습니다. ':''}${error.message||'저장하지 못했습니다.'} 남은 입력은 유지했습니다. 다시 저장해 주세요.`);return false;
    }finally{setBusy(false);renderTable({keepScroll:true});setError(lastError);}
  }
  async function reloadLatest() {
    if(busy||typeof loadLatest!=='function')return;
    setBusy(true);
    try {
      const snapshot=await loadLatest();
      if(!Array.isArray(snapshot?.records))throw new Error('최신 기록을 불러오지 못했습니다. 다시 시도해 주세요.');
      const latestSettings=normalizeExperienceSettings(snapshot.experienceSettings||{}), merged=copy(latestSettings);
      // Rebase only settings the teacher changed, preserving other devices' edits.
      const oldBlocked=new Set(savedSettings.blockedDates), ownBlocked=new Set(draftSettings.blockedDates), mergedBlocked=new Set(merged.blockedDates);
      for(const date of new Set([...oldBlocked,...ownBlocked]))if(oldBlocked.has(date)!==ownBlocked.has(date)){
        if(ownBlocked.has(date))mergedBlocked.add(date);else mergedBlocked.delete(date);
      }
      merged.blockedDates=[...mergedBlocked].sort();
      for(const y of new Set([...Object.keys(savedSettings.baselineDays),...Object.keys(draftSettings.baselineDays)])){
        const previous=savedSettings.baselineDays[y]||{}, mine=draftSettings.baselineDays[y]||{};
        for(const id of new Set([...Object.keys(previous),...Object.keys(mine)]))if(previous[id]!==mine[id]){
          merged.baselineDays[y]??={};
          if(Object.hasOwn(mine,id))merged.baselineDays[y][id]=mine[id];else delete merged.baselineDays[y][id];
        }
      }
      const overlaps=[];
      for(const [key,raw]of drafts){
        const {studentId,date}=splitKey(key), old=cellInfo(savedRecords,studentId,date), latest=cellInfo(snapshot.records,studentId,date);
        if(old.mark!==latest.mark||old.conflict!==latest.conflict)overlaps.push(`${studentId} ${date}: 서버 ${latest.conflict?'중복 기록':latest.mark||'빈칸'} / 내 입력 ${raw||'빈칸'}`);
      }
      for(const date of latestSettings.blockedDates)if(!oldBlocked.has(date)&&[...drafts.keys()].some(key=>splitKey(key).date===date))overlaps.push(`${date}: 서버 제외일 X / 내 입력 있음`);
      draftSettings=normalizeExperienceSettings(merged);savedSettings=latestSettings;savedRecords=copy(snapshot.records);
      onSaved(snapshot);
      setError(`${overlaps.slice(0,10).join('\n')}${overlaps.length>10?`\n외 ${overlaps.length-10}건`:''}${overlaps.length?'\n':''}최신 내용과 내 입력을 확인하고 변경 저장을 눌러주세요.`);
    }catch(error){setError(error.message||'최신 내용을 불러오지 못했습니다. 내 입력은 유지했습니다.');}
    finally{setBusy(false);renderTable({keepScroll:true});setError(lastError);}
  }
  function discardDrafts() {
    if(busy)return;
    drafts.clear();approvalDrafts.clear();newIds.clear();baselineInvalid.clear();draftSettings=copy(savedSettings);
    setError();renderTable({keepScroll:true});notify('저장 전 입력만 취소했습니다. 저장된 기록은 유지했습니다.');
  }
  function selectedRecords() {
    const byId=new Map(),datesByRecord={};
    for(const key of selected){const {studentId,date}=splitKey(key),info=infoFor(studentId,date);
      if(info.conflict||info.uncertain)throw new Error('겹치거나 날짜가 불분명한 칸은 상세에서 먼저 확인해 주세요.');
      for(const record of info.records){byId.set(record.id,record);(datesByRecord[record.id]??=[]).push(date);}
    }
    for(const id of Object.keys(datesByRecord))datesByRecord[id]=[...new Set(datesByRecord[id])].sort();
    return {records:[...byId.values()].map(copy),datesByRecord};
  }
  async function approveSelected() {
    if(!selected.size||busy)return;
    if(!await savePending())return;
    try{
      const chosen=selectedRecords();if(!chosen.records.length)throw new Error('신청서나 보고서를 입력한 날짜 칸을 선택해 주세요.');
      for(const [id,chosenDates]of Object.entries(chosen.datesByRecord)){const record=chosen.records.find(record=>record.id===id);for(const date of chosenDates)approvalDrafts.set(keyOf(record.studentId,date),true);}
      await savePending();
    }catch(error){setError(error.message);}
  }
  function toggleBlocked(date) {
    if(busy)return;
    try{
      const blocked=draftSettings.blockedDates.includes(date);
      if(!blocked&&[...savedRecords,...projectedRecords()].some(record=>record.category==='experience'&&!['cancelled','rejected'].includes(record.approvalStatus)&&record.attendanceDates?.includes(date)))throw new Error('이미 체험학습이 입력된 날짜입니다. 해당 날짜의 기록을 지우고 저장한 뒤 제외해 주세요.');
      draftSettings.blockedDates=blocked?draftSettings.blockedDates.filter(value=>value!==date):[...draftSettings.blockedDates,date].sort();
      for(const key of selected)if(splitKey(key).date===date)selected.delete(key);
      setError();renderTable({keepScroll:true});
    }catch(error){setError(error.message);}
  }
  root.innerHTML=`<section class="experience-grid" aria-label="체험학습 간편 입력"><header class="eg-heading"><div><h3>체험학습 한눈에 입력</h3><p>날짜 칸에 <span class="eg-legend eg-application">신</span> 신청서 · <span class="eg-legend eg-report">보</span> 보고서</p></div><span class="eg-year" data-grid-year></span></header><div class="eg-navigation"><div class="eg-month-picker"><button type="button" class="btn small" data-grid-prev aria-label="이전 달">‹</button><label><span class="hidden">시작 월</span><input type="month" data-grid-month value="${month}" aria-label="표 시작 월"></label><button type="button" class="btn small" data-grid-next aria-label="다음 달">›</button></div><input type="search" class="eg-search" data-grid-search placeholder="이름·학번 검색" aria-label="학생 이름·학번 검색"></div>${roster.length?`<div class="eg-toolbar"><div class="eg-mark-tools"><button type="button" class="btn small eg-mark-application" data-grid-mark="신">신청서</button><button type="button" class="btn small eg-mark-report" data-grid-mark="보">보고서</button><button type="button" class="btn small" data-grid-mark="">지우기</button><span class="eg-selection" data-grid-selection></span></div><div class="eg-action-tools"><button type="button" class="btn small" data-grid-detail>상세</button><button type="button" class="btn small" data-grid-approve>선택 승인</button><button type="button" class="btn small" data-grid-neis>나이스 입력</button><button type="button" class="btn small primary" data-grid-save>변경 저장</button></div></div><div class="eg-scroll" data-grid-scroll tabindex="0" aria-label="좌우로 넘기는 체험학습 날짜 표"></div><footer class="eg-footer"><p>기존 사용일: 이 표에 입력하지 않은 사용일수 · 날짜 위 <strong>X</strong>: 시험·행사일 제외 · 초록 점: 승인 완료</p><span data-grid-save-state role="status"></span></footer><p class="eg-hint">신청서·보고서·지우기 선택 후 날짜를 누르거나 드래그하세요 · 선택한 버튼을 다시 누르면 선택 해제 · 여러 학생·날짜는 드래그 또는 Shift+클릭 · 나이스 입력은 전체 미입력분만 전송 · 엑셀 붙여넣기 가능 · 0 / O / ㅇ 입력도 ‘보’로 표시</p>${roster.some(student=>Object.values(student.experienceBaseline||{}).some(Number))?'<p class="eg-legacy-note">이전의 ‘횟수’ 기록은 남겨 두었습니다. 기존 사용일수는 일수로 입력해 주세요.</p>':''}`:`<div class="eg-empty"><strong>명렬표를 등록하면 날짜 표가 열립니다.</strong><p>학생별로 신청서와 보고서를 한 번에 관리하세요.</p><button type="button" class="btn primary" data-grid-roster>명렬표 등록</button></div>`}<p class="eg-error" data-grid-error role="alert"></p><div class="eg-recovery" data-grid-recovery hidden>${typeof loadLatest==='function'?'<button type="button" class="btn small" data-grid-reload>최신 내용 불러오기</button>':''}<button type="button" class="btn small" data-grid-discard>내 입력 취소</button></div></section>`;
  bindStudentMatcher({inputs:[q('[data-grid-search]')],students:roster,autoSelectId:false,onSelect:student=>{q('[data-grid-search]').value=student.studentId;search=student.studentId;selected.clear();anchor=null;renderTable();}});
  function changeMonth(next){if(busy)return;try{gridDates(next,2);month=next;selected.clear();anchor=null;renderTable();setError();}catch(error){q('[data-grid-month]').value=month;setError(error.message);}}
  root.addEventListener('click',async event=>{
    if(busy)return;
    const cell=event.target.closest('[data-grid-cell]');
    if(cell&&activeMark!==null&&!cell.disabled&&!dragged){try{applyValues([...selected].map(key=>({...splitKey(key),mark:activeMark})));}catch(error){setError(error.message);}return;}
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-grid-prev'))changeMonth(shiftMonth(month,-1));
    else if(button.hasAttribute('data-grid-next'))changeMonth(shiftMonth(month,1));
    else if(button.hasAttribute('data-grid-block'))toggleBlocked(button.dataset.gridBlock);
    else if(button.hasAttribute('data-grid-mark')){activeMark=activeMark===button.dataset.gridMark?null:button.dataset.gridMark;selected.clear();anchor=null;setError();refreshSummary();}
    else if(button.hasAttribute('data-grid-save'))await savePending();
    else if(button.hasAttribute('data-grid-reload'))await reloadLatest();
    else if(button.hasAttribute('data-grid-discard'))discardDrafts();
    else if(button.hasAttribute('data-grid-approve'))await approveSelected();
    else if(button.hasAttribute('data-grid-roster')){if(await savePending())onRoster();}
    else if(button.hasAttribute('data-grid-detail')){
      if(!await savePending())return;
      const selectedInfos=[...selected].map(key=>{const p=splitKey(key);return infoFor(p.studentId,p.date);});
      const chosen=[...new Map(selectedInfos.flatMap(info=>info.records).map(record=>[record.id,record])).values()];
      if(chosen.length===1)onDetails(copy(chosen[0]));else setError(chosen.length?'기록이 여러 개 선택되었습니다. 겹친 기록은 신청서·보고서 목록에서 수정해 주세요.':'입력된 날짜 칸을 선택해 주세요.');
    }else if(button.hasAttribute('data-grid-neis')){
      if(!await savePending())return;
      try{await onNeis({records:copy(savedRecords.filter(r=>r.category==='experience')),allPending:true});}catch(error){setError(error.message);}
    }
  },{signal});
  root.addEventListener('change',event=>{if(event.target.matches('[data-grid-month]'))changeMonth(event.target.value);},{signal});
  root.addEventListener('input',event=>{
    const input=event.target;if(busy)return;
    if(input.hasAttribute('data-grid-search')){search=input.value;selected.clear();anchor=null;renderTable();}
    else if(input.hasAttribute('data-grid-baseline')){
      const id=input.dataset.gridBaseline,currentYear=String(year()),raw=input.value.trim(),key=`${currentYear}|${id}`;
      if(!/^\d{1,3}$/.test(raw)||Number(raw)>366){baselineInvalid.set(key,raw);input.setAttribute('aria-invalid','true');setError('기존 사용 일수는 0~366 사이의 정수로 입력해 주세요.');}
      else{baselineInvalid.delete(key);input.removeAttribute('aria-invalid');draftSettings.baselineDays[currentYear]??={};draftSettings.baselineDays[currentYear][id]=Number(raw);setError();}
      refreshSummary();
    }else if(input.hasAttribute('data-grid-cell')&&!event.isComposing)updateInput(input);
  },{signal});
  root.addEventListener('compositionend',event=>{if(event.target.hasAttribute('data-grid-cell'))updateInput(event.target);},{signal});
  root.addEventListener('pointerdown',event=>{
    const input=event.target.closest('[data-grid-cell]');if(!input||input.disabled||busy)return;
    if(activeMark!==null)event.preventDefault();
    dragStart=input.dataset.gridCell;dragged=false;selectCell(dragStart,event);
  },{signal});
  root.addEventListener('pointermove',event=>{
    if(!dragStart||event.buttons!==1||event.pointerType==='touch')return;
    const input=event.target.closest('[data-grid-cell]');if(!input||input.disabled)return;
    const from=splitKey(dragStart),to=splitKey(input.dataset.gridCell);if(from.studentId===to.studentId&&from.date===to.date)return;
    dragged=true;anchor=from;selectCell(input.dataset.gridCell,{shiftKey:true});
  },{signal});
  document.addEventListener('pointerup',event=>{
    if(dragStart&&dragged&&activeMark!==null&&!busy){try{applyValues([...selected].map(key=>({...splitKey(key),mark:activeMark})));}catch(error){setError(error.message);}}
    const input=event.target.closest?.('[data-grid-cell]');if(input&&root.contains(input)&&!dragged&&activeMark===null)input.select();dragStart=null;
  },{signal});
  root.addEventListener('focusin',event=>{const input=event.target;if(input.hasAttribute('data-grid-cell')){if(!selected.has(input.dataset.gridCell)&&!dragged)selectCell(input.dataset.gridCell);input.select();}},{signal});
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&activeMark!==null){activeMark=null;refreshSummary();return;}
    const input=event.target;if(!input.hasAttribute('data-grid-cell')||busy||event.isComposing)return;
    const point=splitKey(input.dataset.gridCell),row=visibleStudents.findIndex(student=>student.studentId===point.studentId),column=dates.indexOf(point.date);
    const movement={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0],Enter:[1,0]};
    if(movement[event.key]){
      event.preventDefault();const [r,c]=movement[event.key],student=visibleStudents[row+r],date=dates[column+c];
      if(student&&date){const next=q(`[data-grid-cell="${keyOf(student.studentId,date)}"]`);if(next&&!next.disabled){selectCell(next.dataset.gridCell,event);next.focus();next.select();}}
    }else if(['Delete','Backspace'].includes(event.key)&&selected.size>1){event.preventDefault();try{applyValues([...selected].map(key=>({...splitKey(key),mark:''})));}catch(error){setError(error.message);}}
  },{signal});
  root.addEventListener('paste',event=>{
    const input=event.target;if(!input.hasAttribute('data-grid-cell')||busy)return;
    event.preventDefault();try{
      const text=event.clipboardData?.getData('text/plain')||'';if(text.length>20000)throw new Error('붙여넣을 표가 너무 큽니다. 현재 보이는 두 달씩 나누어 붙여넣어 주세요.');
      const rows=text.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(row=>row.split('\t'));
      const point=splitKey(input.dataset.gridCell),startRow=visibleStudents.findIndex(student=>student.studentId===point.studentId),startColumn=dates.indexOf(point.date);
      if(startRow+rows.length>visibleStudents.length||rows.some(row=>startColumn+row.length>dates.length))throw new Error('현재 표의 학생·날짜 범위를 넘었습니다. 붙여넣을 범위를 줄여 주세요.');
      const entries=rows.flatMap((row,r)=>row.map((mark,c)=>({studentId:visibleStudents[startRow+r].studentId,date:dates[startColumn+c],mark})));
      applyValues(entries);selected=new Set(entries.map(entry=>keyOf(entry.studentId,entry.date)));refreshSummary();
    }catch(error){setError(error.message);}
  },{signal});
  if(roster.length)renderTable();
  else{q('[data-grid-year]').textContent=`${year()}학년도 · 20일 기준`;q('[data-grid-prev]').disabled=true;q('[data-grid-next]').disabled=true;q('[data-grid-month]').disabled=true;q('[data-grid-search]').disabled=true;}
  return {destroy(){if(destroyed)return;destroyed=true;controller.abort();root.innerHTML='';},hasPendingChanges,savePending,isBusy:()=>busy};
}

