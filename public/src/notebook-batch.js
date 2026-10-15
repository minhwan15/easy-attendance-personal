import { bindStudentMatcher } from './student-matcher.js';
import { emptyRecord, normalizeRecord, parseSourceText, contentReadiness } from './notebook-model.js';

export function parseAttendanceTable(text,{students=[],referenceDate,sourceType='capture'}={}) {
  text=String(text||'');if(text.length>30000)throw new Error('원문은 30000자 이내로 입력해 주세요.');
  text=text.replace(/\\~/g,'~').split(/\r?\n/).filter(line=>!/^\s*\|\s*\|\s*$/.test(line)&&!/^\s*\|?\s*[-:]+\s*\|?\s*$/.test(line)).map(line=>line.includes('|')?line.replace(/^\s*\||\|\s*$/g,'').replace(/\|/g,'\t'):line).join('\n');
  text=text.replace(/^[ \t]*접수[ \t]+(?:상신[ \t]*(?:\([ \t]*진행[ \t]*\))?|완결|진행)[ \t]+20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}[ \t]+(?=[1-3]\s+\d{1,2}\s+\d{1,2}\s+[가-힣]{2,10}\s+20\d{2}[.\-/])/gm,'');
  const pattern=/^[ \t]*(?:([1-3])\s+(\d{1,2})\s+(\d{1,2})|([1-3]\d{4}))\s+([가-힣]{2,10})\s+(?=20\d{2}[.\-/])/gm;
  const starts=[...text.matchAll(pattern)];if(!starts.length)return [];
  if(starts.length>100)throw new Error('한 번에 학생별 자료 100건까지 정리할 수 있습니다.');
  return starts.map((match,index)=>{
    const source=text.slice(match.index,starts[index+1]?.index??text.length).trim();
    const studentId=match[4]||`${match[1]}${match[2].padStart(2,'0')}${match[3].padStart(2,'0')}`,studentName=match[5];
    const body=source.slice(match[0].trimStart().length);
    const dates=[...body.matchAll(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/g)];
    const date=m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    const kind=/(출석\s*인정|인정|질병|미인정|기타)\s*(결석|지각|조퇴|결과)/.exec(body);
    const reason=kind?body.slice(kind.index+kind[0].length).trim().replace(/생리\s+통/g,'생리통').replace(/\s+/g,' '):'';
    const parsed=parseSourceText(`학번 ${studentId}\n성명 ${studentName}\n${body}`,{students,referenceDate});
    const fields={...emptyRecord(),...parsed.fields,studentId,studentName,classNumber:Number(studentId.slice(1,3)),number:Number(studentId.slice(3)),sourceText:source,sourceType:sourceType==='memo'?'memo':'capture',category:'attendance',startDate:dates[0]?date(dates[0]):'',endDate:dates[1]?date(dates[1]):dates[0]?date(dates[0]):'',reason,attendanceDates:[],reviewStatus:'draft',entryStatus:'pending'};
    if(kind){fields.attendanceType=kind[2];fields.reasonType=/인정/.test(kind[1])&&!/미인정/.test(kind[1])?'출석인정':kind[1];}
    if(fields.attendanceType==='결석')fields.periods='';
    return {fields,sourceText:source,warnings:parsed.warnings};
  });
}

export function prepareBatchRecord(fields,{id,students=[]}={}) {
  const studentId=String(fields.studentId||'').trim();
  const record=normalizeRecord({...fields,id,studentId,classNumber:Number(studentId.slice(1,3))||'',number:Number(studentId.slice(3))||'',periods:fields.attendanceType==='결석'?'':fields.periods,entryStatus:'pending',neisConfirmedDates:[]});
  const known=students.filter(s=>s.studentId===studentId);
  if(known.length&&known.some(s=>s.studentName!==record.studentName))throw new Error(`${studentId} 이름이 명렬표와 다릅니다. 이름 또는 학번을 수정해 주세요.`);
  return normalizeRecord({...record,reviewStatus:contentReadiness(record).ready?'reviewed':'draft'});
}

