import { bindStudentMatcher } from './student-matcher.js';
import { parseDataset, KINDS, shiftMonth, monthCells, filterEvents, onDay, stats, dateLabel, weekday, todaySeoul, csv } from './model.js';
import { validateEnvelope, decryptDataset } from './secure-data.js';
import { buildEditedEvent, applyEventEdit } from './editor-model.js';
import { calendarWeeks } from './calendar-layout.js';
import { openExamNeis } from './calendar-neis-ui.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#detail-dialog');
const editorDialog = document.querySelector('#editor-dialog');
const state = { data:null, mode:'local', configured:false, classLoginEnabled:false, authenticated:false, notebookAuthenticated:false, classLoginName:'', encrypted:null, checking:true, month:'2026-10', classNumber:'all', query:'', kind:'all', reviewOnly:false, view:'calendar', selected:null, error:'', busy:false, writable:false, revision:null, refreshing:false, syncError:'', lastSynced:null, generation:0 };
let matcherRoster = [];
let editorSession = null;
let detailEventId = null;
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  print:'<path d="M7 8V3h10v5M7 17H3V9h18v8h-4M7 14h10v7H7z"/>',
  arrow:'<path d="m14 6-6 6 6 6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
  logout:'<path d="M9 4H4v16h5M11 12h10m-4-4 4 4-4 4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/>',
  edit:'<path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14z"/>',
};
const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
const chipKind = e => e.kind === '논술' ? 'essay' : e.kind === '실기' || e.kind === '면접·실기' ? 'practical' : 'interview';
const CORRECTION_GUIDE = '명단과 증빙서류가 불일치하는 경우, 증빙서류가 정확한 자료이므로 증빙서류 기준으로 수정 요망.';
const modeText = e => e.dateMode === 'single' ? '단일 일자' : e.dateMode === 'oneOf' ? '기간 중 1일' : '기간 확인 필요';
const dataEvents = () => state.data?.events || [];
const current = () => filterEvents(dataEvents(),state);
const monthTitle = () => `${state.month.slice(0,4)}년 ${Number(state.month.slice(5))}월`;
function notify(message) { const toast=document.querySelector('#toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),4000); }
function dataSource() {return `${state.data.sourceLabel} · 작성 ${state.data.sourceDate}`;}
function writeHint() { return state.mode === 'local' ? '지금 연 파일은 확인용입니다. 다른 선생님과 함께 수정하려면 자료를 닫고 공동 일정에 접속해 주세요.' : '공동 저장 연결이 필요합니다. 관리자가 연결을 완료하면 이 화면에서 추가·수정할 수 있습니다.'; }
function summary() {
  const s=stats(current());
  return `${syncBar()}<div class="stats"><div><span>대상 학생</span><strong>${s.students}<small>명</small></strong></div><div><span>고사 일정</span><strong>${s.events}<small>건</small></strong></div><div><span>개별 고사일 확인</span><strong class="amber">${s.windows}<small>건</small></strong></div><div><span>검토·수정 요망</span><strong class="${s.issues?'red':''}">${s.issues}<small>건</small></strong></div></div>`;
}
function syncBar() {
  if (!state.writable) return `<div class="write-help" id="write-help">${icon('info')}<p>${esc(writeHint())}</p></div>`;
  const time = state.lastSynced ? new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(state.lastSynced) : '';
  return `<div class="sync-bar ${state.syncError?'sync-warning':''}"><p aria-live="polite">${state.syncError?esc(state.syncError):`저장하면 연결한 내 휴대폰·PC에 반영됩니다.${time?` <span>최근 확인 ${time}</span>`:''}`}</p><button class="text-btn" id="refresh-shared" ${state.refreshing?'disabled':''}>${icon('refresh')}${state.refreshing?'확인 중…':'최신 일정 확인'}</button></div>`;
}
function render() {
  const all=dataEvents();
  app.innerHTML=`<a class="skip" href="#main">일정으로 바로가기</a><div class="shell"><aside class="sidebar"><a class="brand" href="/"><span class="personal-brand-mark" aria-hidden="true">✓</span><span>쉬운출결<small>대학별고사 인정결석</small></span></a><div class="side-section">${esc(globalThis.easyProfile?.schoolName||'우리 학교')}</div><nav aria-label="내 반"><button class="class-btn active" data-class="all"><span>${globalThis.easyProfile?.grade||3}학년 ${globalThis.easyProfile?.classNumber||1}반</span><small>${stats(all).students}명</small></button></nav><div class="sidebar-foot">${icon('lock')}<span>교직원 확인용<br><small>학생 자료 외부 공유 금지</small></span></div></aside><main id="main"><header class="topbar"><div class="breadcrumb">쉬운출결 <span>/</span> 대학별고사 인정결석</div><div class="header-tools"><a class="text-btn notebook-link" href="/notebook.html">홈으로</a><span class="mode-pill ${state.writable?'shared':''}">${state.data?(state.writable?'내 출결함 · 자동 갱신':state.mode==='server'?'교직원 공유 자료':state.mode==='local'?'이 기기에서만 열람':'검토된 일정 · 열람'):'자료 불러오기'}</span>${state.data||state.authenticated?`<button class="text-btn" id="clear-data">${icon('logout')}<span>${state.authenticated?'로그아웃':'자료 닫기'}</span></button>`:''}</div></header><section class="page-head"><div><div class="eyebrow">HOMEROOM CALENDAR</div><h1>${state.classNumber==='all'?'우리 반 고사 일정':`3학년 ${state.classNumber}반 고사 일정`}</h1><p>대학별 고사로 인한 출결 처리 대상자 확인</p></div><div class="head-actions">${state.data?`<button class="btn primary" id="add-event" ${state.writable?'':'disabled aria-describedby="write-help"'}>${icon('plus')}일정 추가</button><button class="btn" id="export">${icon('download')}목록 저장</button><button class="btn" id="print">${icon('print')}인쇄</button>`:''}</div></section>${state.data?content():welcome()}<footer>정왕고 김민환 · 출결 인정 여부는 학교 기준 및 실제 응시일·증빙 확인 후 처리해 주세요.<span>${state.writable?'내 기기에서 추가·수정 가능':'담임교사 확인용 · 읽기 전용'}</span></footer></main></div>`;
  positionCalendar();
  bind();
  if(window.innerWidth<=900){const nav=app.querySelector('.sidebar nav');const active=nav?.querySelector('.active');if(active)nav.scrollLeft=active.offsetLeft-nav.offsetLeft-nav.clientWidth/2+active.clientWidth/2;}
}
function rememberedClassId() { try { const value=localStorage.getItem('homeroom-class-id')||'';return /^[123]\d{2}$/.test(value)&&!value.endsWith('00')?value:''; } catch { return ''; } }
function welcome() {
  const ready=state.configured||state.encrypted, classLogin=state.classLoginEnabled;
  const upload=`<label class="btn upload-label">${icon('upload')}다른 일정 파일 열기<input type="file" id="file-input" accept=".json,application/json" /></label>`;
  const legacyForm=`<form id="legacy-login-form"><label for="legacy-password">기존 캘린더 비밀번호</label><div class="login-row"><input id="legacy-password" name="password" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required maxlength="256" placeholder="기존 열람 비밀번호"/><button class="btn primary" ${state.busy?'disabled':''}>${state.busy?'확인 중…':'일정 열기'}</button></div></form>`;
  const loginForm=classLogin?`<form id="login-form" class="class-login-form"><label for="class-username">반 아이디</label><input id="class-username" name="username" autocomplete="username" inputmode="numeric" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="3" pattern="[123][0-9]{2}" value="${esc(state.classLoginName||rememberedClassId())}" placeholder="예: 308"/><small>3학년 8반 → 308</small><label for="password">공통 비밀번호</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256" placeholder="안내받은 공통 비밀번호"/><button class="btn primary" ${state.busy?'disabled':''}>${state.busy?'로그인 중…':'로그인'}</button></form>`:legacyForm;
  return `<section class="welcome"><div class="welcome-mark">${icon('calendar')}</div><h2>${state.checking?'일정을 준비하고 있습니다':state.authenticated?'로그인되어 있습니다':classLogin?'우리 반 로그인':ready?'교직원 비밀번호로 일정 열기':'일정에 연결하지 못했습니다'}</h2><p>${state.checking?'잠시만 기다려 주세요.':state.authenticated?'고사 캘린더와 담임 기록함을 이어서 이용하세요.':classLogin?'한 번 로그인하면 캘린더·출결·외출증·체험학습을<br>추가 로그인 없이 이용합니다.':ready?'검토한 고사 일정이 연결되어 있습니다.<br>비밀번호를 입력한 뒤 확인할 반을 선택하세요.':'새로고침하거나 관리자에게 확인해 주세요.'}</p>${state.error?`<div class="error" role="alert">${esc(state.error)}</div>`:''}${!state.checking?(state.authenticated?`<div class="welcome-actions"><button class="btn primary" id="retry-calendar" ${state.busy?'disabled':''}>${state.busy?'불러오는 중…':'캘린더 다시 불러오기'}</button><a class="btn" href="/notebook.html">홈으로</a></div>`:ready||classLogin?`${loginForm}${classLogin?'<p class="privacy-note">같은 브라우저에서는 로그인 상태를 자동으로 유지합니다.</p>':''}`:''):''}<details class="setup-help"><summary>${classLogin?'기존 로그인·다른 일정 파일':'다른 자료를 확인해야 하나요?'}</summary>${classLogin?`<p><a class="text-btn" href="/notebook.html?auth=personal">기존 개인 계정 로그인</a></p>${ready&&!state.authenticated?legacyForm:''}`:''}<p>관리자가 전달한 일정 JSON 파일을 이 기기에서만 열 수 있습니다.</p>${upload}</details></section>`;
}
function positionCalendar() {
  // Production CSP rejects style attributes parsed from HTML. Apply each
  // computed grid property through the permitted CSSOM property setters.
  app.querySelectorAll('.calendar-week').forEach(week=>{
    const lanes=Number(week.dataset.lanes);
    week.style.gridTemplateRows=`40px ${lanes?`repeat(${lanes},minmax(var(--range-height),auto)) `:''}minmax(40px,1fr)`;
    week.querySelectorAll('[data-column]').forEach(cell=>{
      cell.style.gridColumn=cell.dataset.column;
    });
    week.querySelectorAll('.calendar-range').forEach(bar=>{
      bar.style.gridColumn=`${bar.dataset.startColumn} / ${bar.dataset.endColumn}`;
      bar.style.gridRow=String(Number(bar.dataset.lane)+2);
    });
  });
}
function content() {
  const filtered=current();
  return `${summary()}<section class="notice">${icon('info')}<div><strong>기간 표시는 연속 결석일이 아닙니다.</strong><span> ‘기간 중 1일’은 개별 고사일 확인 전의 후보 기간입니다. 불일치 시 증빙서류 기준 수정 요망.</span></div></section><section class="workspace"><div class="toolbar"><div class="month-nav"><button id="prev-month" class="icon-btn" aria-label="이전 달">${icon('arrow')}</button><h2>${monthTitle()}</h2><button id="next-month" class="icon-btn next" aria-label="다음 달">${icon('arrow')}</button><button id="source-month" class="text-btn">자료 기준 월</button></div><div class="views" role="group" aria-label="보기 방식"><button data-view="calendar" aria-pressed="${state.view==='calendar'}" class="${state.view==='calendar'?'selected':''}">${icon('calendar')}달력</button><button data-view="list" aria-pressed="${state.view==='list'}" class="${state.view==='list'?'selected':''}">${icon('list')}목록</button></div></div><div class="filters"><label class="search">${icon('search')}<input id="query" type="search" value="${esc(state.query)}" placeholder="이름, 학번, 대학 검색" aria-label="이름, 학번, 대학 검색" /></label><select id="kind" aria-label="고사 구분"><option value="all">모든 고사</option>${KINDS.map(k=>`<option ${state.kind===k?'selected':''}>${k}</option>`).join('')}</select><label class="review-filter"><input id="review-only" type="checkbox" ${state.reviewOnly?'checked':''}/>검토·수정 요망만</label>${state.query||state.kind!=='all'||state.reviewOnly?'<button class="text-btn" id="reset-filters">필터 초기화</button>':''}</div><div class="legend"><span><i class="dot interview"></i>면접·기타</span><span><i class="dot practical"></i>실기</span><span><i class="dot essay"></i>논술</span><span class="legend-divider"></span><span><i class="dashed-symbol"></i>개별 고사일 확인</span><span class="legend-count">${filtered.length}개 일정 · 학생 ${stats(filtered).students}명</span></div><div class="exam-neis-toolbar"><span>현재 반·월·검색 조건의 확정 고사를 출석인정으로 준비합니다.</span><button class="btn primary" id="send-exams-neis" ${state.classNumber==='all'?'disabled':''}>${icon('upload')}확정 고사 나이스로 보내기</button>${state.classNumber==='all'?'<small>보낼 반을 먼저 선택하세요.</small>':''}</div>${state.view==='calendar'?calendar(filtered):list(filtered)}</section>${state.view==='calendar'?selectedDay(filtered):''}<div class="source-note">${icon('info')}<span>${esc(dataSource())}<br>각 일정의 ‘원문 근거’에서 명단·증빙 쪽 번호와 검토 사유를 확인할 수 있습니다.</span></div>`;
}
function calendar(events) {
  const labelFor=e=>`${e.studentId} ${e.name} · ${e.university} · ${dateLabel(e)} · ${modeText(e)}${e.issues.length?' · 검토·수정 요망 · 불일치 시 증빙서류 기준으로 수정':''}`;
  const identity=e=>`<span class="student-id">${esc(e.studentId)}</span><b class="student-name">${esc(e.name)}</b>${e.issues.length?'<i aria-hidden="true">!</i>':''}`;
  const weeks=calendarWeeks(events,state.month);
  return `<div class="calendar"><p class="calendar-help">날짜 칸을 눌러 선택하세요. 이어진 막대는 미확정 기간이며, ‘기간 중 1일’은 그중 하루만 응시하는 일정입니다.</p><div class="weekdays">${'일월화수목금토'.split('').map((d,i)=>`<span class="${i===0?'sun':i===6?'sat':''}">${d}</span>`).join('')}</div><div class="days">${weeks.map(week=>{
    const dayItems=week.dates.map((date,index)=>({date,index,outside:date.slice(0,7)!==state.month,matches:events.filter(e=>onDay(e,date)).sort((a,b)=>a.studentId.localeCompare(b.studentId)||a.university.localeCompare(b.university,'ko'))}));
    const cells=dayItems.map(({date,index,outside,matches})=>{
      const wd=weekday(date);
      return `<div class="day ${outside?'outside':''} ${state.selected===date?'chosen':''} ${date===todaySeoul()?'today':''}" data-date="${date}" data-column="${index+1}"><button class="date-btn ${wd==='일'?'sun':wd==='토'?'sat':''}" data-day="${date}" aria-label="${date} ${wd}요일, ${outside?0:matches.length}개 일정, 날짜 선택" aria-pressed="${state.selected===date}" aria-controls="day-detail" ${outside?'disabled':''}>${Number(date.slice(8))}${date===todaySeoul()?'<small>오늘</small>':''}</button></div>`;
    }).join('');
    const ranges=week.segments.map(segment=>{
      const e=segment.event;
      const span=segment.endColumn-segment.startColumn;
      const continuation=[segment.continuesBefore?'앞 주·달에서 이어짐':'',segment.continuesAfter?'다음 주·달로 이어짐':''].filter(Boolean).join(' · ');
      const label=labelFor(e)+(continuation?' · '+continuation:'');
      return `<button class="calendar-range ${chipKind(e)} ${span===1?'range-narrow':''} ${segment.continuesBefore?'continues-before':''} ${segment.continuesAfter?'continues-after':''}" data-event="${esc(e.id)}" data-start="${week.dates[segment.startColumn-1]}" data-end="${week.dates[segment.endColumn-2]}" data-lane="${segment.lane}" data-start-column="${segment.startColumn}" data-end-column="${segment.endColumn}" title="${esc(label)}" aria-label="${esc(label+' 상세 보기')}"><span class="range-identity">${identity(e)}</span><span class="range-description"><span class="range-mode">${e.dateMode==='oneOf'?'기간 중 1일':'기간 확인 필요'}</span>${span>1?`<span class="range-university">${esc(e.university)}</span>`:''}</span>${segment.continuesBefore?'<span class="range-arrow before" aria-hidden="true">‹</span>':''}${segment.continuesAfter?'<span class="range-arrow after" aria-hidden="true">›</span>':''}</button>`;
    }).join('');
    const singles=dayItems.filter(day=>!day.outside).map(({date,index,matches})=>`<div class="day-events" data-date="${date}" data-column="${index+1}">${matches.filter(e=>e.dateMode==='single').map(e=>{
      const label=labelFor(e);
      return `<button class="event-chip ${chipKind(e)}" data-event="${esc(e.id)}" title="${esc(label)}" aria-label="${esc(label+' 상세 보기')}"><span class="student-identity">${identity(e)}</span></button>`;
    }).join('')}</div>`).join('');
    return `<div class="calendar-week" data-lanes="${week.laneCount}">${cells}${ranges}${singles}</div>`;
  }).join('')}</div></div>`;
}
function rowCard(e) {
  return `<button class="record" data-event="${esc(e.id)}"><span class="record-date">${esc(dateLabel(e))}<small>${esc(modeText(e))}</small></span><span class="record-person"><b>${esc(e.name)}</b><small>${e.classNumber}반 · ${e.studentId}</small></span><span class="record-school"><b>${esc(e.university)}</b><small>${esc(e.department)}</small></span><span class="record-tags"><span class="kind-label ${chipKind(e)}">${e.kind}</span>${e.issues.length?`<span class="review-badge" title="${esc(CORRECTION_GUIDE)}">검토·수정 요망</span>`:''}</span><span class="record-detail">상세 보기</span></button>`;
}
function list(events) {
  return `<div class="records">${events.length?events.map(rowCard).join(''):'<div class="empty">선택한 조건에 해당하는 일정이 없습니다.<small>반·월·검색어·필터를 확인해 주세요.</small></div>'}</div>`;
}
function selectedDay(events) {
  const day=state.selected;
  if (!day) return '';
  const items=events.filter(e=>onDay(e,day));
  return `<section class="day-detail" id="day-detail"><div class="day-detail-heading"><div><h2>${Number(day.slice(5,7))}월 ${Number(day.slice(8))}일 <span>${weekday(day)}요일</span></h2><small>${items.length}개 일정 · 학생 ${stats(items).students}명</small></div><button class="btn add-on-day" id="add-on-day" ${state.writable?'':'disabled'}>${icon('plus')}이 날짜에 추가</button></div>${items.some(e=>e.dateMode!=='single')?'<p class="day-warning">후보 기간에 해당하는 일정이 포함되어 있습니다. 실제 응시일과 다를 수 있습니다.</p>':''}${list(items)}</section>`;
}
function bind() {
  app.querySelectorAll('[data-class]').forEach(el=>el.addEventListener('click',()=>{state.classNumber=el.dataset.class;render();}));
  app.querySelectorAll('[data-event]').forEach(el=>el.addEventListener('click',()=>showEvent(el.dataset.event)));
  app.querySelectorAll('.day:not(.outside)[data-date], .day-events[data-date]').forEach(el=>el.addEventListener('click',event=>{
    if(event.target.closest('[data-event]'))return;
    const keepFocus=Boolean(event.target.closest('[data-day]'));
    state.selected=el.dataset.date;
    render();
    if(keepFocus)app.querySelector(`[data-day="${state.selected}"]`)?.focus({preventScroll:true});
    document.querySelector('#day-detail')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }));
  app.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>{state.view=el.dataset.view;render();}));
  const on=(id,event,fn)=>document.getElementById(id)?.addEventListener(event,fn);
  on('file-input','change',async e=>{
    const f=e.target.files[0];if(!f)return;
    if(f.size>3000000){state.error='3MB 이하의 일정 JSON 파일을 선택해 주세요.';render();return;}
    try{load(parseDataset(await f.text()),'local');notify('자료를 불러왔습니다. 확인할 반을 선택하세요.');}catch(error){state.error=error instanceof SyntaxError?'올바른 JSON 파일이 아닙니다. 제공된 일정 자료를 선택해 주세요.':error.message;render();}
  });
  on('login-form','submit',classLogin);
  on('legacy-login-form','submit',login);
  on('retry-calendar','click',retryCalendar);
  on('clear-data','click',async()=>{if(editorSession&&!closeEditor())return;if(state.authenticated||state.mode==='server'){try{await api('/api/session',{method:'DELETE',body:'{}'});location.replace('/notebook.html');}catch{notify('로그아웃하지 못했습니다. 다시 눌러 주세요.');return;}}state.generation++;state.authenticated=false;state.notebookAuthenticated=false;matcherRoster=[];dialog.close();dialog.innerHTML='';detailEventId=null;document.querySelector('#print-records')?.remove();state.data=null;state.writable=false;state.revision=null;state.syncError='';state.query='';state.kind='all';state.reviewOnly=false;state.classNumber='all';state.error='';render();});
  on('add-event','click',()=>openEditor());
  on('add-on-day','click',()=>openEditor({date:state.selected}));
  on('refresh-shared','click',()=>refreshShared(true));
  on('send-exams-neis','click',()=>showExamNeis(current()));
  on('prev-month','click',()=>changeMonth(-1));on('next-month','click',()=>changeMonth(1));
  on('source-month','click',()=>{state.month=state.data.defaultMonth;chooseDay();render();});
  on('kind','change',e=>{state.kind=e.target.value;render();});
  on('review-only','change',e=>{state.reviewOnly=e.target.checked;render();});
  on('reset-filters','click',()=>{state.query='';state.kind='all';state.reviewOnly=false;render();});
  const updateQuery=e=>{if(e.isComposing)return;const position=e.target.selectionStart;state.query=e.target.value;render();const q=document.querySelector('#query');q.focus();try{q.setSelectionRange(position,position);}catch{}};
  on('query','input',updateQuery);
  on('query','compositionend',updateQuery);
  bindStudentMatcher({inputs:[document.querySelector('#query')],students:()=>[...dataEvents(),...matcherRoster],autoSelectId:false,onSelect:student=>{state.query=student.studentId;render();}});

  on('print','click',()=>window.print());
  on('export','click',()=>{const a=document.createElement('a');const url=URL.createObjectURL(new Blob([csv(current())],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=`${state.month}_${state.classNumber==='all'?'전체':state.classNumber+'반'}_고사일정.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('현재 반·월·필터 기준 목록을 저장했습니다. 개인정보가 포함되어 있습니다.');});
}
function changeMonth(amount){state.month=shiftMonth(state.month,amount);chooseDay();render();}
function chooseDay(){const today=todaySeoul();state.selected=today.slice(0,7)===state.month?today:state.month+'-01';}
function load(data,mode,meta={}){state.generation++;if(result.profile)globalThis.easyProfile=result.profile;state.data=data;state.mode=mode;state.writable=mode==='server'&&meta.writable===true;state.revision=meta.revision??null;state.syncError='';state.lastSynced=mode==='server'?new Date():null;state.month=data.defaultMonth;state.error='';chooseDay();render();
  matcherRoster=[];
  if(mode==='server'){const generation=state.generation;api('/api/notebook').then(result=>{if(state.generation===generation&&result.authenticated)matcherRoster=result.students||[];}).catch(()=>{});}
}
function showEvent(id){
  const e=dataEvents().find(x=>x.id===id);if(!e)return;
  detailEventId=id;
  const source=[e.sourcePages.length?`명단 ${e.sourcePages.join(', ')}쪽`:'',e.evidencePages.length?`증빙 ${e.evidencePages.join(', ')}쪽`:''].filter(Boolean).join('<br>');
  const updated=e.updatedAt?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(e.updatedAt)):'';
  dialog.innerHTML=`<div class="dialog-top"><span class="kind-label ${chipKind(e)}">${e.kind}</span><button class="icon-btn" id="close-dialog" aria-label="상세 닫기">${icon('close')}</button></div><h2 id="detail-title">${esc(e.name)} <span>${e.classNumber}반 · ${e.studentId}</span></h2><h3>${esc(e.university)}</h3><p class="department">${esc(e.department)}</p><div class="date-panel"><small>등록된 고사 일정</small><strong>${esc(dateLabel(e))}</strong><span>${e.dateMode==='single'?`${e.startDate} (${weekday(e.startDate)})`:`${e.startDate} (${weekday(e.startDate)}) ~ ${e.endDate} (${weekday(e.endDate)})`}</span>${e.dateMode!=='single'?`<p>${e.dateMode==='oneOf'?'해당 기간 중 하루입니다. 전체 기간을 결석일로 처리하지 마세요.':'기간이 표시된 일정입니다. 실제 응시일 및 일수를 확인하세요.'}</p>`:''}</div>${e.issues.length?`<div class="issue-box"><h4>검토·수정 요망</h4><p class="correction-guide">${esc(CORRECTION_GUIDE)}</p><ul>${e.issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>아래 원문 근거의 증빙 쪽 번호를 확인해 주세요. 수정한 내용과 변경 이유는 교사 메모에 남겨 주세요.</p></div>`:''}<dl class="detail-fields"><dt>전형</dt><dd>${esc(e.admission)}</dd><dt>증빙 종류</dt><dd>${e.evidence.length?e.evidence.map(esc).join(' · '):'등록된 증빙 종류 없음'}</dd><dt>원문 근거</dt><dd>${source||(e.sourceType==='teacher'?'교사가 직접 등록한 일정':'등록된 원문 쪽 번호 없음')}</dd>${e.note?`<dt>교사 메모</dt><dd class="teacher-note">${esc(e.note)}</dd>`:''}${e.updatedBy?`<dt>최근 수정</dt><dd>${esc(e.updatedBy)}${updated?`<br><small>${esc(updated)}</small>`:''}</dd>`:''}</dl><div class="dialog-note">증빙 종류는 응시 완료·출결 승인 여부를 뜻하지 않습니다. 변경한 날짜와 출결 처리는 실제 증빙을 확인해 주세요.</div>${state.writable?`<div class="detail-actions"><button class="btn primary" id="edit-event">${icon('edit')}일정 수정</button><button class="btn" id="same-student-event">${icon('plus')}이 학생의 다른 고사 추가</button><button class="btn danger" id="delete-event">일정 삭제</button></div>`:`<p class="detail-write-help">${esc(writeHint())}</p>`}${e.dateMode==='single'?`<div class="exam-neis-single"><button class="btn primary full" id="send-exam-neis">${icon('upload')}나이스 출석인정 입력</button><small>이 학생의 확정 고사일을 출석인정 결석으로 준비합니다.</small></div>`:'<p class="detail-write-help">개별 응시일을 ‘확정된 하루’로 수정하면 나이스 출석인정 입력 버튼이 나타납니다.</p>'}<button class="btn full" id="confirm-dialog">닫기</button>`;
  document.querySelector('#close-dialog').onclick=()=>dialog.close();document.querySelector('#confirm-dialog').onclick=()=>dialog.close();
  document.querySelector('#edit-event')?.addEventListener('click',()=>openEditor({before:e}));
  document.querySelector('#same-student-event')?.addEventListener('click',()=>openEditor({student:e}));
  document.querySelector('#delete-event')?.addEventListener('click',()=>deleteEvent(e));
  document.querySelector('#send-exam-neis')?.addEventListener('click',()=>showExamNeis([e]));
  if(!dialog.open)dialog.showModal();
}
function showExamNeis(events) {
  if(!events.length){notify('현재 조건에 해당하는 고사일정이 없습니다.');return;}
  openExamNeis({events,getLatestEvents:async()=>{
    if(state.mode==='server') {
      const generation=state.generation,result=await api('/api/calendar');
      if(generation!==state.generation||!state.data)throw new Error('캘린더를 다시 열고 최신 일정을 확인해 주세요.');
      acceptShared(result);
    }
    return dataEvents();
  }});
}
async function deleteEvent(e) {
  if(!state.writable){notify(writeHint());return;}
  if(!window.confirm(`${e.studentId} ${e.name} · ${e.university} ${e.kind} (${dateLabel(e)})\n이 일정을 삭제할까요? 내 기기 모두에서 사라집니다.`))return;
  const button=document.querySelector('#delete-event');if(button)button.disabled=true;
  try{
    const result=await api('/api/calendar',{method:'DELETE',body:JSON.stringify({id:e.id,before:e})});
    if(!result.data||result.writable!==true)throw new Error('삭제 완료를 확인하지 못했습니다. 최신 일정을 확인해 주세요.');
    acceptShared(result);dialog.close();detailEventId=null;render();notify('일정을 삭제했습니다.');
  }catch(error){
    if(button)button.disabled=false;
    notify(error.status===409?'다른 기기에서 먼저 이 일정을 수정했습니다. 최신 내용을 확인한 뒤 다시 삭제해 주세요.':error.message);
    if(error.status===409){try{acceptShared(await api('/api/calendar'));render();}catch{}}
  }
}
function editorValues() { return Object.fromEntries(new FormData(editorDialog.querySelector('form')).entries()); }
function editorFingerprint() { return JSON.stringify(editorValues()); }
function closeEditor(force=false) {
  if (!editorSession) return true;
  if (editorSession.saving) return false;
  if (!force && editorSession.initial!==editorFingerprint() && !window.confirm('입력한 내용을 저장하지 않고 닫을까요?')) return false;
  editorDialog.close();editorDialog.innerHTML='';editorSession=null;
  return true;
}
async function openEditor({before=null,student=null,date=null}={}) {
  if(!state.writable){notify(writeHint());return;}
  if(editorSession&&!closeEditor())return;
  dialog.close();detailEventId=null;
  let roster=[];
  try{const result=await api('/api/notebook');if(result.authenticated){roster=result.students||[];matcherRoster=roster;}}catch{notify('명렬표를 불러오지 못했습니다. 기존 고사 학생만 검색됩니다.');}
  if(!state.writable)return;
  const person=before||student;
  const values={classNumber:person?.classNumber||Number(state.classNumber==='all'?(globalThis.easyProfile?.classNumber||1):state.classNumber),number:person?Number(person.studentId.slice(-2)):'',name:person?.name||'',university:before?.university||'',department:before?.department==='미기재'?'':before?.department||'',admission:before?.admission==='미기재'?'':before?.admission||'',kind:before?.kind||'면접',dateMode:before?.dateMode||'single',startDate:before?.startDate||date||state.selected||state.month+'-01',endDate:before?.endDate||date||state.selected||state.month+'-01',note:before?.note||''};
  const students=[...new Map([...dataEvents(),...roster.map(s=>({...s,name:s.studentName||s.name,classNumber:Number(s.studentId.slice(1,3))}))].map(e=>[e.studentId,e])).values()].sort((a,b)=>a.studentId.localeCompare(b.studentId));
  editorSession={before:before?structuredClone(before):null,eventId:before?.id||'teacher-'+crypto.randomUUID(),saving:false,initial:'',students};
  const textField=(name,label,{required=false,max=300,placeholder='',wide=false}={})=>`<label class="editor-field ${wide?'wide':''}" for="edit-${name}"><span>${label}${required?' <em>*</em>':' <small>선택</small>'}</span><input id="edit-${name}" name="${name}" value="${esc(values[name])}" ${required?'required':''} maxlength="${max}" placeholder="${esc(placeholder)}" autocomplete="off"/></label>`;
  editorDialog.innerHTML=`<div class="dialog-top"><span class="editor-kicker">내 반 고사 일정</span><button type="button" class="icon-btn" id="close-editor" aria-label="편집 닫기">${icon('close')}</button></div><h2 id="editor-title">${before?'일정 수정':student?'이 학생의 다른 고사 추가':'새 일정 추가'}</h2><p class="editor-intro">저장하면 연결한 내 휴대폰·PC에 반영됩니다. <em>*</em> 필수 항목</p><form id="event-form"><fieldset class="editor-fields"><legend>학생 및 고사 정보</legend>${!before&&!student?`<label class="editor-field wide" for="student-picker"><span>학생 찾기 <small>학번 또는 이름</small></span><input id="student-picker" list="student-options" placeholder="학번 또는 이름으로 찾기" autocomplete="off"/><datalist id="student-options">${students.map(e=>`<option value="${esc(e.studentId+' '+e.name)}"></option>`).join('')}</datalist><small>명단에 없는 학생은 아래에 직접 입력하세요.</small></label>`:''}<div class="student-fields wide"><label class="editor-field" for="edit-classNumber"><span>반 <em>*</em></span><select id="edit-classNumber" name="classNumber" required>${[globalThis.easyProfile?.classNumber||1].map(n=>`<option value="${n}" ${Number(values.classNumber)===n?'selected':''}>3학년 ${n}반</option>`).join('')}</select></label><label class="editor-field" for="edit-number"><span>번호 <em>*</em></span><input id="edit-number" name="number" type="number" inputmode="numeric" min="1" max="99" step="1" value="${values.number}" placeholder="예: 12" required/></label>${textField('name','학생 이름',{required:true,max:40,placeholder:'이름'})}</div><p class="student-preview wide" id="student-preview" aria-live="polite"></p>${textField('university','대학교',{required:true,placeholder:'예: 한국대학교',wide:true})}${textField('department','학과',{placeholder:'지원 학과'})}${textField('admission','전형',{placeholder:'전형 이름'})}<label class="editor-field" for="edit-kind"><span>고사 구분 <em>*</em></span><select id="edit-kind" name="kind" required>${KINDS.map(k=>`<option ${values.kind===k?'selected':''}>${k}</option>`).join('')}</select></label><label class="editor-field" for="edit-dateMode"><span>일정 구분 <em>*</em></span><select id="edit-dateMode" name="dateMode"><option value="single" ${values.dateMode==='single'?'selected':''}>확정된 하루</option><option value="oneOf" ${values.dateMode==='oneOf'?'selected':''}>기간 중 1일</option><option value="rangeUnclear" ${values.dateMode==='rangeUnclear'?'selected':''}>기간 · 응시일수 확인 필요</option></select></label><label class="editor-field" for="edit-startDate"><span id="start-date-label">고사일 <em>*</em></span><input id="edit-startDate" name="startDate" type="date" value="${values.startDate}" required/></label><label class="editor-field" id="end-date-field" for="edit-endDate"><span>기간 마지막 날 <em>*</em></span><input id="edit-endDate" name="endDate" type="date" value="${values.endDate}" required/></label><p class="date-mode-help wide" id="date-mode-help"></p><label class="editor-field wide" for="edit-note"><span>교사 메모 <small>선택</small></span><textarea id="edit-note" name="note" rows="3" maxlength="2000" placeholder="확인한 실제 응시일, 변경 이유 등">${esc(values.note)}</textarea><small>주민번호·연락처·수험번호는 입력하지 마세요.</small></label>${before?`<p class="editor-source-help wide">${before.issues.length?`${esc(CORRECTION_GUIDE)}<br>`:''}기존 원문 쪽 번호와 검토 기록은 유지됩니다. 확인한 내용과 변경 이유를 교사 메모에 남겨 주세요.</p>`:''}</fieldset><div id="editor-error" class="error" role="alert" hidden></div><div id="editor-conflict" hidden></div><div class="editor-actions"><button class="btn" type="button" id="cancel-editor">취소</button><button class="btn primary" type="submit" id="save-event">내 고사 일정에 저장</button></div></form>`;
  const form=editorDialog.querySelector('form');
  const field=name=>form.elements.namedItem(name);
  function studentPreview(fillName=false) {
    const num=Number(field('number').value), cls=Number(field('classNumber').value);
    const id=Number.isInteger(num)&&num>=1&&num<=99?`3${String(cls).padStart(2,'0')}${String(num).padStart(2,'0')}`:'';
    const existing=students.find(e=>e.studentId===id);
    if(fillName&&existing)field('name').value=existing.name;
    document.querySelector('#student-preview').textContent=id?`학번 ${id}${existing?' · 등록된 학생 '+existing.name:''}`:'반과 번호를 입력하면 학번이 자동으로 만들어집니다.';
  }
  function datesChanged() {
    const single=field('dateMode').value==='single';
    document.querySelector('#end-date-field').hidden=single;
    document.querySelector('#start-date-label').innerHTML=`${single?'고사일':'기간 첫날'} <em>*</em>`;
    if(single)field('endDate').value=field('startDate').value;
    field('endDate').min=field('startDate').value;
    document.querySelector('#date-mode-help').textContent=single?'개별 응시일이 확인되었다면 이 날짜 하나만 표시됩니다.':field('dateMode').value==='oneOf'?'전체 기간이 달력에 표시됩니다. 실제 응시하는 하루를 확인한 뒤 ‘확정된 하루’로 수정하세요.':'해당 기간이 달력에 표시됩니다. 실제 응시일과 응시일수를 확인해 주세요.';
  }
  document.querySelector('#student-picker')?.addEventListener('change',event=>{const value=event.target.value.trim();const matches=students.filter(e=>value===e.studentId+' '+e.name||value===e.studentId||value===e.name);if(matches.length===1){const found=matches[0];field('classNumber').value=found.classNumber;field('number').value=Number(found.studentId.slice(-2));field('name').value=found.name;studentPreview();}});
  ['classNumber','number'].forEach(name=>field(name).addEventListener('change',()=>studentPreview(true)));
  field('number').addEventListener('input',()=>studentPreview(false));
  ['dateMode','startDate'].forEach(name=>field(name).addEventListener('change',datesChanged));
  document.querySelector('#close-editor').onclick=()=>closeEditor();document.querySelector('#cancel-editor').onclick=()=>closeEditor();
  form.addEventListener('submit',saveEditor);
  bindStudentMatcher({inputs:[document.querySelector('#student-picker'),field('name')],students,onSelect:found=>{field('classNumber').value=Number(found.studentId.slice(1,3));field('number').value=Number(found.studentId.slice(3));field('name').value=found.studentName;const picker=document.querySelector('#student-picker');if(picker)picker.value=found.studentId+' '+found.studentName;studentPreview();}});
  studentPreview();datesChanged();editorSession.initial=editorFingerprint();editorDialog.showModal();
}
function editorError(message) {const el=document.querySelector('#editor-error');if(el){el.textContent=message;el.hidden=false;el.scrollIntoView({block:'nearest',behavior:'smooth'});}}
function setEditorSaving(saving) {
  editorSession.saving=saving;
  editorDialog.querySelector('fieldset').disabled=saving;
  editorDialog.querySelectorAll('button').forEach(button=>button.disabled=saving);
  document.querySelector('#save-event').textContent=saving?'저장 중…':'내 고사 일정에 저장';
}
async function saveEditor(event) {
  event.preventDefault();
  if(!editorSession||editorSession.saving)return;
  if(!state.writable){editorError('공동 저장 연결을 확인할 수 없습니다. 이 입력은 아직 저장되지 않았습니다.');return;}
  const values=editorValues();let edited;
  try{edited=buildEditedEvent(values,editorSession.before);edited.id=editorSession.eventId;if(editorSession.before||!state.data.events.some(e=>e.id===edited.id))applyEventEdit(state.data,edited,editorSession.before);}catch(error){editorError(error.message);return;}
  const currentEditor=editorSession;
  document.querySelector('#editor-error').hidden=true;document.querySelector('#editor-conflict').hidden=true;
  setEditorSaving(true);
  try {
    const result=await api('/api/calendar',{method:'PATCH',body:JSON.stringify({event:edited,before:currentEditor.before})});
    if(!result.data||result.writable!==true)throw new Error('공동 저장 완료를 확인하지 못했습니다. 최신 일정을 확인해 주세요.');
    acceptShared(result);
    state.month=edited.startDate.slice(0,7);state.selected=edited.startDate;
    if(state.classNumber!=='all')state.classNumber=String(edited.classNumber);
    currentEditor.saving=false;closeEditor(true);render();showEvent(edited.id);
    notify('내 고사 일정에 저장했습니다. 다른 선생님의 화면에도 자동으로 반영됩니다.');
  } catch(error) {
    editorError(error.status===409?'다른 선생님이 먼저 수정했거나 같은 일정이 등록되었습니다. 입력한 내용은 그대로 유지했습니다. 최신 내용을 확인해 주세요.':error.status===401?'접속 시간이 만료되었습니다. 입력 내용은 유지되어 있지만 저장되지 않았습니다. 내용을 복사해 두고 다시 접속해 주세요.':!error.status||error.status>=500?`저장 완료 여부를 확인하지 못했습니다. ${error.message} 입력 내용은 유지되어 있으니 다시 저장하거나 최신 내용을 확인해 주세요.`:`${error.message} 입력 내용은 유지되어 있습니다.`);
    if(error.status===401){state.generation++;state.data=null;state.writable=false;state.authenticated=false;state.notebookAuthenticated=false;state.error='로그인이 만료되었습니다. 다시 로그인해 주세요.';render();}
    if(error.status===409)showConflict(edited.id);
  } finally {if(editorSession===currentEditor)setEditorSaving(false);}
}
function showConflict(id) {
  const box=document.querySelector('#editor-conflict');if(!box)return;
  box.hidden=false;box.innerHTML='<p>최신 저장본과 입력한 내용을 비교해 주세요.</p><button type="button" class="btn" id="check-conflict">최신 저장 내용 확인</button>';
  document.querySelector('#check-conflict').onclick=async()=>{
    const session=editorSession;const button=document.querySelector('#check-conflict');button.disabled=true;
    try {
      const latest=await api('/api/calendar');if(editorSession!==session)return;
      acceptShared(latest);render();
      const saved=dataEvents().find(e=>e.id===id);
      box.innerHTML=saved?`<h4>최신 저장 내용</h4><p>${esc(saved.studentId)} ${esc(saved.name)} · ${esc(saved.university)}<br>${esc(saved.department)} · ${esc(saved.kind)} · ${esc(dateLabel(saved))}${saved.note?`<br>메모: ${esc(saved.note)}`:''}${saved.updatedBy?`<br>수정자: ${esc(saved.updatedBy)}`:''}</p><button type="button" class="btn" id="reopen-latest">최신 내용으로 다시 열기</button><small>현재 입력을 지우기 전에 한 번 더 확인합니다.</small>`:'<p>최신 일정을 불러왔습니다. 학번·대학교·고사일이 같은 일정이 이미 있는지 확인해 주세요. 입력 내용은 그대로 유지했습니다.</p>';
      document.querySelector('#reopen-latest')?.addEventListener('click',()=>{if(closeEditor())openEditor({before:saved});});
    }catch(error){if(editorSession===session){editorError(error.message);button.disabled=false;}}
  };
}
editorDialog.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
editorDialog.addEventListener('click',event=>{if(event.target===editorDialog){const r=editorDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeEditor();}});
window.addEventListener('beforeunload',event=>{if(editorSession&&(editorSession.saving||editorSession.initial!==editorFingerprint())){event.preventDefault();event.returnValue='';}});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
window.addEventListener('beforeprint',()=>{
  if(!state.data||document.querySelector('#print-records'))return;
  const section=document.createElement('section');section.id='print-records';section.className='print-only';section.innerHTML=`<h2>${monthTitle()} · 전체 필터 결과</h2><p>기간 중 1일은 후보 기간이며, 연속 결석이 아닙니다. 총 ${current().length}개 일정.</p>${list(current())}`;
  document.querySelector('.source-note').before(section);
});
window.addEventListener('afterprint',()=>document.querySelector('#print-records')?.remove());
async function api(url,options={}){
  let r;
  try{r=await fetch(url,{signal:AbortSignal.timeout(['PATCH','DELETE'].includes(options.method)?50000:15000),...options,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})}});}
  catch(error){throw new Error(error.name==='TimeoutError'?'서버 응답을 기다리는 시간이 길어졌습니다. 최신 저장 내용을 확인한 뒤 다시 시도해 주세요.':'네트워크 연결을 확인하고 다시 시도해 주세요.');}
  const result=await r.json().catch(()=>({}));
  if(!r.ok){const error=new Error(result.message||'공유 자료에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');error.status=r.status;error.code=result.error;throw error;}
  return result;
}
function acceptShared(result) {
  const data=parseDataset(result.data||result);
  if(result.profile)globalThis.easyProfile=result.profile;state.data=data;state.mode='server';state.writable=result.writable===true;state.revision=result.revision??null;state.lastSynced=new Date();state.syncError='';
}
async function refreshShared(manual=false) {
  if(state.mode!=='server'||!state.data||state.refreshing||editorSession||document.hidden)return;
  if(!manual&&app.contains(document.activeElement)&&['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  state.refreshing=true;const generation=state.generation;
  if(manual)render();
  try{
    const result=await api('/api/calendar');
    if(generation!==state.generation||editorSession)return;
    const previous=state.revision;
    acceptShared(result);
    if(dialog.open&&detailEventId)showEvent(detailEventId);
    if(manual)notify(previous===state.revision?'최신 일정입니다.':'최신 일정을 반영했습니다.');
  }catch(error){
    if(generation!==state.generation||editorSession)return;
    if(error.status===401){state.generation++;state.data=null;state.writable=false;state.authenticated=false;state.notebookAuthenticated=false;state.error='로그인이 만료되었습니다. 다시 로그인해 주세요.';dialog.close();dialog.innerHTML='';detailEventId=null;notify(state.error);}
    else{state.syncError='최신 일정 확인에 실패했습니다. 현재 화면은 마지막으로 불러온 내용입니다.';if(manual)notify(error.message);}
  }finally{state.refreshing=false;if(generation===state.generation&&!editorSession)render();else if(!state.data&&!editorSession)render();}
}
async function openSharedCalendar() {
  const data=await api('/api/calendar');load(parseDataset(data.data||data),'server',data);
}
async function retryCalendar() {
  if(state.busy)return;state.busy=true;state.error='';render();
  try{await openSharedCalendar();}catch(error){state.error=error.message;if(error.status===401){state.authenticated=false;state.notebookAuthenticated=false;}}
  finally{state.busy=false;render();}
}
async function classLogin(event) {
  event.preventDefault();if(state.busy)return;
  const form=event.currentTarget,data=Object.fromEntries(new FormData(form));state.classLoginName=String(data.username||'').trim();state.busy=true;state.error='';
  const button=form.querySelector('button');button.disabled=true;button.textContent='로그인 중…';
  try {
    await api('/api/notebook',{method:'POST',body:JSON.stringify({action:'class-login',username:state.classLoginName,password:data.password})});
    state.authenticated=true;state.notebookAuthenticated=true;
    try{localStorage.setItem('homeroom-class-id',state.classLoginName);}catch{}
    if(/^3\d{2}$/.test(state.classLoginName))state.classNumber=String(Number(state.classLoginName.slice(1)));
    await openSharedCalendar();
  } catch(error) { state.error=error.message; }
  finally { data.password='';form.reset();state.busy=false;render(); }
}
async function login(event) {
  event.preventDefault();if(state.busy)return;state.busy=true;state.error='';
  let password=String(new FormData(event.currentTarget).get('password')||'');const button=event.currentTarget.querySelector('button');button.disabled=true;button.textContent='확인 중…';
  try {
    if(state.configured){await api('/api/session',{method:'POST',body:JSON.stringify({password})});state.authenticated=true;await openSharedCalendar();}
    else if(state.encrypted){load(await decryptDataset(state.encrypted,password),'encrypted');}
    else{throw new Error('일정에 연결하지 못했습니다. 새로고침해 주세요.');}
  } catch(error){state.error=error.message;}
  finally{password='';state.busy=false;render();}
}
async function init(){render();try{const result=await api('/api/session');if(!result.authenticated){location.replace('/notebook.html');return;}state.configured=true;state.authenticated=true;state.notebookAuthenticated=true;const data=await api('/api/calendar');acceptShared(data);state.month=state.data.defaultMonth;chooseDay();}catch(e){state.error=e.message;}state.checking=false;render();}
setInterval(()=>refreshShared(),30000);
window.addEventListener('focus',()=>refreshShared());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshShared();});
init();



