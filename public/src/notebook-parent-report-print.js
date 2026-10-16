const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** One row per student, earliest deadline first; the complete vector fits one A4 page. */
export function parentReportPrintHtml(items,imports,today){
  const students=new Map();
  for(const item of items.filter(row=>row.status==='missing').sort((a,b)=>(a.deadline?.dueDate||a.date).localeCompare(b.deadline?.dueDate||b.date)||a.date.localeCompare(b.date))){
    if(!students.has(item.studentId))students.set(item.studentId,{...item,count:0});
    students.get(item.studentId).count++;
  }
  const rows=[...students.values()],columns=rows.length>20?2:1,perColumn=Math.ceil(rows.length/columns),height=Math.max(400,210+perColumn*76);
  const text=(x,y,value,size=23,weight=400,max=1060)=>{
    const width=[...String(value)].reduce((sum,char)=>sum+(/[\u3000-\uffff]/.test(char)?size:size*.58),0);
    return '<text x="'+x+'" y="'+y+'" font-size="'+size+'" font-weight="'+weight+'"'+(width>max?' textLength="'+max+'" lengthAdjust="spacingAndGlyphs"':'')+'>'+esc(value)+'</text>';
  };
  const scopes=Object.entries(imports).map(([key,value])=>(key==='absence'?'결석':'지각·조퇴·결과')+' '+value.start.slice(5).replace('-','/')+'~'+value.end.slice(5).replace('-','/')).join(' / ');
  let svg='<svg xmlns="http://www.w3.org/2000/svg" width="190mm" height="270mm" viewBox="0 0 1100 '+height+'" preserveAspectRatio="xMinYMin meet" font-family="Malgun Gothic, Noto Sans CJK KR, sans-serif" fill="#111"><rect width="1100" height="'+height+'" fill="#fff"/>';
  svg+=text(12,40,'학부모 신고서 미제출 확인',32,700)+text(12,76,today+' 기준 · '+rows.length+'명 / '+items.filter(row=>row.status==='missing').length+'건',22);
  svg+=text(12,108,scopes,18)+text(12,139,'미인정 제외 · 주말 제외 5일 · 조회조건·종이 제출 여부 확인',18);
  svg+=text(12,169,'여러 건이면 가장 이른 제출기한을 표시합니다.',17);
  rows.forEach((row,index)=>{
    const column=Math.floor(index/perColumn),line=index%perColumn,x=12+column*550,y=212+line*76;
    const due=row.deadline?row.deadline.label+' · '+row.deadline.dueDate.slice(5).replace('-','/')+'까지':'기한 확인';
    svg+=text(x,y,row.studentName+'  '+row.studentId,24,700,columns===1?1060:515)+text(x+(columns===1?550:260),y+29,due,21,700,columns===1?500:255);
    svg+=text(x,y+29,row.date.slice(5).replace('-','/')+' '+row.kind+(row.count>1?' 외 '+(row.count-1)+'건':''),19);
    svg+='<path d="M'+x+' '+(y+46)+' H'+(x+(columns===1?1060:515))+'" stroke="#ccc" stroke-width="1"/>';
  });
  if(!rows.length)svg+=text(12,220,'미제출 확인이 필요한 학생이 없습니다.',24);
  svg+='</svg>';
  return '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><title>학부모 신고서 미제출 확인</title><link rel="stylesheet" href="/src/notebook-parent-report-print.css"></head><body>'+svg+'</body></html>';
}
export function printParentReports(items,imports,today){
  const frame=document.createElement('iframe');frame.className='parent-report-print-frame';frame.title='신고서 미제출 명단 출력';
  frame.onload=async()=>{
    await frame.contentDocument.fonts.ready;
    frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});
    frame.contentWindow.focus();frame.contentWindow.print();
    setTimeout(()=>frame.remove(),60000);
  };
  frame.srcdoc=parentReportPrintHtml(items,imports,today);document.body.append(frame);
}
