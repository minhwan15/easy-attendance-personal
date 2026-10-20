import { bindStudentMatcher } from './student-matcher.js';
import { normalizeRoster, parseRosterText, exportRosterTemplate } from './notebook-roster.js';
import { recognizeFiles } from './notebook-ocr.js';
import { rosterTextFromSpreadsheet } from './notebook-roster-file.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));

/** Private roster editor. Imports remain editable until the teacher saves. */
export function openRosterManager({ students = [], save, onSaved, onClosed, accountId = '', classId = '', loadLatest, demo = false }) {
  const classHint = /^([1-3])(\d{2})$/.exec(String(classId || accountId || '')), hintGrade = classHint ? classHint[1] : '', hintClass = classHint && Number(classHint[2]) ? String(Number(classHint[2])) : '';
  students=[...students].sort((a,b)=>a.studentId.localeCompare(b.studentId));
  let original = clone(students);
  let rows = clone(students), controller = null, busy = false, warnings = [], importWarnings = [], omitted = [];
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog roster-dialog';
  dialog.setAttribute('aria-labelledby', 'roster-title');
  dialog.innerHTML = `<div class="dialog-head"><div><h2 id="roster-title">우리 반 명렬표</h2><p>등록한 이름·학번으로 캡처의 학생을 대조합니다.</p></div><button type="button" class="icon-btn" id="roster-close" aria-label="명렬표 닫기">×</button></div>
    <div class="roster-body"><div class="roster-actions"><strong id="roster-server-status"></strong>${!demo&&loadLatest?'<button type="button" class="btn small" id="roster-reload">서버 명렬표 다시 불러오기</button>':''}</div><div class="section-info">명렬표를 올리면 학생 목록으로 정리합니다. 틀린 곳만 고치고 저장하세요.</div>
    <div class="roster-actions"><button type="button" class="btn" id="roster-template">CSV 양식 다운로드</button><button type="button" class="btn primary" id="roster-upload">명렬표 파일·캡처 올리기</button><input id="roster-files" type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,image/jpeg,image/png,image/webp,application/pdf" multiple hidden></div>
    <details class="neis-roster-guide" open><summary>나이스 명렬표 파일로 한 번에 등록</summary><ol><li>나이스 → <b>[학적]</b> → <b>[기본학적관리]</b> → <b>[명렬표출력]</b></li><li>학년·반을 고르고 <b>조회</b> → <b>명렬표 내용 선택</b>에서 필요한 항목(번호·성명, 필요하면 학번) 선택 → 엑셀 파일 다운로드</li><li>받은 엑셀 파일을 위 <b>명렬표 파일·캡처 올리기</b>로 <b>그대로</b> 선택 → 목록 확인 후 저장</li></ol><p>번호·성명만 있어도 됩니다. 제목 줄의 학년·반 또는 이 반 계정(${esc(hintGrade&&hintClass?`${hintGrade}학년 ${hintClass}반`:'아래 설정')})으로 학번을 만듭니다. 엑셀 표를 복사해 아래 칸에 붙여넣어도 됩니다. 파일이 열리지 않으면 엑셀에서 CSV나 .xlsx로 다시 저장해 올려 주세요.</p></details>
    <p class="helper-note">엑셀(.xlsx)·CSV·사진·PDF를 지원합니다.</p>
    <details class="roster-options"><summary>번호만 있는 자료 · 전체 교체</summary><div class="form-grid three roster-defaults"><div class="field"><label for="roster-grade">학년이 생략된 자료의 학년</label><select id="roster-grade"><option value="">직접 선택</option><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select></div><div class="field"><label for="roster-class">반이 생략된 자료의 반</label><input id="roster-class" type="number" min="1" max="99" placeholder="예: 8"></div><div class="field"><label for="roster-mode">불러오기 방식</label><select id="roster-mode"><option value="merge">기존 명렬표에 추가·수정</option><option value="replace">불러온 명렬표로 교체</option></select></div></div></details>
    <div class="field"><label for="roster-text">명렬표 붙여넣기 · 캡처에서 읽은 내용</label><textarea id="roster-text" rows="5" placeholder="학번,이름&#10;30801,김예시&#10;30802,이예시"></textarea><small>학번과 이름만 입력하세요. 학년·반·번호는 학번에서 자동으로 처리합니다.</small></div>
    <div class="roster-actions"><button type="button" class="btn soft" id="roster-parse">명렬표 내용 정리</button><span id="roster-progress" role="status"></span><button type="button" class="text-btn" id="roster-cancel-ocr" hidden>글자 읽기 중단</button></div>
    <div id="roster-warnings" aria-live="polite"></div>
    <div class="roster-table-heading"><h3>저장할 명렬표 <span id="roster-count"></span></h3><button type="button" class="btn small" id="roster-add">학생 한 명 추가</button></div>
    <div class="roster-table-wrap"><table class="roster-table"><thead><tr><th>학번</th><th>이름</th><th>제외</th></tr></thead><tbody id="roster-rows"></tbody></table></div>
    <p class="helper-note">같은 이름은 학번으로 구분합니다.</p>
    <div id="roster-error" class="form-error" role="alert"></div></div>
    <div class="dialog-footer"><span class="save-state">${demo ? '예시 모드 · 서버 저장 없음' : '내 출결함에 저장 · 연결한 폰·PC에서 사용'}</span><button type="button" class="btn" id="roster-cancel">취소</button><button type="button" class="btn primary" id="roster-save">명렬표 저장</button></div>`;
  document.body.append(dialog);
  const el = id => dialog.querySelector(`#${id}`);
  if (hintGrade && hintClass) { el('roster-grade').value = hintGrade; el('roster-class').value = hintClass; }
  if(globalThis.easyProfile){el('roster-grade').value=globalThis.easyProfile.grade;el('roster-class').value=globalThis.easyProfile.classNumber;}
  function setBusy(value) {
    busy = value;
    for (const id of ['roster-upload','roster-parse','roster-save','roster-add','roster-reload']) if(el(id))el(id).disabled = value;
    dialog.querySelectorAll('.roster-body input,.roster-body select,.roster-body textarea,[data-remove]').forEach(control=>{control.disabled=value;});
    el('roster-cancel-ocr').hidden = !controller;
  }
  function renderWarnings() {
    el('roster-warnings').innerHTML = `${warnings.length ? `<ul class="extraction-warnings">${warnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>` : ''}${omitted.length ? `<details class="roster-omitted" open><summary>정리하지 못한 행 ${omitted.length}개 — 원본에서 확인해 추가해 주세요</summary><pre>${esc(omitted.map(x=>typeof x==='string'?x:JSON.stringify(x)).join('\n'))}</pre></details>` : ''}`;
  }
  function updateSavedStatus(){
    const dirty=JSON.stringify(rows)!==JSON.stringify(original);
    el('roster-server-status').textContent=demo?'예시 모드 · 서버 저장 없음':`${accountId} 계정 · 서버 ${original.length}명${dirty?' · 변경 내용 저장 전':''}`;
    el('roster-save').textContent=demo?'예시 명렬표 저장':'폰·PC에 명렬표 저장';
  }
  function renderRows() {
    updateSavedStatus();
    el('roster-count').textContent = `${rows.length}명`;
    el('roster-rows').innerHTML = rows.length ? rows.map((row,i)=>`<tr data-row="${i}">${['studentId','studentName'].map((key,j)=>`<td><input data-cell="${key}" aria-label="${i+1}행 ${['학번','이름'][j]}" value="${esc(row[key])}" maxlength="${key==='studentName'?40:key==='studentId'?5:2}" ${key==='studentName'?'':'inputmode="numeric"'}></td>`).join('')}<td><button type="button" class="text-btn" data-remove="${i}" aria-label="${i+1}행 학생 제외">×</button></td></tr>`).join('') : '<tr><td colspan="3" class="roster-empty">아직 등록된 학생이 없습니다. 명렬표를 불러오거나 학생을 추가해 주세요.</td></tr>';
    el('roster-rows').querySelectorAll('input').forEach(input=>input.oninput=()=>{
      const tr=input.closest('tr'), row=rows[Number(tr.dataset.row)], key=input.dataset.cell,previousId=String(row.studentId||'');
      row[key]=input.value.trim();
      if(key==='studentId') {
        delete row.grade;delete row.classNumber;delete row.number;
      }
      updateSavedStatus();
      if(String(row.studentId||'')!==previousId){
        const match=original.find(student=>String(student.studentId)===String(row.studentId))||rows.find(student=>student!==row&&String(student.studentId)===String(row.studentId));
        if(match?.experienceBaseline)row.experienceBaseline=clone(match.experienceBaseline);else delete row.experienceBaseline;
      }
    });
    for(const tr of el('roster-rows').querySelectorAll('[data-row]'))bindStudentMatcher({inputs:[tr.querySelector('[data-cell="studentName"]')],students:()=>original,autoSelectId:false,onSelect:student=>{
      const row=rows[Number(tr.dataset.row)];Object.assign(row,clone(student));tr.querySelector('[data-cell="studentId"]').value=student.studentId;tr.querySelector('[data-cell="studentName"]').value=student.studentName;updateSavedStatus();
    }});
    el('roster-rows').querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{rows.splice(Number(button.dataset.remove),1);renderRows();});
  }
  function parse() {
    try {
      const result=parseRosterText(el('roster-text').value,{defaultGrade:el('roster-grade').value||undefined,defaultClass:el('roster-class').value||undefined});
      warnings=[...importWarnings,...(result.warnings||[])];omitted=result.unparsedLines||[];
      if(!result.students.length){renderWarnings();el('roster-error').textContent='학생을 정리하지 못했습니다. 학년·반을 지정하거나 표의 내용을 직접 수정해 주세요.';return;}
      const baselineById=new Map([...original,...rows].filter(row=>row.experienceBaseline).map(row=>[String(row.studentId),clone(row.experienceBaseline)]));
      const imported=result.students.map(student=>({...clone(student),...(baselineById.has(String(student.studentId))?{experienceBaseline:baselineById.get(String(student.studentId))}:{})}));
      if(el('roster-mode').value==='replace')rows=imported.sort((a,b)=>a.studentId.localeCompare(b.studentId));
      else {
        const merged=new Map(rows.map(row=>[String(row.studentId),row]));
        for(const row of imported){const previous=merged.get(row.studentId);if(previous&&previous.studentName!==row.studentName)warnings.push(`${row.studentId}: 이름을 ‘${previous.studentName}’에서 ‘${row.studentName}’으로 바꾸는 초안입니다. 원본을 확인해 주세요.`);merged.set(row.studentId,clone(row));}
        rows=[...merged.values()].sort((a,b)=>a.studentId.localeCompare(b.studentId));
      }
     el('roster-error').textContent='';renderRows();renderWarnings();
    } catch(error){el('roster-error').textContent=error.message;}
  }
  function close() {
    if(busy&&!controller)return;
    if(controller&&!confirm('명렬표 읽기를 중단하고 닫을까요?'))return;
    if(JSON.stringify(rows)!==JSON.stringify(original)&&!confirm('저장하지 않은 명렬표 변경이 있습니다. 닫을까요?'))return;
    controller?.abort();dialog.close();dialog.remove();onClosed?.();
  }
  el('roster-close').onclick=close;el('roster-cancel').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  el('roster-parse').onclick=parse;
  el('roster-add').onclick=()=>{if(rows.length>=1000){el('roster-error').textContent='명렬표는 1000명까지 등록할 수 있습니다.';return;}rows.push({studentId:'',studentName:''});renderRows();};
  el('roster-template').onclick=()=>{
    const blob=new Blob([exportRosterTemplate()],{type:'text/csv;charset=utf-8'}), url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='명렬표_업로드양식.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  el('roster-upload').onclick=()=>el('roster-files').click();
  el('roster-cancel-ocr').onclick=()=>controller?.abort();
  el('roster-files').onchange=async event=>{
    const files=[...event.target.files];if(!files.length)return;
    if(files.length>5){el('roster-error').textContent='한 번에 파일 5개까지 선택해 주세요.';return;}
    controller=new AbortController();const active=controller;setBusy(true);warnings=[];importWarnings=[];omitted=[];el('roster-error').textContent='';
    try {
      const snippets=[],images=[];
      for(const file of files) {
        if(/\.(xlsx|xls)$/i.test(file.name)) {
          if(file.size>10*1024*1024)throw new Error('명렬표 엑셀 파일은 10MB 이하로 올려 주세요.');
          snippets.push(await rosterTextFromSpreadsheet(await file.arrayBuffer()));
        } else if(/\.(csv|tsv|txt)$/i.test(file.name)) {
          if(file.size>1024*1024)throw new Error('명렬표 텍스트 파일은 1MB 이하로 올려 주세요.');
          const bytes=await file.arrayBuffer();let text=new TextDecoder('utf-8').decode(bytes);
          if(text.includes('\ufffd')){text=new TextDecoder('euc-kr').decode(bytes);warnings.push('한글 인코딩을 변환했습니다. 이름을 확인해 주세요.');}
          snippets.push(text);
        } else images.push(file);
      }
      if(images.length){const result=await recognizeFiles(images,{purpose:'roster',signal:active.signal,onProgress:p=>{el('roster-progress').textContent=p.message||'명렬표를 읽고 있습니다.';}});snippets.push(result.text);warnings.push(...result.warnings);}
      if(active.signal.aborted||!dialog.isConnected)return;
      importWarnings=[...warnings];el('roster-text').value=snippets.join('\n\n');parse();el('roster-progress').textContent='불러오기 완료';
    } catch(error){if(dialog.isConnected)el('roster-error').textContent=active.signal.aborted?'읽기를 중단했습니다. 표를 붙여넣거나 다시 올릴 수 있습니다.':error.message;}
    finally{if(controller===active)controller=null;if(dialog.isConnected){setBusy(false);el('roster-files').value='';}}
  };
  el('roster-reload')?.addEventListener('click',async()=>{
    if(busy)return;
    if(JSON.stringify(rows)!==JSON.stringify(original)){el('roster-error').textContent='변경한 명렬표를 먼저 저장해 주세요.';return;}
    try{setBusy(true);el('roster-error').textContent='';const latest=await loadLatest();original=clone(latest.students||[]).sort((a,b)=>a.studentId.localeCompare(b.studentId));rows=clone(original);renderRows();}
    catch(error){el('roster-error').textContent=error.message;}finally{setBusy(false);}
  });
  el('roster-save').onclick=async()=>{
    try {
      const next=normalizeRoster(rows);
      if(original.length&&!next.length&&!confirm('등록한 명렬표를 모두 비울까요? 기존 출결 기록은 유지됩니다.'))return;
      setBusy(true);el('roster-error').textContent='';
      const result=demo?{students:next}:await save(next,original);
      onSaved?.(result);dialog.close();dialog.remove();
    } catch(error){el('roster-error').textContent=error.status===409?'다른 기기에서 명렬표가 바뀌었습니다. 입력 내용은 유지했습니다. 내용을 복사해 두고 최신 명렬표를 다시 불러와 주세요.':error.message;setBusy(false);}
  };
  renderRows();dialog.showModal();
  return dialog;
}


