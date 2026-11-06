import { mailmergeRows, downloadMailmerge, smsBytes } from './notebook-parent-report-mailmerge.js';
import { printParentReports } from './notebook-parent-report-print.js';
import { normalizeReportImports, parseReportTable, compareParentReports } from './notebook-parent-reports.js';
import { readReportWorkbook } from './notebook-report-xlsx.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>JSON.parse(JSON.stringify(value));
const names={absence:'결석 신고서',partial:'지각·조퇴·결과 신고서'};
export function openParentReports({records,today,onOpen}){
  let draft={},busy=false;
  const dialog=document.createElement('dialog');dialog.className='dialog parent-reports-dialog';
  dialog.setAttribute('aria-labelledby','parent-reports-title');
  dialog.innerHTML='<div class="dialog-head"><div><h2 id="parent-reports-title">학부모 신고서 제출 확인</h2><p>앱 출결 기록과 나이스에서 내려받은 신고서를 대조합니다.</p></div><button class="icon-btn" type="button" data-pr-close aria-label="닫기">×</button></div><div class="parent-reports-body"><div class="parent-reports-upload"><button class="btn primary" type="button" data-pr-upload>나이스 신고서 엑셀 올리기</button><input type="file" accept=".xlsx" multiple data-pr-files hidden><span>결석 / 지각·조퇴·결과 파일을 함께 선택할 수 있습니다.</span></div><p class="helper-note">나이스 신고서 관리 화면에서 조회기간과 처리상태 ‘전체’를 선택한 뒤, ‘자료 내려받기’로 받은 엑셀을 올려 주세요. 종이로 받은 신고서는 별도로 확인하세요.</p><div data-pr-sources></div><p data-pr-error class="form-error" role="alert"></p><p data-pr-note role="status">엑셀은 저장하지 않습니다. 올린 뒤 조회기간을 확인하세요.</p><button class="btn primary" type="button" data-pr-print disabled>미제출 명단 상세 출력</button><div class="parent-report-source"><div data-pr-mailmerge></div><a class="btn soft" href="https://riroschool.kr/" target="_blank" rel="noopener noreferrer">리로스쿨 열기 ↗</a><p>로그인 → 알림문자 → 메일머지 문자 → 엑셀 업로드 → 학부모 체크 → 미리보기</p></div><div data-pr-results></div></div>';
  document.body.append(dialog);dialog.showModal();
  const $=selector=>dialog.querySelector(selector);
  function lock(value){busy=value;dialog.querySelectorAll('button,input').forEach(e=>e.disabled=value);if(!value){$('[data-pr-print]').disabled=!Object.keys(draft).length;const button=$('[data-pr-download]');if(button)button.disabled=!dialog.querySelector('[data-pr-recipient]:checked');}}
  const close=()=>{if(busy)return;dialog.close();dialog.remove();};
  $('[data-pr-close]').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  function rowsHtml(items,description){
    return '<p class="parent-report-description">'+esc(description)+'</p>'+(items.length?'<div class="parent-report-list">'+items.map(item=>'<article class="parent-report-row"><div><strong>'+esc(item.studentName)+' <small>'+esc(item.studentId)+'</small></strong>'+(item.deadline?'<span class="parent-report-deadline '+(item.deadline.overdue?'is-overdue':'')+'">'+esc(item.deadline.label)+' · '+esc(item.deadline.dueDate.slice(5).replace('-','/'))+'까지</span>':'')+'<p>'+esc(item.date)+' · '+esc(item.kind)+' · '+esc(item.reason)+'</p><small>'+esc(item.detail)+'</small></div><button type="button" class="btn small" data-pr-record="'+esc(item.recordId)+'">기록 보기</button></article>').join('')+'</div>':'<p class="parent-report-empty">해당 기록이 없습니다.</p>');
  }
  /** 대조표: 왼쪽 앱 출결, 오른쪽 나이스 신고서. 짝이 없으면 한쪽이 빈칸입니다. */
  function matchTable(report){
    if(!Object.keys(draft).length)return '';
    const md=date=>Number(date.slice(5,7))+'/'+Number(date.slice(8))+'('+'일월화수목금토'[new Date(date+'T12:00:00Z').getUTCDay()]+')';
    const byId=new Map(records.map(r=>[r.id,r]));
    const rows=[...report.items.map(item=>{const r=byId.get(item.recordId)||{};return {date:item.date,id:item.studentId,name:item.studentName,kind:item.kind,
        left:esc((r.reasonType||'')+' '+item.kind)+(item.reason?' · '+esc(item.reason):''),
        right:item.status==='missing'?'':item.status==='check'?'<span class="pr-warn">'+esc(item.detail)+'</span>':esc((item.reportType?item.reportType+' ':'')+item.kind)+' · <b>'+esc(item.reportStatus||item.detail)+'</b>',
        state:item.status,deadline:item.deadline};}),
      ...report.unmatched.flatMap(row=>row.missingDates.map(date=>({date,id:row.studentId,name:row.studentName,kind:row.kind,left:'',right:esc((row.reasonType?row.reasonType+' ':'')+row.kind)+' · <b>'+esc(row.status)+'</b>',state:'noRecord'})))]
      .sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)||a.kind.localeCompare(b.kind));
    const label={received:'✓ 접수',submitted:'✓ 제출',check:'확인',missing:'미제출',noRecord:'앱 기록 없음'};
    const count=key=>rows.filter(r=>r.state===key).length;
    return '<section class="pr-match"><h3>일일출결 ↔ 학부모 신고서 대조표</h3><p class="parent-report-description">같은 줄에 양쪽이 다 있으면 등록 완료, 한쪽이 빈칸이면 확인이 필요합니다. · 등록 '+(count('received')+count('submitted'))+' · 미제출 '+count('missing')+' · 앱 기록 없음 '+count('noRecord')+(count('check')?' · 확인 '+count('check'):'')+'</p>'
      +(rows.length?'<div class="pr-match-wrap"><table class="pr-match-table"><thead><tr><th>날짜</th><th>학생</th><th>일일출결(앱)</th><th>학부모 신고서(나이스)</th><th>상태</th></tr></thead><tbody>'
      +rows.map(r=>'<tr class="pr-'+r.state+'"><td>'+md(r.date)+'</td><td><b>'+esc(r.name)+'</b> <small>'+esc(r.id)+'</small></td><td>'+(r.left||'<span class="pr-empty">—</span>')+'</td><td>'+(r.right||'<span class="pr-empty">—</span>')+'</td><td><span class="pr-chip">'+label[r.state]+'</span>'+(r.deadline?'<small class="'+(r.deadline.overdue?'is-overdue':'')+'"> '+esc(r.deadline.label)+'</small>':'')+'</td></tr>').join('')
      +'</tbody></table></div>':'<p class="parent-report-description">조회기간에 대조할 기록이 없습니다.</p>')+'</section>';
  }
  function results(){
    const report=compareParentReports(records,draft,today),groups={missing:[],submitted:[],received:[],check:[]};
    report.items.forEach(item=>groups[item.status].push(item));
    $('[data-pr-print]').disabled=busy||!Object.keys(draft).length;
    const mergeRows=mailmergeRows(report.items,today);
    $('[data-pr-mailmerge]').innerHTML='<button class="btn primary" type="button" data-pr-download '+(mergeRows.length<2?'disabled':'')+'>미제출 안내 메일머지 엑셀 다운로드</button><p class="helper-note">보낼 학생만 체크하세요. 개별 문자는 안내문을 눌러 복사하세요.</p>'+(mergeRows.length>1?'<details open><summary>발송 대상·안내문 ('+(mergeRows.length-1)+'명)</summary>'+mergeRows.slice(1).map(row=>'<div class="parent-report-source"><label><input type="checkbox" data-pr-recipient="'+esc(row[0])+'" checked> '+esc(row[0])+'</label><button class="btn soft" type="button" data-pr-copy="'+esc(row[0])+'">'+esc(row[1])+'</button><p data-pr-copy-status="'+esc(row[0])+'" role="status">'+smsBytes(row[1])+'바이트 · '+(smsBytes(row[1])>90?'장문 예상':'단문 예상')+' · 누르면 복사</p></div>').join('')+'</details>':'');
    dialog.querySelectorAll('[data-pr-copy]').forEach(button=>button.onclick=async()=>{
      const row=mergeRows.find(row=>row[0]===button.dataset.prCopy),status=dialog.querySelector('[data-pr-copy-status="'+button.dataset.prCopy+'"]');
      try{await navigator.clipboard.writeText(row[1]);status.textContent='복사했습니다. 문자 앱에 붙여넣으세요.';}
      catch{status.textContent='복사하지 못했습니다. 안내문을 길게 눌러 복사하세요.';}
    });
    const selectedRows=()=>[mergeRows[0],...mergeRows.slice(1).filter(row=>dialog.querySelector('[data-pr-recipient="'+row[0]+'"]').checked)];
    dialog.querySelectorAll('[data-pr-recipient]').forEach(input=>input.onchange=()=>{$('[data-pr-download]').disabled=selectedRows().length<2;});
    $('[data-pr-download]').onclick=()=>{const rows=selectedRows();if(!busy&&rows.length>1)downloadMailmerge(rows,today);};

    const table=matchTable(report);
    $('[data-pr-results]').innerHTML=table+'<p class="parent-report-description">오늘까지의 앱 출결 중 업로드한 종류·조회기간에 해당하는 기록만 대조합니다. 미인정은 제외합니다. 대학별고사·체험학습도 제외합니다.</p><section class="parent-report-missing"><h3>미제출 확인 필요 <span>'+groups.missing.length+'건</span></h3>'+rowsHtml(groups.missing,'엑셀에 신고서가 없습니다. 출결일 다음 평일부터 5일 이내 제출 · 주말 제외. 조회조건과 종이 제출 여부를 확인하세요.')+'</section><details class="parent-report-group"><summary>제출됨 · 접수대기 '+groups.submitted.length+'건</summary>'+rowsHtml(groups.submitted,'학부모가 제출한 신고서입니다. 미제출 명단에서 제외합니다.')+'</details><details class="parent-report-group"><summary>접수됨 '+groups.received.length+'건</summary>'+rowsHtml(groups.received,'엑셀에서 접수 상태가 확인됩니다. 일일출결 입력 완료 여부와는 별개입니다.')+'</details><details class="parent-report-group"><summary>반려·취소·이름 확인 '+groups.check.length+'건</summary>'+rowsHtml(groups.check,'제출 상태 또는 학생 이름을 확인하세요.')+'</details>'+(report.unmatched.length?'<section class="parent-report-missing"><h3>앱 출결 기록 누락 확인 <span>'+report.unmatched.length+'건</span></h3><p class="parent-report-description">신고서는 있지만 해당 날짜·종류의 앱 출결 기록이 없습니다. 빠뜨린 기록인지 확인하세요.</p><div class="parent-report-list">'+report.unmatched.map(row=>'<article class="parent-report-row"><div><strong>'+esc(row.studentName)+' <small>'+esc(row.studentId)+'</small></strong><p>'+row.missingDates.map(date=>esc(date)).join(' · ')+' · '+esc(row.kind)+'</p><small>신고서 상태: '+esc(row.status)+'</small></div></article>').join('')+'</div></section>':'');
    dialog.querySelectorAll('[data-pr-record]').forEach(button=>button.onclick=()=>{const record=records.find(r=>r.id===button.dataset.prRecord);close();if(record)onOpen(record);});
  }
  function render(){
    $('[data-pr-sources]').innerHTML=['absence','partial'].map(key=>{
      const source=draft[key];
      if(!source)return '<div class="parent-report-source"><strong>'+names[key]+'</strong><p>엑셀 미업로드 · 이 종류의 미제출 여부는 아직 대조하지 않습니다.</p></div>';
      return '<div class="parent-report-source"><strong>'+names[key]+' · '+source.rows.length+'건</strong><p>'+esc(source.name)+' · '+esc(source.importedAt.slice(0,10))+' 업로드</p><div class="parent-report-period"><label>엑셀 조회 시작일<input type="date" value="'+source.start+'" data-pr-period="'+key+'" data-pr-bound="start"></label><label>종료일<input type="date" value="'+source.end+'" data-pr-period="'+key+'" data-pr-bound="end"></label></div></div>';
    }).join('');
    dialog.querySelectorAll('[data-pr-period]').forEach(input=>input.onchange=()=>{
      const source=draft[input.dataset.prPeriod],previous=source[input.dataset.prBound];source[input.dataset.prBound]=input.value;
      try{normalizeReportImports(draft);$('[data-pr-error]').textContent='';results();}
      catch(error){source[input.dataset.prBound]=previous;input.value=previous;$('[data-pr-error]').textContent=error.message;}
    });
    results();
  }
  $('[data-pr-upload]').onclick=()=>$('[data-pr-files]').click();
  $('[data-pr-files]').onchange=async event=>{
    const files=[...event.target.files];event.target.value='';if(!files.length)return;
    if(files.length>2){$('[data-pr-error]').textContent='종류별 엑셀 1개씩, 최대 2개를 선택하세요.';return;}
    lock(true);$('[data-pr-error]').textContent='';
    try{
      const next=clone(draft),seen=new Set();
      for(const file of files){
        if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>10*1024*1024)throw Error('10MB 이하 .xlsx 파일을 선택하세요.');
        const tables=await readReportWorkbook(await file.arrayBuffer());
        const table=tables.find(rows=>rows.some(row=>row.some(cell=>String(cell).replace(/\s+/g,'')==='진행상태')&&row.some(cell=>String(cell).trim()==='성명')));
        if(!table)throw Error('나이스 신고서관리 엑셀 형식이 아닙니다: '+file.name);
        const parsed=parseReportTable(table,file.name);
        if(seen.has(parsed.key))throw Error('같은 종류의 엑셀을 두 개 선택했습니다. 종류별 최신 파일 하나를 선택하세요.');
        seen.add(parsed.key);next[parsed.key]=parsed.snapshot;
      }
      draft=normalizeReportImports(next);render();
    }catch(error){$('[data-pr-error]').textContent=error.message;}
    finally{lock(false);}
  };
  $('[data-pr-print]').onclick=()=>{if(!busy)printParentReports(compareParentReports(records,draft,today).items,draft,today,records);};
  render();
}
