const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const md=date=>{const d=new Date(date+'T12:00:00Z');return `${Number(date.slice(5,7))}/${Number(date.slice(8))}(${'일월화수목금토'[d.getUTCDay()]})`;};
/** 교사가 한 건씩 체크할 수 있는 상세 미제출 목록. 학생별로 묶고, 학생 안에서는 날짜순입니다. */
export function parentReportPrintHtml(items,imports,today,records=[]){
  const byId=new Map(records.map(record=>[record.id,record]));
  const missing=items.filter(row=>row.status==='missing').sort((a,b)=>a.studentId.localeCompare(b.studentId)||a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind));
  const students=[...new Set(missing.map(row=>row.studentId))];
  const scopes=Object.entries(imports||{}).map(([key,value])=>(key==='absence'?'결석':'지각·조퇴·결과')+' '+md(value.start)+'~'+md(value.end)).join(' / ');
  let body='';
  for(const id of students){
    const rows=missing.filter(row=>row.studentId===id);
    rows.forEach((row,index)=>{
      const record=byId.get(row.recordId)||{},due=row.deadline?`${md(row.deadline.dueDate)}<br><small>${esc(row.deadline.label)}</small>`:'확인';
      body+=`<tr class="${index===0?'first':''}">`
        +`<td class="check">☐</td>`
        +(index===0?`<td class="who" rowspan="${rows.length}"><b>${esc(row.studentName)}</b><br><small>${esc(row.studentId)}${rows.length>1?` · ${rows.length}건`:''}</small></td>`:'')
        +`<td class="date">${md(row.date)}</td>`
        +`<td class="kind">${esc(row.kind)}</td>`
        +`<td class="type">${esc(record.reasonType||'')}</td>`
        +`<td class="periods">${esc(row.kind==='결석'?'전일':record.periods||'')}</td>`
        +`<td class="reason">${esc(row.reason||record.reason||'')}</td>`
        +`<td class="due">${due}</td>`
        +`<td class="memo"></td></tr>`;
    });
  }
  const table=missing.length?`<table><thead><tr><th class="check">확인</th><th class="who">학생</th><th class="date">날짜</th><th class="kind">종류</th><th class="type">구분</th><th class="periods">교시</th><th class="reason">사유</th><th class="due">제출기한</th><th class="memo">메모</th></tr></thead><tbody>${body}</tbody></table>`:'<p class="empty">미제출 확인이 필요한 학생이 없습니다.</p>';
  return '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><title>학부모 신고서 미제출 확인</title><link rel="stylesheet" href="/src/notebook-parent-report-print.css"></head><body>'
    +`<header><h1>학부모 신고서 미제출 확인</h1><p><b>${esc(today)} 기준 · ${students.length}명 / ${missing.length}건</b>${scopes?` · 나이스 조회기간 ${esc(scopes)}`:''}</p><p class="note">미인정 제외 · 제출기한은 결석·지각 등 다음 날부터 주말 제외 5일 · 종이로 받은 신고서는 ☐에 체크하세요.</p></header>`
    +table+'</body></html>';
}
export function printParentReports(items,imports,today,records=[]){
  const frame=document.createElement('iframe');frame.className='parent-report-print-frame';frame.title='신고서 미제출 명단 출력';
  frame.onload=async()=>{
    await frame.contentDocument.fonts.ready;
    frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});
    frame.contentWindow.focus();frame.contentWindow.print();
    setTimeout(()=>frame.remove(),60000);
  };
  frame.srcdoc=parentReportPrintHtml(items,imports,today,records);document.body.append(frame);
}