export function openBatchEditor({dialog,candidates,attachments=[],students=[],escape,save,findDuplicate,onSaved,onBack,notify}) {
  const rows=candidates.map(c=>({...c.fields,id:crypto.randomUUID(),attachments}));
  const labels={studentId:'학번',studentName:'이름',startDate:'시작일',endDate:'종료일',attendanceType:'출결',reasonType:'사유 구분',reason:'사유',periods:'빠진 교시'};
  const input=(row,key,type='text')=>`<input type="${type}" data-key="${key}" aria-label="${escape(row.studentName)} ${labels[key]}" value="${escape(row[key]||'')}" ${key==='studentId'?'maxlength="5"':''}>`;
  const select=(row,key,values)=>`<select data-key="${key}" aria-label="${escape(row.studentName)} ${labels[key]}">${['',...values].map(v=>`<option value="${v}" ${row[key]===v?'selected':''}>${v||'선택'}</option>`).join('')}</select>`;
  dialog.className='dialog batch-dialog';
  dialog.innerHTML=`<div class="dialog-head"><div><h2>학생별 출결 ${rows.length}건</h2><p>내용을 수정하고 한 번에 저장하세요.</p></div><button type="button" class="icon-btn" id="batch-close" aria-label="닫기">×</button></div><form id="batch-form"><div class="batch-dialog-body"><div class="batch-table-scroll"><table class="batch-attendance-table"><thead><tr><th>학번</th><th>이름</th><th>시작일</th><th>종료일</th><th>출결</th><th>사유 구분</th><th>사유</th><th>빠진 교시</th></tr></thead><tbody>${rows.map((row,i)=>`<tr data-batch-row="${i}"><td>${input(row,'studentId')}</td><td>${input(row,'studentName')}</td><td>${input(row,'startDate','date')}</td><td>${input(row,'endDate','date')}</td><td>${select(row,'attendanceType',['결석','지각','조퇴','결과'])}</td><td>${select(row,'reasonType',['질병','출석인정','미인정','기타'])}</td><td>${input(row,'reason')}</td><td>${input(row,'periods')}</td></tr>`).join('')}</tbody></table></div><p class="muted">교시나 실제 출결일이 필요한 기록은 저장 후 기록함에서 이어서 수정합니다.</p><p id="batch-error" class="form-error" role="alert"></p></div><footer class="dialog-footer"><button type="button" class="btn" id="batch-back">원문으로</button><span class="footer-spacer"></span><button class="btn primary" id="batch-save">${rows.length}건 저장</button></footer></form>`;
  const sync=()=>{dialog.querySelectorAll('[data-batch-row]').forEach(tr=>{const row=rows[Number(tr.dataset.batchRow)];tr.querySelectorAll('[data-key]').forEach(el=>row[el.dataset.key]=el.value);});};
  for(const tr of dialog.querySelectorAll('[data-batch-row]'))bindStudentMatcher({inputs:[tr.querySelector('[data-key="studentId"]'),tr.querySelector('[data-key="studentName"]')],students,onSelect:student=>{tr.querySelector('[data-key="studentId"]').value=student.studentId;tr.querySelector('[data-key="studentName"]').value=student.studentName;sync();}});
  const savedIds=new Set();let busy=false;
  const back=()=>{if(!busy){dialog.removeEventListener('cancel',cancel,true);onBack();}};
  const cancel=event=>{event.preventDefault();event.stopImmediatePropagation();back();};
  dialog.addEventListener('cancel',cancel,true);
  dialog.querySelector('#batch-close').onclick=back;
  dialog.querySelector('#batch-back').onclick=back;
  dialog.querySelector('#batch-form').onsubmit=async event=>{
    event.preventDefault();if(busy)return;sync();const button=dialog.querySelector('#batch-save'),error=dialog.querySelector('#batch-error');
    try {
      const records=rows.map(row=>prepareBatchRecord(row,{id:row.id,students}));
      busy=true;button.disabled=true;error.textContent='';let added=0;
      for(const [i,record]of records.entries()) {
        button.textContent=`저장 중 ${i+1}/${records.length}`;
        if(savedIds.has(record.id))continue;
        if(!findDuplicate(record)){await save(record);added++;}
        savedIds.add(record.id);
        dialog.querySelector(`[data-batch-row="${i}"]`).querySelectorAll('input,select').forEach(control=>control.disabled=true);
      }
      dialog.removeEventListener('cancel',cancel,true);onSaved();notify(`${added}건 저장 · 같은 내용의 기존 기록은 중복 저장하지 않았습니다.`);
    }catch(e){error.textContent=e.message;button.disabled=false;button.textContent='남은 기록 저장';}
    finally{busy=false;}
  };
}

