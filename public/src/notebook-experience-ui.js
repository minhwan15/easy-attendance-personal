import { academicYear, experienceUsage } from './notebook-experience-usage.js';
import { normalizeRoster } from './notebook-roster.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>JSON.parse(JSON.stringify(value));
const limitLabel=usage=>usage.total>20?`${usage.total-20}회 초과`:usage.total===20?'한도 도달':'';
const usageTotalHtml=usage=>`<strong>${usage.used}/20회</strong><small>남은 ${usage.remaining}회${usage.reserved?` · 예정 포함 잔여 ${usage.remainingAfterReserved}회`:''}</small>${limitLabel(usage)?`<small class="usage-limit">${limitLabel(usage)}</small>`:''}`;

export function experienceUsageNote({record,records=[],students=[],today}) {
  if(!record?.studentId||!record.startDate)return '';
  const year=academicYear(record.startDate);
  const student=students.find(student=>student.studentId===record.studentId);
  const usage=experienceUsage({records:[...records.filter(item=>item.id!==record.id),record],studentId:record.studentId,year,today,baseline:student?.experienceBaseline||0});
  return `<span class="${usage.overLimit?'usage-over':''}">${year}학년도 · 누적 ${usage.used}/20회 · 남은 ${usage.remaining}회${usage.reserved?` · 예정 ${usage.reserved}회 (예정 포함 잔여 ${usage.remainingAfterReserved}회)`:''}${limitLabel(usage)?` · ${limitLabel(usage)}`:''}</span>`;
}

export function experienceUsageHtml({records=[],students=[],year,today}) {
  const years=new Set([year,academicYear(today)-1,academicYear(today),academicYear(today)+1]);
  for(const record of records)if(record.category==='experience'&&record.startDate)years.add(academicYear(record.startDate));
  for(const student of students)for(const key of Object.keys(student.experienceBaseline||{}))years.add(Number(key));
  const ordered=[...students].sort((a,b)=>a.studentId.localeCompare(b.studentId));
  return `<section class="experience-usage" aria-labelledby="experience-usage-title"><header class="usage-heading"><div><h3 id="experience-usage-title">학생별 체험학습 횟수</h3><p>관리 기준 연 20회 · 신청 1건을 1회로 계산</p></div><label class="usage-year"><span class="hidden">체험학습 학년도</span><select id="experience-year" aria-label="체험학습 학년도">${[...years].filter(Number.isInteger).sort((a,b)=>b-a).map(value=>`<option value="${value}" ${value===year?'selected':''}>${value}학년도</option>`).join('')}</select></label></header>
    <p class="usage-period">${year}년 3월 ~ ${year+1}년 2월 · 승인된 신청을 계산합니다.</p><p class="usage-baseline-label">기존 횟수에는 <strong>앱에 등록하지 않은 기존 사용 횟수</strong>만 입력하세요.</p>
    <div class="usage-table-wrap"><table class="usage-table"><thead><tr><th>학생</th><th>기존 횟수</th><th>앱 사용</th><th>누적 / 남은 횟수</th><th>예정</th></tr></thead><tbody>${ordered.length?ordered.map(student=>{
      const usage=experienceUsage({records,studentId:student.studentId,year,today,baseline:student.experienceBaseline||0});
      return `<tr data-usage-student="${esc(student.studentId)}"><th scope="row"><strong>${esc(student.studentName||student.name)}</strong><small>${esc(student.studentId)}</small></th><td><input data-experience-baseline="${esc(student.studentId)}" type="number" min="0" max="999" step="1" value="${usage.baseline}" inputmode="numeric" aria-label="${esc(student.studentId)} ${esc(student.studentName||student.name)} 기존 사용 횟수"></td><td>${usage.registeredUsed}회</td><td data-usage-total="${esc(student.studentId)}" class="${usage.overLimit?'usage-over':''}">${usageTotalHtml(usage)}</td><td><strong>${usage.reserved}회</strong>${usage.pending?`<small>승인 대기 ${usage.pending}건</small>`:''}</td></tr>`;
    }).join(''):'<tr><td colspan="5" class="usage-empty">명렬표를 등록하면 학생별 횟수를 관리할 수 있습니다.</td></tr>'}</tbody></table></div>
    <div class="usage-footer"><p>미승인·취소는 제외하며, 승인된 미래 일정은 예정으로 표시합니다.</p><button class="btn small primary" type="button" id="experience-baseline-save" hidden>기존 횟수 저장</button></div><div id="experience-baseline-error" class="form-error" role="alert"></div></section>`;
}

export function bindExperienceUsage({root=document,records=[],students=[],knownStudents=students,year,today,onYearChange,save,onSaved,notify=()=>{}}) {
  const yearSelect=root.querySelector('#experience-year');
  if(!yearSelect)return;
  const button=root.querySelector('#experience-baseline-save'),errorBox=root.querySelector('#experience-baseline-error');
  const changed=new Map();
  let busy=false;
  yearSelect.onchange=()=>{
    if(changed.size&&!confirm('저장하지 않은 기존 횟수가 있습니다. 학년도를 바꿀까요?')){yearSelect.value=year;return;}
    onYearChange(Number(yearSelect.value));
  };
  const controls=[...root.querySelectorAll('[data-experience-baseline]')];
  for(const control of controls)control.oninput=()=>{
    changed.set(control.dataset.experienceBaseline,control.value);button.hidden=false;errorBox.textContent='';
    if(!control.validity.valid||!/^\d+$/.test(control.value))return;
    const usage=experienceUsage({records,studentId:control.dataset.experienceBaseline,year,today,baseline:Number(control.value)});
    const total=root.querySelector(`[data-usage-total="${control.dataset.experienceBaseline}"]`);
    total.classList.toggle('usage-over',usage.overLimit);total.innerHTML=usageTotalHtml(usage);
  };
  button.onclick=async()=>{
    if(busy)return;
    try{
      const next=new Map(students.map(student=>[student.studentId,clone(student)]));
      for(const [id,value]of changed){
        if(!/^\d+$/.test(value)||Number(value)>999)throw new Error('기존 사용 횟수는 0~999 사이의 정수로 입력해 주세요.');
        const matched=next.get(id)||knownStudents.find(student=>student.studentId===id);
        if(!matched)throw new Error('학생 정보를 확인해 주세요.');
        const student=clone(matched);
        student.experienceBaseline={...(student.experienceBaseline||{}),[year]:Number(value)};next.set(id,student);
      }
      const normalized=normalizeRoster([...next.values()]);
      busy=true;button.disabled=true;button.textContent='저장 중…';yearSelect.disabled=true;controls.forEach(input=>{input.disabled=true;});
      const result=await save(normalized,clone(students));
      changed.clear();onSaved(result);notify(`${year}학년도 기존 사용 횟수를 저장했습니다.`);
    }catch(error){
      errorBox.textContent=error.status===409?'다른 기기에서 명렬표가 변경되었습니다. 입력한 횟수는 유지했습니다. 최신 명렬표를 불러온 뒤 다시 저장해 주세요.':error.message;
    }finally{
      busy=false;button.disabled=false;button.textContent='기존 횟수 저장';yearSelect.disabled=false;controls.forEach(input=>{input.disabled=false;});
    }
  };
}
