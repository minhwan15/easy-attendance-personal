import {renderPersonalAuth,openPersonalSettings} from './personal-ui.js';
import { openParentReports } from './notebook-parent-reports-ui.js';
import { reportQueueRecords } from './notebook-report-queue.js';
import { openExperienceWeek } from './notebook-experience-week-ui.js';
import { todayAttendance, attendanceStep, nextAttendanceAction } from './notebook-flow.js';
import { dailyExamRecords, mergeDailyRecords, isExamRecord } from './notebook-daily-records.js';
import { bindStudentMatcher } from './student-matcher.js';
import { queueDateRecords, queueDates, recordsForDateDisplay, displayQueueDates } from './notebook-queue-date.js';
import { normalizeParentReplies } from './notebook-parent-replies.js';
import { retainedExperienceConfirmations } from './notebook-experience-grid-model.js';
import { emptyRecord, normalizeRecord, parseSourceText, parseConversationCandidates, contentReadiness, readiness, experienceStatus, toNeisRows, exportCsv, parsePeriods, withAttendanceMeetings, ATTENDANCE_TYPES, REASON_TYPES } from './notebook-model.js';
import { todaySeoul } from './model.js';
import { schoolPeriodsForDate, formatSchoolPeriods, missedPeriods } from './school-timetable.js';
import { recognizeFiles, prepareAttachment } from './notebook-ocr.js';
import { openRosterManager } from './notebook-roster-ui.js';
import { findRepeatWarnings, needsRepeatCheck, repeatWarningMessage, warningPhrasesFor } from './notebook-repeat-warning.js';
import { openSettings } from './notebook-settings-ui.js';
import { reasonShortcuts } from './notebook-reason-shortcuts.js';
import { openPassEditor } from './notebook-pass-ui.js';
import { PASS_LABELS } from './notebook-pass-model.js';
import { academicYear } from './notebook-experience-usage.js';
import { createExperienceGrid } from './notebook-experience-grid-ui.js';
import { usageDays } from './notebook-experience-grid-model.js';
import { normalizeExperienceSettings } from './notebook-experience-settings.js';
import { openExperienceNeis } from './notebook-experience-neis.js';
import { applyNeisCompletion } from './notebook-neis-completion.js';
import { sendToNeisHelper, completedNeisRows, acknowledgeNeisRows } from './notebook-neis-bridge.js';
import { neisGuideHtml, chromeNeisNoticeHtml } from './notebook-neis-guide.js';
import { clipboardImages, clipboardText } from './notebook-paste.js';
import { parseAttendanceTable, openBatchEditor } from './notebook-batch.js';
import { isPracticalRecord } from './notebook-practical-model.js';
import { mountMorning } from './notebook-morning-ui.js';
import { isMorningRecord } from './notebook-morning-model.js';
import { mountPractical } from './notebook-practical-ui.js';
const sectionParam=new URLSearchParams(location.search).get('section');
const initialSection=['attendance','experience','practical','morning'].includes(sectionParam)?sectionParam:'home';
const pairing=new URLSearchParams(location.hash.slice(1)).get('connect');if(pairing){sessionStorage.setItem('easy-pair-pending',pairing);history.replaceState(null,'',location.pathname+location.search);}

const app = document.querySelector('#notebook-app');
const dialog = document.querySelector('#notebook-editor');
const toastElement = document.querySelector('#notebook-toast');
const demo = new URLSearchParams(location.search).get('demo') === '1';
const state = { user:null, records:[], students:[], parentReplies:normalizeParentReplies(), experienceSettings:normalizeExperienceSettings(), experienceView:'sheet', section:initialSection, queueDate:todaySeoul(), neisPurpose:'attendance', tab:initialSection==='experience'?'experience':'records', filter:'all', search:'', selected:new Set(), authMode:new URLSearchParams(location.search).get('auth')==='personal'?'login':'class', classLoginEnabled:false, classLoginName:'', experienceYear:academicYear(todaySeoul()), loading:false, error:'', revision:0 };
let draft = null, before = null, uploadController = null, editorWarnings = [], conversationCandidates = [], selectedCandidateId = '', manualIdentity = {}, periodEntry = {mode:'manual',arrivalTime:''}, toastTimer;
let morningView=null,rosterOpening=false;
let practicalView=null,practicalDraft={},recordWrites=0,sharedSyncBusy=false;
let experienceGrid = null, completionSyncBusy=false;
const sentSnapshots=new Map();
let savedRecords=[],examRecords=null,examOwner='';
const labels = { attendance:'출결', experience:'체험학습', counseling:'상담', activity:'활동·관찰' };
const sourceLabels = { memo:'메모', capture:'출결 신고 캡처', application:'체험학습 신청서', report:'체험학습 보고서' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const studentIdentity = value => Object.fromEntries(['studentId','studentName','classNumber','number'].map(key=>[key,value[key]||'']));
const uid = () => crypto.randomUUID();
const today = () => todaySeoul();
const shortDate = date => date ? `${Number(date.slice(5,7))}.${Number(date.slice(8,10))}` : '날짜 미정';
const rangeLabel = r => !r.startDate ? '날짜 미정' : r.endDate && r.endDate !== r.startDate ? `${shortDate(r.startDate)}–${shortDate(r.endDate)}` : shortDate(r.startDate);
const icons = {
  notebook:'<path d="M7 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"/><path d="M8 3v18M11 8h5M11 12h5"/>',
  camera:'<path d="M8 5 9.5 3h5L16 5h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><circle cx="12" cy="12" r="4"/>',
  pen:'<path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z"/>',
  paper:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3"/>',
  arrow:'<path d="m9 5 7 7-7 7"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  refresh:'<path d="M20 7V3l-3 3a8 8 0 1 0 3 9M20 7h-5"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cloud:'<path d="M6 18a5 5 0 0 1 0-10 6 6 0 0 1 12-1 5.5 5.5 0 0 1 0 11Z"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  chat:'<path d="M21 11a9 9 0 0 1-9 9H3l2-4a9 9 0 1 1 16-5Z"/><path d="M8 10h8M8 14h5"/>',
  leaf:'<path d="M20 3c-1 6 3 17-7 17A8 8 0 0 1 5 9c3-4 8-2 15-6ZM4 21 15 10"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.paper}</svg>`;
const canIssuePass = record => record.category==='attendance' && (record.passKind || ['조퇴','결과'].includes(record.attendanceType)) && (!record.endDate || record.endDate===record.startDate);
const categoryIcon = category => ({attendance:'calendar',experience:'leaf',counseling:'chat',activity:'notebook'}[category] || 'paper');

function toast(message) {
  clearTimeout(toastTimer); toastElement.textContent = message; toastElement.classList.add('visible');
  toastTimer = setTimeout(() => toastElement.classList.remove('visible'), 4500);
}
async function api(body, method='GET', path='/api/notebook') {
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(result.message||'저장하지 못했습니다. 다시 시도해 주세요.'),{status:response.status});return result;
}
function accept(result) {
  state.user = result.authenticated ? result.user : null;
  if(result.profile){state.profile=result.profile;globalThis.easyProfile=result.profile;}
  if(typeof result.classLoginEnabled==='boolean') state.classLoginEnabled=result.classLoginEnabled;
  savedRecords = (result.records || []).map(record=>record.category==='attendance'&&record.note?.startsWith('[예체능 미인정 조퇴]')?normalizeRecord(record):record);
  const owner=result.user?.username||'';
  if(examOwner!==owner){examRecords=null;examOwner=owner;}
  if(result.dailyExamEvents)examRecords=dailyExamRecords(result.dailyExamEvents,owner,result.students||[]);
  state.records=mergeDailyRecords(savedRecords,examRecords);
  if(result.dailyExamEvents)state.examError='';
  if(result.dailyExamError)state.examError='대학별고사 일정을 불러오지 못했습니다. 최신 기록 불러오기를 눌러 주세요.';
  state.students = [...(result.students || [])].sort((a,b)=>a.studentId.localeCompare(b.studentId));
  state.parentReplies=normalizeParentReplies(result.parentReplies);
  state.experienceSettings = normalizeExperienceSettings(result.experienceSettings || {});
  state.revision = result.revision || 0;
  const validIds = new Set(state.records.filter(r => readiness(r).ready && r.entryStatus !== 'confirmed').map(r => r.id));
  state.selected = new Set([...state.selected].filter(id => validIds.has(id)));
}
function knownStudents() {
  const roster=state.students.map(student=>({...student,name:student.studentName||student.name,studentName:student.studentName||student.name}));
  const rosterIds=new Set(roster.map(student=>student.studentId)),rosterNames=new Set(roster.map(student=>student.studentName));
  const fallback=state.records.filter(record=>record.studentId&&record.studentName&&!rosterIds.has(record.studentId)&&!rosterNames.has(record.studentName));
  const safe=fallback.filter(record=>!fallback.some(other=>(other.studentId===record.studentId&&other.studentName!==record.studentName)||(other.studentName===record.studentName&&other.studentId!==record.studentId)));
  const seen=new Set(rosterIds);
  for(const record of safe)if(!seen.has(record.studentId)){roster.push({studentId:record.studentId,name:record.studentName,studentName:record.studentName,classNumber:record.classNumber,number:record.number});seen.add(record.studentId);}
  return roster.sort((a,b)=>a.studentId.localeCompare(b.studentId));
}
function rememberedClassId() { try { const value=localStorage.getItem('homeroom-class-id')||'';return /^[123]\d{2}$/.test(value)&&!value.endsWith('00')?value:''; } catch { return ''; } }
function profileLabel() { const username=String(state.user?.username||'');return /^[123]\d{2}$/.test(username)?`${state.user.displayName||'담임'}`:`${state.user?.displayName||username} 선생님`; }
function header() {
 return `<header class="site-header"><div class="header-inner"><a class="brand" href="/notebook.html"><span class="personal-brand-mark" aria-hidden="true"><img src="/favicon.svg" alt="" width="52" height="52"></span><span class="personal-brand-copy"><span class="brand-kicker">EASY ATTENDANCE</span><span class="brand-title">쉬운출결<span class="brand-edition">PERSONAL</span></span><span class="brand-sub">${esc(state.profile?.schoolName||'담임 개인용')}${state.profile?` · ${state.profile.grade}학년 ${state.profile.classNumber}반`:''}</span></span></a><div class="header-actions"><button class="btn small" id="go-home">홈으로</button>${state.user?`<button class="text-btn roster-btn" id="open-roster">명렬표 ${state.students.length}명</button><button class="text-btn roster-btn" id="open-settings" type="button">경고 문구</button><button class="btn small personal-setup-btn" id="personal-settings">내 기기 연결 · 설정</button><button class="text-btn" id="logout">이 기기 연결 해제</button>`:''}</div></div></header>`;
}
function renderAuth(){renderPersonalAuth({app,header:header(),error:state.error,onConnected:result=>{accept(result);state.error='';render();}});}
function counts() {
  const scoped=state.records.filter(r=>state.section==='practical'?isPracticalRecord(r):state.section==='experience'?r.category==='experience':['attendance','experience'].includes(r.category));
  const experience=scoped.filter(r=>r.category==='experience');
  return { total:scoped.length, review:scoped.filter(r=>r.reviewStatus!=='reviewed').length,
    overdue:experience.filter(r=>experienceStatus(r,today()).overdue).length,
    waitingReport:experience.filter(r=>r.approvalStatus==='approved'&&r.reportStatus==='missing').length,
    ready:scoped.filter(r=>r.entryStatus!=='confirmed'&&readiness(r).ready).length };
}

function summaryDetailsHtml() {
 const kind=state.summaryKind;if(!kind)return '';
 const title={review:'보완할 기록',ready:'나이스 입력 준비',overdue:'기한 지난 미제출 보고서'}[kind];
 const records=state.records.filter(r=>state.section==='practical'?isPracticalRecord(r):state.section==='experience'?r.category==='experience':['attendance','experience'].includes(r.category)).filter(r=>kind==='review'?r.reviewStatus!=='reviewed':kind==='ready'?r.entryStatus!=='confirmed'&&readiness(r).ready:r.category==='experience'&&experienceStatus(r,today()).overdue);
 return `<section class="section-info" id="summary-details" aria-label="${title} 상세"><h2 style="font-size:18px;margin:0 0 12px">${title} · ${records.length}건</h2><p class="muted">현재 날짜 선택과 관계없이 전체 저장 기록 기준입니다.</p>${records.length?records.map(r=>{
 const errors=readiness(r).errors;
 const reason=kind==='review'?(errors.length?errors.join(' · '):'입력 내용 확인 후 저장이 필요합니다.'):kind==='ready'?`입력 내용 확인 완료 · 나이스 미입력 ${toNeisRows([r]).length}일`:`보고서 제출 기한 ${r.reportDueDate} 경과 · 보고서 미제출`;
 return `<article style="padding:14px 0;border-top:1px solid #dce5df"><strong>${esc(r.studentName||'학생 미지정')} ${esc(r.studentId)}</strong> · ${rangeLabel(r)}<p style="margin:6px 0">${isExamRecord(r)?'대학별고사':isPracticalRecord(r)?'예체능 미인정 조퇴':labels[r.category]||'기록'} · ${esc(r.reason||r.note||'내용 미작성')}</p><p style="margin:6px 0;font-size:13px">${esc(reason)}${r.category==='experience'&&['cancelled','rejected'].includes(r.approvalStatus)?' · '+esc(experienceStatus(r,today()).label):''}</p><button class="btn small" type="button" data-fix="${esc(r.id)}">${nextAttendanceAction(r).label}</button></article>`;
 }).join(''):'<p>해당 기록이 없습니다.</p>'}</section>`;
}
function changeSection(section){
  state.neisPurpose='attendance';
  state.todayType='';
  if(morningView?.isBusy()||practicalView?.isBusy()){toast('저장이 끝난 뒤 이동해 주세요.');return;}
  if(morningView?.hasPendingChanges()){toast('메모를 저장한 뒤 이동해 주세요.');return;}
  afterGridSave(()=>{state.section=section;state.tab=section==='experience'?'experience':'records';state.filter='all';state.search='';state.selected.clear();const url=new URL(location.href);if(section==='home')url.searchParams.delete('section');else url.searchParams.set('section',section);history.replaceState(null,'',url);render();});
}
function bindShell(){
  document.querySelector('#personal-settings')?.addEventListener('click',()=>openPersonalSettings({profile:state.profile,onSaved:result=>{accept(result);render();},notify:toast,saveBefore:saveGridBeforeLeaving}));

  document.querySelectorAll('[data-copy-extension-address]').forEach(button=>button.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText('chrome://extensions');button.textContent='복사됨 · 새 탭 주소창에 붙여넣기';}
    catch{window.prompt('아래 주소를 복사해 새 탭 주소창에 붙여넣으세요.','chrome://extensions');}
  }));
  document.querySelector('#go-home')?.addEventListener('click',()=>changeSection('home'));
  document.querySelector('#open-roster')?.addEventListener('click',()=>afterGridSave(openRoster));
  document.querySelector('#open-settings')?.addEventListener('click',()=>afterGridSave(openClassSettings));
  document.querySelector('#logout')?.addEventListener('click',async()=>{if(!await saveGridBeforeLeaving())return;if(!confirm('이 기기의 연결을 해제할까요? 다른 기기 또는 복구 코드로 다시 연결할 수 있습니다.'))return;if(demo){location.href='/notebook.html';return;}try{await api({action:'logout'},'POST');accept({authenticated:false});state.section='home';render();}catch(error){toast(error.message);}});
}
function wasSent(record){
 const snapshot=sentSnapshots.get(record.id);if(!snapshot)return false;
 const saved=toNeisRows([{...snapshot,entryStatus:'pending',neisConfirmedDates:[]}]);
 return toNeisRows([{...record,entryStatus:'pending',neisConfirmedDates:[]}]).every(row=>saved.some(item=>JSON.stringify(item)===JSON.stringify(row)));
}
function todayHomeHtml(){
 const info=todayAttendance(state.records,today());
 return `<section class="home-today" aria-label="오늘 출결"><h2>오늘 출결 <small>${shortDate(today())}</small></h2><div class="home-today-counts">${Object.entries(info.counts).map(([type,count])=>`<button type="button" data-today-type="${type}">${type}<strong>${count}건</strong></button>`).join('')}<button type="button" data-today-type="pending">나이스 미입력<strong>${info.pending}건</strong></button></div><button class="btn small" type="button" data-today-type="all">오늘 출결 전체 보기</button></section>`;
}
function bindTodayHome(){
 document.querySelectorAll('[data-today-type]').forEach(b=>b.onclick=()=>{
  state.section='attendance';state.tab='records';state.queueDate=today();state.search='';state.filter='all';state.todayType=b.dataset.todayType==='all'?'':b.dataset.todayType;state.selected.clear();render();
 });
}
function showDeleteUndo(record){
 const owner=state.user?.username,snapshot=clone(record);
 document.getElementById('delete-undo')?.remove();
 const box=document.createElement('div');box.id='delete-undo';box.className='delete-undo';box.setAttribute('role','status');
 const text=document.createElement('span');text.textContent='기록을 삭제했습니다.';
 const button=document.createElement('button');button.type='button';button.textContent='삭제 취소';
 const close=document.createElement('button');close.type='button';close.textContent='닫기';
 close.onclick=()=>box.remove();
 button.onclick=async()=>{
  if(state.user?.username!==owner){box.remove();return;}
  if(draft||experienceGrid?.hasPendingChanges()||morningView?.hasPendingChanges()){toast('작성 중인 내용을 먼저 저장해 주세요.');return;}
  button.disabled=true;
  try{await persistRecord(snapshot,null);box.remove();render();toast('삭제한 기록을 복구했습니다.');}
  catch(error){text.textContent='복구하지 못했습니다. '+error.message;button.disabled=false;}
 };
 box.append(text,button,close);document.body.append(box);
}
function renderHome(){
  document.title='쉬운출결';
  app.innerHTML=`${header()}<main class="page home-page"><section class="home-heading"><div class="eyebrow">${esc(state.profile?.schoolName||'우리 반')}</div><h1>출결 업무,<br>쉽고 한눈에.</h1><p>오늘 필요한 업무를 선택하세요.</p></section><div class="pc-tools">${chromeNeisNoticeHtml()}</div>${todayHomeHtml()}<p class="mobile-pc-note">폰에서는 기록을 작성하고, 나이스 전송은 PC Chrome에서 이어서 하세요.</p><button class="morning-shortcut" type="button" data-section="morning">${icon('pen')}<span><strong>아침 출결 메모</strong><small>이름 · 사유 · 결석/지각/조퇴, 바로 저장</small></span>${icon('arrow')}</button><button class="morning-shortcut" type="button" id="home-pass">${icon('paper')}<span><strong>외출·조퇴증</strong><small>바로 작성 · 저장하고 출력</small></span>${icon('arrow')}</button><section class="home-grid" aria-label="출결 업무 선택">${[
    ['attendance','calendar','일일출결관리','캡처·메모로 정리하고 나이스 입력까지'],
    ['exams','paper','대학별고사 인정결석','대학별 고사 일정과 증빙을 한눈에'],
    ['experience','leaf','체험학습','신청서·보고서와 누적 사용일수 관리'],
    ['practical','clock','예체능 미인정 조퇴','학생·기간·참석 교시를 정해 일괄 입력']
  ].filter(([section])=>section!=='exams'||Number(state.profile?.grade)===3).map(([section,art,title,detail],index)=>`<button class="home-card" data-section="${section}" type="button"><span class="home-card-icon">${icon(art)}</span><span class="home-card-number">0${index+1}</span><h2>${title}</h2><p>${detail}</p><span class="home-card-enter">열기 ${icon('arrow')}</span></button>`).join('')}</section><p class="home-note">연결된 내 기기에서 우리 반 자료를 이어서 이용합니다.</p><div class="pc-tools">${neisGuideHtml({chromeNotice:false})}</div><footer class="page-footer"><span>쉬운출결 · 담임 개인용</span><span>정왕고 김민환</span></footer></main>`;
  bindShell();bindTodayHome();document.querySelector('#home-pass').onclick=()=>openPass();document.querySelectorAll('.home-page [data-section]').forEach(button=>button.onclick=()=>{if(button.dataset.section==='exams')location.href='/exams.html';else changeSection(button.dataset.section);});
}
function renderMorning(){
  document.title='아침 출결 메모 · 쉬운출결';
  app.innerHTML=`${header()}<main class="page morning-page"><section class="page-heading"><div><div class="eyebrow">쉬운출결</div><h1>아침 출결 메모</h1><p>이름 · 사유 · 결석/지각/조퇴, 짧게 적고 저장하세요.</p></div></section><div id="morning-root"></div></main>`;
  bindShell();morningView=mountMorning({root:document.querySelector('#morning-root'),students:knownStudents(),records:state.records,today:today(),escape:esc,replies:state.parentReplies,saveReplies:async(replies,beforeReplies)=>{if(demo){state.parentReplies=normalizeParentReplies(replies);return state.parentReplies;}accept(await api({action:'save-parent-replies',replies,beforeReplies},'POST'));return state.parentReplies;},save:persistRecord,notify:toast,onSaved:()=>render(),onRoster:openRoster,
    onNeis:records=>{if(!records.length){toast('나이스 입력 준비가 된 오늘 메모가 없습니다.');return;}state.section='attendance';state.tab='queue';state.queueDate=today();state.selected=new Set(records.map(record=>record.id));render();exportSelected('helper');}});
  bindRecordDelete();
}
function renderPractical(){
  document.title='예체능 미인정 조퇴 · 쉬운출결';
  app.innerHTML=`${header()}<main class="page"><section class="page-heading"><div><div class="eyebrow">쉬운출결</div><h1>예체능 미인정 조퇴</h1><p>반복되는 실기 준비 조퇴를 기간별로 관리하세요.</p></div></section><div id="practical-root" class="workspace practical-workspace"></div></main>`;
  bindShell();practicalView=mountPractical({root:document.querySelector('#practical-root'),students:knownStudents(),records:[...state.records],blockedDates:state.experienceSettings.blockedDates,today:today(),escape:esc,save:record=>persistRecord(record,null),notify:toast,draft:practicalDraft,onChange:value=>{practicalDraft=value;},
    onSaved:()=>{render();toast('일괄 기록을 저장했습니다. 나이스 입력 대기에서 보낼 수 있습니다.');},onQueue:()=>{state.tab='queue';state.queueDate='';state.selected=new Set(state.records.filter(r=>isPracticalRecord(r)&&readiness(r).ready&&r.entryStatus!=='confirmed').map(r=>r.id));render();}});
  document.querySelector('#practical-roster').onclick=openRoster;
  bindRecordDelete();
  document.querySelectorAll('[data-practical-open]').forEach(button=>button.onclick=()=>openEditor(state.records.find(record=>record.id===button.dataset.practicalOpen)));
}
function render() {
  app.onclick=null;app.dataset.section=state.section;
  experienceGrid?.destroy(); experienceGrid = null;practicalView=null;morningView=null;
  if (!state.user) { renderAuth(); return; }
  if(state.section==='home'){renderHome();return;}
  if(state.section==='morning'){renderMorning();return;}
  if(state.section==='practical'&&state.tab!=='queue'){renderPractical();return;}
  document.title=`${state.section==='experience'?'체험학습':state.section==='practical'?'예체능 미인정 조퇴':'일일출결관리'} · 쉬운출결`;
  const n=counts();
  app.innerHTML = `${header()}<main class="page ${state.tab==='experience'&&state.experienceView==='sheet'?'page-experience-sheet':''}"><section class="page-heading"><div><div class="eyebrow">쉬운출결</div><h1>${state.tab==='experience'?'체험학습 날짜별 관리':state.section==='practical'?'예체능 미인정 조퇴 · 나이스 입력':'일일출결관리'}</h1><p>${state.tab==='experience'?'학생별 신청서·보고서와 사용일수를 한눈에 확인하세요.':'기록을 모으고, 서류를 챙기고, 나이스에 입력할 내용을 준비합니다.'}</p></div><span class="today-label">${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date())}</span></section><section class="summary-grid" aria-label="기록 요약"><button type="button" class="summary-card" data-summary="review" aria-expanded="${state.summaryKind==='review'}" aria-controls="summary-details" style="text-align:left;cursor:pointer"><div><p class="summary-label">보완할 기록</p><p class="summary-value">${n.review}<small>건</small></p></div><span class="summary-icon">${icon('notebook')}</span></button>${n.overdue>0?`<button type="button" class="summary-card amber" data-summary="overdue" aria-expanded="${state.summaryKind==='overdue'}" aria-controls="summary-details" style="text-align:left;cursor:pointer"><div><p class="summary-label">기한 지난 미제출 보고서</p><p class="summary-value">${n.overdue}<small>건</small></p></div><span class="summary-icon">${icon('clock')}</span></button>`:''}<button type="button" class="summary-card" data-summary="ready" aria-expanded="${state.summaryKind==='ready'}" aria-controls="summary-details" style="text-align:left;cursor:pointer"><div><p class="summary-label">나이스 입력 준비</p><p class="summary-value">${n.ready}<small>건</small></p></div><span class="summary-icon">${icon('check')}</span></button></section>${summaryDetailsHtml()}<section class="quick-grid" aria-label="새 기록"><button class="quick-action" id="open-morning">${icon('pen')}<span><strong>아침 출결 메모</strong><small>이름 · 사유 · 결석/지각/조퇴</small></span></button><button class="quick-action" data-new="capture">${icon('camera')}<span><strong>캡처 올리기</strong><small>클릭 또는 Ctrl+V로 붙여넣기</small></span></button><button class="quick-action" data-new="memo">${icon('pen')}<span><strong>메모 작성</strong><small>출결·상담·활동 기록</small></span></button><button class="quick-action pass-quick-action" id="new-pass">${icon('paper')}<span><strong>외출·조퇴증</strong><small>출력과 출결 기록을 한 번에</small></span></button><button class="quick-action" id="open-experience-sheet">${icon('leaf')}<span><strong>체험학습 입력</strong><small>날짜별 표로 한눈에</small></span></button><button class="quick-action" data-new="report">${icon('check')}<span><strong>보고서 등록</strong><small>기존 신청 건에 연결</small></span></button></section><div class="error-banner" role="alert">${esc(state.error||state.examError)}</div><section class="workspace">${state.section==='attendance'?'<div class="section-caption attendance-list-heading"><strong>출결 기록 · 나이스 입력</strong></div>':`<nav class="tabs" aria-label="기록 분류">${[[state.section==='experience'?'experience':'records',state.section==='experience'?'신청·보고서':state.section==='practical'?'조퇴 기간':'출결 기록',filteredRecords().length],['queue','나이스 입력 대기',n.ready]].map(([value,label,count])=>`<button class="tab ${state.tab===value?'active':''}" data-tab="${value}" aria-current="${state.tab===value?'page':'false'}">${label}<span class="tab-count">${count}</span></button>`).join('')}</nav>`}<div class="workspace-body"><div class="toolbar" ${state.tab==='experience'&&state.experienceView==='sheet'?'hidden':''}><label class="search">${icon('search')}<input id="record-search" type="search" aria-label="학생·내용 검색" placeholder="학번, 이름, 기록 내용 검색" value="${esc(state.search)}"></label><select id="record-filter" aria-label="기록 필터">${filterOptions()}</select><button class="icon-btn" id="refresh" aria-label="최신 기록 불러오기" title="최신 기록 불러오기">${icon('refresh')}</button></div>${state.todayType?`<p class="daily-type-filter">${state.todayType==='pending'?'나이스 미입력':esc(state.todayType)}만 표시 중 <button class="btn small" type="button" id="clear-today-type">전체 보기</button></p>`:''}<div id="workspace-content">${workspaceContent()}</div></div></section><footer class="page-footer"><span>${demo ? '예시 모드 · 새로고침하면 원래 예시로 돌아갑니다.' : '연결한 내 휴대폰·PC에서 이어서 사용합니다. 기록은 서버에 저장됩니다.'}</span><span>정왕고 김민환 · 담임 업무 도우미</span></footer></main>`;
  bindPage();
}
function filterOptions() {
  const options=state.tab==='experience' ? [['all','전체 상태'],['review','작성 중'],['report','보고서 미제출'],['overdue','보고서 기한 지남'],['confirmed','입력 확인 완료']] : [['all','전체 기록'],['review','작성 중'],['ready','입력 준비 완료'],['confirmed','입력 확인 완료']];
  return options.map(([value,label])=>`<option value="${value}" ${state.filter===value?'selected':''}>${label}</option>`).join('');
}
function filteredRecords() {
  const query=state.search.trim().toLowerCase();
  return state.records.filter(r=>{
    if(state.section==='attendance'&&state.todayType&&state.todayType!=='pending'&&r.attendanceType!==state.todayType)return false;
    if(state.section==='attendance'&&state.todayType==='pending'&&recordsForDateDisplay([r],state.queueDate).every(x=>x.entryStatus==='confirmed'))return false;
    if(state.section==='practical'&&!isPracticalRecord(r))return false;
    if(state.section==='experience'&&r.category!=='experience')return false;
    if(state.section==='attendance'&&!['attendance','experience'].includes(r.category))return false;
    if(state.tab==='experience'&&r.category!=='experience') return false;
    if(query && ![r.studentId,r.studentName,r.reason,r.note,r.sourceText,r.location].join(' ').toLowerCase().includes(query)) return false;
    if(state.filter==='review'&&r.reviewStatus==='reviewed') return false;
    if(state.filter==='ready'&&(!readiness(r).ready||r.entryStatus==='confirmed')) return false;
    if(state.filter==='confirmed'&&r.entryStatus!=='confirmed') return false;
    if(state.filter==='report'&&r.reportStatus!=='missing') return false;
    if(state.filter==='overdue'&&!experienceStatus(r,today()).overdue) return false;
    return true;
  }).sort((a,b)=>(a.studentId||'').localeCompare(b.studentId||'')||(b.updatedAt||'').localeCompare(a.updatedAt||'')||(b.startDate||'').localeCompare(a.startDate||''));
}
function empty(message='아직 기록이 없습니다.', detail='캡처를 올리거나 짧은 메모부터 남겨 보세요.', action=true) {
  return `<div class="empty"><div class="empty-icon">${icon('notebook')}</div><h3>${message}</h3><p>${detail}</p>${action?'<button class="btn primary" data-new="memo">첫 기록 작성하기</button>':''}</div>`;
}
function recordCard(r,{queue=false,blockers=false}={}) {
  const displayPeriods=withAttendanceMeetings(r.periods,r.attendanceType,{date:r.startDate,lessonCount:r.lessonCount});
  const reportMode=queue&&state.neisPurpose==='report';
  const ready=readiness(r), exp=r.category==='experience'?experienceStatus(r,today()):null;
  return `<article class="record-card ${r.entryStatus==='confirmed'&&!reportMode?'record-completed':''}">${queue&&ready.ready&&(reportMode?reportQueueRecords([r],state.queueDate).length:r.entryStatus!=='confirmed')?`<input type="checkbox" data-select="${esc(r.id)}" aria-label="${esc(r.studentName||'이름 미확인')} ${rangeLabel(r)} 선택" ${state.selected.has(r.id)?'checked':''}>`:''}<button class="record-open" data-open="${esc(r.id)}"><span class="category-icon ${esc(r.category)}">${icon(categoryIcon(r.category))}</span><span class="record-main"><span class="record-title">${esc(r.studentName||'학생 확인 필요')}<span class="student-number">${esc(r.studentId || (r.classNumber&&r.number?`${r.classNumber}반 ${r.number}번`:''))}</span></span><span class="record-sub"><span>${isExamRecord(r)?'대학별고사':isPracticalRecord(r)?'예체능 미인정 조퇴':labels[r.category]||'기록'}</span><span>${rangeLabel(r)}</span><span>${sourceLabels[r.sourceType]||'메모'}${r.attachments?.length?` · 첨부 ${r.attachments.length}`:''}</span></span><span class="record-summary">${esc(r.reason || r.note || r.sourceText || '내용을 정리해 주세요.')}</span><span class="record-tags">${r.passKind?`<span class="badge pass-badge">${PASS_LABELS[r.passKind]} · ${esc(r.departureTime)}</span>`:''}${r.periods?`<span class="badge">${esc(r.attendanceType||"출결")} · ${esc(displayPeriods)}</span>`:''}${r.neisConfirmedDates?.length&&r.entryStatus!=='confirmed'?`<span class="badge green">나이스 ${r.neisConfirmedDates.length}일 완료 · ${toNeisRows([r]).length}일 남음</span>`:''}${isExamRecord(r)&&r.reviewStatus!=='reviewed'?`<span class="badge amber">${esc(r.note)}</span>`:''}<span class="badge ${r.entryStatus==='confirmed'?'green':'amber'}">${esc(attendanceStep(r,wasSent(r)))}</span>${exp?`<span class="badge ${exp.overdue?'red':exp.tone==='success'?'green':'amber'}">${esc(exp.label)}</span>`:''}${r.category==='experience'&&r.reportDueDate?`<span class="badge ${exp?.overdue?'red':''}">보고서 기한 ${shortDate(r.reportDueDate)}</span>`:''}${r.attendanceDates?.length?`<span class="badge">출결일 ${r.attendanceDates.length}일 선택</span>`:''}</span>${blockers&&!ready.ready?`<span class="blockers">${esc(ready.errors.join(' · '))}</span>`:''}</span></button><div class="card-right">${canIssuePass(r)?`<button class="btn small soft" data-pass="${esc(r.id)}">${r.passKind?'다시 출력':'증서 출력'}</button>`:''}${r.category==='experience'&&r.reportStatus==='missing'?`<button class="btn small soft" data-report="${esc(r.id)}">보고서 등록</button>`:''}${queue&&!reportMode&&ready.ready&&r.entryStatus!=='confirmed'?`<button class="btn small" data-confirm="${esc(r.id)}">저장 확인</button>`:''}${!reportMode&&(r.entryStatus==='confirmed'||r.neisConfirmedDates?.length)?`<button class="btn small" data-reset-neis="${esc(r.id)}">미입력으로 되돌리기</button>`:''}<button class="text-btn" data-open="${esc(r.id)}" aria-label="${esc(r.studentName||'기록')} 수정">수정</button><button class="btn small danger" ${isExamRecord(r)?'hidden':''} data-delete="${esc(r.id)}" aria-label="${esc(r.studentName||'기록')} 삭제">삭제</button></div></article>`;
}
function workspaceContent() {
  const records=filteredRecords();
  if(state.section==='attendance'||state.tab==='queue') return queueContent(records);
  let top='';
  if(state.tab==='experience') {
    top=`<div class="experience-view-tabs"><button type="button" class="btn small ${state.experienceView==='sheet'?'primary':''}" data-experience-view="sheet">날짜별 표</button><button type="button" class="btn small ${state.experienceView==='records'?'primary':''}" data-experience-view="records">신청서·보고서 목록</button><button type="button" class="btn small" data-new="application">신청서·사진 등록</button></div>`;
    if(state.experienceView==='sheet')return `${top}<div id="experience-grid-root"></div>`;
  }
  return `${top}<p class="section-caption"><span>${records.length}건의 기록</span><span>눌러서 원문 확인·수정</span></p>${records.length?`<div class="record-list">${records.map(r=>recordCard(r)).join('')}</div>`:empty(state.search||state.filter!=='all'?'해당하는 기록이 없습니다.':'아직 기록이 없습니다.',state.search||state.filter!=='all'?'검색어나 필터를 바꿔 확인해 주세요.':'캡처를 올리거나 짧은 메모부터 남겨 보세요.',!state.search&&state.filter==='all')}<p class="helper-note">불일치 시 증빙서류 기준으로 수정 요망.</p>`;
}
function sendQueueRecords(records,date=state.queueDate){return state.neisPurpose==='report'?reportQueueRecords(records,date):queueDateRecords(records,date);}
function queueContent(records) {
  const reportMode=state.neisPurpose==='report',unified=state.section==='attendance',visible=recordsForDateDisplay(records,state.queueDate).filter(record=>!reportMode||reportQueueRecords([record],state.queueDate).length);
  const ready=sendQueueRecords(records,state.queueDate);
  const dateChoices=reportMode?displayQueueDates(reportQueueRecords(records)):unified?displayQueueDates(records):queueDates(records);
  const dateControls=`<div class="queue-date-tools"><label>입력 날짜<input type="date" id="queue-date" value="${state.queueDate}"></label><button class="btn small ${state.queueDate===today()?'primary':''}" data-queue-date="${today()}">오늘</button><button class="btn small ${!state.queueDate?'primary':''}" data-queue-date="">전체 날짜</button></div><details class="queue-date-history"><summary>기록 있는 날짜 · ${dateChoices.length}일</summary><div class="queue-date-list">${dateChoices.map(date=>`<button class="btn small ${state.queueDate===date?'primary':''}" data-queue-date="${date}">${date===today()?'오늘 · ':''}${date.slice(5).replace('-','/')} · ${(reportMode?reportQueueRecords(records,date):unified?recordsForDateDisplay(records,date):queueDateRecords(records,date)).length}건</button>`).join('')}</div></details>`;
  const bulkLessonTargets=unified&&state.queueDate?state.records.filter(r=>r.category==='attendance'&&r.startDate===state.queueDate&&!isPracticalRecord(r)&&!isExamRecord(r)):[];
  const storedBulkCounts=[...new Set(bulkLessonTargets.map(r=>Number(r.lessonCount)).filter(count=>Number.isInteger(count)&&count>=1&&count<=8))];
  const bulkLessonDefault=storedBulkCounts.length===1?storedBulkCounts[0]:schoolPeriodsForDate(state.queueDate).length;
  const blocked=records.filter(r=>!readiness(r).ready&&r.entryStatus!=='confirmed');
  return `<div class="neis-purpose-tools" role="group" aria-label="나이스 작업 선택"><button type="button" class="btn small pc-tools ${reportMode?'':'primary'}" data-neis-purpose="attendance" aria-pressed="${!reportMode}">일일출결 입력</button><button type="button" class="btn small pc-tools ${reportMode?'primary':''}" data-neis-purpose="report" aria-pressed="${reportMode}">학부모 신고서 접수</button><button class="btn small soft" type="button" data-parent-reports title="나이스 엑셀을 올려 미제출·접수대기 확인">학부모 신고서 제출 확인</button></div>${dateControls}${unified&&state.queueDate?`<div class="queue-date-tools bulk-lesson-tools"><label>이 날짜 실제 수업<select id="bulk-lesson-count"><option value="" disabled ${bulkLessonDefault?'':'selected'}>교시 선택</option><option value="1" ${bulkLessonDefault===1?'selected':''}>1교시</option><option value="2" ${bulkLessonDefault===2?'selected':''}>2교시</option><option value="3" ${bulkLessonDefault===3?'selected':''}>3교시</option><option value="4" ${bulkLessonDefault===4?'selected':''}>4교시</option><option value="5" ${bulkLessonDefault===5?'selected':''}>5교시</option><option value="6" ${bulkLessonDefault===6?'selected':''}>6교시</option><option value="7" ${bulkLessonDefault===7?'selected':''}>7교시</option><option value="8" ${bulkLessonDefault===8?'selected':''}>8교시</option></select></label><button class="btn small primary" type="button" id="bulk-lesson-save" ${bulkLessonTargets.length?'':'disabled'}>이 날짜 학생 ${bulkLessonTargets.length}명 일괄 수정</button><small>선택한 날짜의 출결 기록 전체에 적용합니다.</small></div>`:''}<div class="section-info">${reportMode?'<strong>출결 입력을 완료한 기록도 신고서 접수용으로 다시 보낼 수 있습니다.</strong><br>보낸 뒤 도우미에서 ‘학부모 신고서 접수’를 선택하세요.':'<strong>① 기록 선택 → ② 선택한 기록 보내기 → ③ 나이스 탭에서 입력·저장</strong><br>보내기 버튼은 설치한 나이스 도우미로 기록을 전달합니다.'}</div>${(unified?visible.length:ready.length)?`<div class="export-toolbar neis-main-action"><label class="check-label"><input type="checkbox" id="select-all" ${ready.length&&ready.every(r=>state.selected.has(r.id))?'checked':''} ${!ready.length?'disabled':''}> ${state.queueDate?`${shortDate(state.queueDate)} 전체`:'모든 날짜 전체'} ${ready.length}건 선택</label><div class="neis-send-action"><span data-neis-choice>보낼 기록을 선택하세요</span><button class="btn small primary" id="send-neis-helper">${icon('check')}${reportMode?'선택한 기록 신고서 접수용으로 보내기':'선택한 기록 보내기'}</button><small>${reportMode?'도우미에서 학부모 신고서 접수 선택':'설치한 나이스 도우미로 바로 전달'}</small></div></div><p class="neis-transfer-status" data-neis-transfer-status role="status"></p><details class="neis-other-methods" data-neis-other><summary>다른 방법 · 직접 붙여넣기 또는 파일로 옮기기</summary><div class="neis-alternative-actions"><div><button class="btn small" id="copy-rows">${icon('copy')}붙여넣을 내용 복사</button><p>도우미 없이 나이스 입력칸에 직접 붙여 넣을 때</p></div><div><button class="btn small" id="export-csv">${icon('download')}엑셀로 확인할 파일 저장</button><p>선택한 내용을 표로 확인하는 CSV 파일</p></div><div><button class="btn small" id="export-json">${icon('download')}도우미에서 불러올 파일 저장</button><p>직접 연결이 안 되거나 다른 PC로 옮길 때 · 도우미의 ‘나이스 입력용 JSON 열기’에서 불러옵니다.</p></div></div></details><div class="record-list">${(unified||reportMode?visible:ready).map(r=>recordCard(r,{queue:true,blockers:!readiness(r).ready})).join('')}</div>`:empty(state.queueDate?`${shortDate(state.queueDate)} ${unified?'기록':'미입력 기록'}이 없습니다.`:'입력 준비가 완료된 기록이 없습니다.','다른 날짜를 선택하거나 새 기록을 저장하세요.',false)}${!unified&&blocked.length?`<h3 class="not-ready-label">내용 확인이 필요한 기록 · ${blocked.length}건</h3><div class="record-list">${blocked.map(r=>recordCard(r,{blockers:true})).join('')}</div>`:''}${neisGuideHtml()}`;
}
function renderWorkspace() {
  experienceGrid?.destroy(); experienceGrid = null;
  document.querySelector('#workspace-content').innerHTML=workspaceContent(); bindWorkspace();
}
function bindPage() {
  document.querySelectorAll('[data-summary]').forEach(button=>button.onclick=()=>afterGridSave(()=>{state.summaryKind=state.summaryKind===button.dataset.summary?null:button.dataset.summary;render();}));
  bindShell();
  document.querySelector('#clear-today-type')?.addEventListener('click',()=>{state.todayType='';render();});
  document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>afterGridSave(()=>{state.tab=button.dataset.tab;state.filter='all';state.selected.clear();render();}));
  document.querySelectorAll('.quick-grid [data-new]').forEach(button=>button.onclick=()=>afterGridSave(()=>startNew(button.dataset.new)));
  document.querySelector('#open-experience-sheet').onclick=()=>afterGridSave(()=>{state.section='experience';state.tab='experience';state.experienceView='sheet';state.filter='all';render();});
  document.querySelector('#record-search').oninput=event=>{state.search=event.target.value;renderWorkspace();};
  bindStudentMatcher({inputs:[document.querySelector('#record-search')],students:knownStudents,autoSelectId:false,onSelect:student=>{document.querySelector('#record-search').value=student.studentId;state.search=student.studentId;renderWorkspace();}});
  document.querySelector('#record-filter').onchange=event=>{state.filter=event.target.value;renderWorkspace();};
  document.querySelector('#refresh').onclick=refresh;
  document.querySelector('#new-pass').onclick=()=>afterGridSave(()=>openPass());
  document.querySelector('#open-morning').onclick=()=>changeSection('morning');
  bindWorkspace();
}
function bindRecordDelete(root=document) {
  root.querySelectorAll('[data-delete]').forEach(button=>button.onclick=async()=>{
    if(morningView?.hasPendingChanges()){toast('작성 중인 메모를 먼저 저장해 주세요.');return;}
    if(recordWrites||practicalView?.isBusy())return;
    const record=state.records.find(r=>r.id===button.dataset.delete);if(!record)return;
    if(!confirm(`${record.studentId} ${record.studentName} · ${rangeLabel(record)}\n이 앱의 기록을 삭제할까요? 삭제 직후 ‘삭제 취소’로 복구할 수 있습니다.${record.entryStatus==='confirmed'||record.neisConfirmedDates?.length?'\n나이스에 저장한 출결은 그대로 남습니다.':''}`))return;
    button.disabled=true;recordWrites++;
    try{if(demo)state.records=state.records.filter(r=>r.id!==record.id);else accept(await api({id:record.id,before:record},'DELETE'));state.selected.delete(record.id);render();showDeleteUndo(record);}
    catch(error){toast(error.status===409?'다른 기기에서 수정된 기록입니다. 새로고침 후 다시 확인해 주세요.':error.message);button.disabled=false;}
    finally{recordWrites--;}
  });
}
function bindWorkspace() {
  document.querySelector('[data-parent-reports]')?.addEventListener('click',()=>openParentReports({records:state.records,today:today(),onOpen:openEditor}));
  document.querySelectorAll('[data-neis-purpose]').forEach(button=>button.onclick=()=>{state.neisPurpose=button.dataset.neisPurpose;state.filter='all';state.todayType='';state.selected.clear();render();});
  document.querySelectorAll('[data-fix]').forEach(b=>b.onclick=()=>afterGridSave(()=>{
   const r=state.records.find(x=>x.id===b.dataset.fix);if(!r)return;
   const action=nextAttendanceAction(r);
   if(action.field==='arrival'){changeSection('morning');document.querySelector(`[data-morning-edit="${r.id}"]`)?.click();const input=document.querySelector('#morning-arrival');if(input){input.closest('details').open=true;input.focus();}return;}
   openEditor(r);const input=document.getElementById('f-'+action.field);input?.scrollIntoView({block:'center'});input?.focus();
  }));
  bindRecordDelete();
  const gridRoot=document.querySelector('#experience-grid-root');
  if(gridRoot)experienceGrid=createExperienceGrid({root:gridRoot,records:state.records,students:knownStudents(),settings:state.experienceSettings,today:today(),
    saveRecord:async(record,previous)=>{await persistRecord(record,previous);return notebookSnapshot();},
    saveSettings:async(settings,beforeSettings)=>{if(demo)state.experienceSettings=normalizeExperienceSettings(settings);else accept(await api({action:'save-experience-settings',settings,beforeSettings},'POST'));return notebookSnapshot();},
    loadLatest:async()=>{if(!demo)accept(await api());return notebookSnapshot();},
    onSaved:()=>{state.error='';refreshTabCounts();},onDetails:record=>afterGridSave(()=>openEditor(state.records.find(item=>item.id===record.id)||record)),
    onNeis:async selection=>{try{await syncNeisCompletions();if(!demo)accept(await api());if(selection.weekDate){openExperienceWeek({date:selection.weekDate,today:today(),loadLatest:async()=>{await syncNeisCompletions();if(!demo)accept(await api());return notebookSnapshot();},saveRecord:persistRecord,onDetails:openEditor,onSend:chosen=>openExperienceNeis({...chosen,blockedDates:state.experienceSettings.blockedDates})});}else openExperienceNeis({...selection,records:selection.allPending?state.records.filter(r=>r.category==='experience'):selection.records,blockedDates:state.experienceSettings.blockedDates});}catch(error){toast(error.message);}},
    onRoster:()=>afterGridSave(openRoster),notify:toast});
  document.querySelectorAll('[data-experience-view]').forEach(button=>button.onclick=()=>afterGridSave(()=>{state.experienceView=button.dataset.experienceView;render();}));
  document.querySelectorAll('#workspace-content [data-new]').forEach(b=>b.onclick=()=>afterGridSave(()=>startNew(b.dataset.new)));
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const record=state.records.find(r=>r.id===b.dataset.open);record?.passKind?openPass(record):openEditor(record);});
  document.querySelectorAll('[data-pass]').forEach(b=>b.onclick=()=>openPass(state.records.find(r=>r.id===b.dataset.pass)));
  document.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>openEditor(state.records.find(r=>r.id===b.dataset.report),'report'));
  document.querySelectorAll('[data-select]').forEach(input=>input.onchange=()=>{input.checked?state.selected.add(input.dataset.select):state.selected.delete(input.dataset.select);const all=document.querySelector('#select-all');if(all)all.checked=sendQueueRecords(filteredRecords(),state.queueDate).every(r=>state.selected.has(r.id));updateNeisActions();});
  document.querySelectorAll('[data-reset-neis]').forEach(b=>b.onclick=async()=>{const r=state.records.find(x=>x.id===b.dataset.resetNeis);if(!r)return;try{await persistRecord({...r,entryStatus:'pending',neisConfirmedDates:[]},r);render();toast('미입력으로 되돌렸습니다. 도우미로 다시 보내 주세요.');}catch(error){toast(error.message);}});
  document.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=()=>confirmEntry(b.dataset.confirm));
  const chooseQueueDate=date=>{state.todayType='';state.queueDate=date;state.selected.clear();renderWorkspace();};
  document.querySelectorAll('[data-queue-date]').forEach(button=>button.onclick=()=>chooseQueueDate(button.dataset.queueDate));
  const bulkLessonSave=document.querySelector('#bulk-lesson-save');
  if(bulkLessonSave)bulkLessonSave.onclick=async()=>{
    const count=Number(document.querySelector('#bulk-lesson-count')?.value);
    const targets=state.records.filter(r=>r.category==='attendance'&&r.startDate===state.queueDate&&!isPracticalRecord(r)&&!isExamRecord(r));
    if(!Number.isInteger(count)||count<1||count>8||!targets.length)return;
    if(!confirm(`${state.queueDate} 출결 기록 ${targets.length}건의 실제 수업을 ${count}교시로 일괄 수정할까요? 지각·조퇴의 빠진 교시도 새 시간표에 맞춰 조정됩니다.`))return;
    bulkLessonSave.disabled=true;let saved=0;
    try{
      for(const original of targets){
        const current=state.records.find(item=>item.id===original.id);if(!current)continue;
        let periods=current.periods||'';
        if(current.attendanceType==='지각'||current.attendanceType==='조퇴'){
          const parsed=parsePeriods(periods),numbers=parsed.valid?parsed.periods.filter(Number.isInteger):[];
          if(current.attendanceType==='지각'){
            const endpoint=numbers.length?Math.min(count,Math.max(...numbers)):0;
            periods=formatSchoolPeriods(['조회',...Array.from({length:endpoint},(_,i)=>i+1)]);
          }else{
            const endpoint=numbers.length?Math.min(count,Math.min(...numbers)):count+1;
            periods=formatSchoolPeriods([...Array.from({length:Math.max(0,count-endpoint+1)},(_,i)=>endpoint+i),'종례']);
          }
        }
        await persistRecord({...current,lessonCount:count,periods,reviewStatus:'draft',entryStatus:'pending',neisConfirmedDates:[]},current);saved++;
      }
      render();toast(`${state.queueDate} 실제 수업을 ${count}교시로 ${saved}건 일괄 수정했습니다. 나이스에 다시 보내 주세요.`);
    }catch(error){render();toast(`${saved}건 저장 후 중단: ${error.message}`);}
  };
  const dateInput=document.querySelector('#queue-date');if(dateInput)dateInput.onchange=()=>chooseQueueDate(dateInput.value);
  const selectAll=document.querySelector('#select-all');if(selectAll)selectAll.onchange=()=>{sendQueueRecords(filteredRecords(),state.queueDate).forEach(r=>selectAll.checked?state.selected.add(r.id):state.selected.delete(r.id));renderWorkspace();};
  for(const [id,format] of [['copy-rows','copy'],['export-csv','csv'],['export-json','json'],['send-neis-helper','helper']]){const button=document.getElementById(id);if(button)button.onclick=()=>exportSelected(format);}
  updateNeisActions();
}
async function refresh() {
  if(!await saveGridBeforeLeaving())return;
  if(demo){toast('예시 화면에서는 서버의 기록을 불러오지 않습니다.');return;}
  const button=document.querySelector('#refresh');button.disabled=true;
  try { accept(await api());state.error='';render();toast('최신 기록을 불러왔습니다.'); }
  catch(error){state.error=error.message;if(error.status===401)state.user=null;render();}
}
function refreshTabCounts() {
  const n=counts();
  for(const [tab,count] of [['records',n.total],['experience',state.records.filter(record=>record.category==='experience').length],['queue',n.ready]]) {
    const badge=document.querySelector(`[data-tab="${tab}"] .tab-count`);
    if(badge)badge.textContent=String(count);
  }
}
function notebookSnapshot() { return {authenticated:true,user:state.user,records:state.records,students:state.students,experienceSettings:state.experienceSettings,revision:state.revision}; }
async function saveGridBeforeLeaving() {
  if(!experienceGrid)return true;
  if(experienceGrid.isBusy?.()){toast('표를 저장 중입니다. 잠시만 기다려 주세요.');return false;}
  if(!experienceGrid.hasPendingChanges())return true;
  return await experienceGrid.savePending();
}
async function afterGridSave(action) { if(await saveGridBeforeLeaving())return action(); }
async function openRoster() {
  if(rosterOpening)return;
  const owner=state.user?.username;
  const loadLatest=async()=>{
    const result=await api();
    if(!result.authenticated||result.user?.username!==owner)throw new Error('로그인 계정이 바뀌었습니다. 현재 계정을 확인해 주세요.');
    accept(result);morningView?.setStudents?.(knownStudents());
    const badge=document.querySelector('#open-roster');if(badge)badge.textContent=`명렬표 관리 ${state.students.length}명`;
    return result;
  };
  rosterOpening=true;
  try{
    if(!demo)await loadLatest();
    openRosterManager({students:state.students,accountId:owner,loadLatest:demo?null:loadLatest,onClosed:()=>{if(!morningView?.hasPendingChanges()&&!experienceGrid?.hasPendingChanges())render();},
      save:async(students,beforeStudents)=>{
        const posted=await api({action:'save-roster',students,beforeStudents},'POST');
        const confirmed=await api();
        const identities=value=>(value||[]).map(student=>[student.studentId,student.studentName]).sort(([a],[b])=>a.localeCompare(b));
        if(!confirmed.authenticated||confirmed.user?.username!==posted.user?.username||JSON.stringify(identities(confirmed.students))!==JSON.stringify(identities(students)))throw new Error('서버에 저장된 명렬표를 확인하지 못했습니다. 입력 내용을 유지했으니 다시 저장해 주세요.');
        return confirmed;
      },onSaved:result=>{if(demo)state.students=Array.isArray(result)?result:result.students||state.students;else accept(result);render();toast(demo?'예시 명렬표를 반영했습니다.':`${result.user.username} 계정 · 명렬표 ${result.students.length}명 서버 저장 확인 완료`);},demo});
  }catch(error){toast(`명렬표를 불러오지 못했습니다. ${error.message}`);}
  finally{rosterOpening=false;}
}
function experienceDaysNote(record) {
  if(!record?.studentId||!record.startDate)return '';
  try {const year=academicYear(record.startDate),usage=usageDays({records:[...state.records.filter(item=>item.id!==record.id),record],studentId:record.studentId,year,baseline:state.experienceSettings.baselineDays[year]?.[record.studentId]||0});
    return `<span>${year}학년도 · 등록 ${usage.totalDays}/20일 · 남은 ${usage.remainingDays}일</span>`;
  }catch{return '';}
}
window.addEventListener('beforeunload',event=>{if(experienceGrid?.hasPendingChanges()){event.preventDefault();event.returnValue='';}});

function openPass(record) {
  openPassEditor({record,students:knownStudents(),user:state.user,save:persistRecord,onSaved:()=>{state.error='';render();},notify:toast,demo});
}
function startNew(sourceType) {
  if(sourceType==='report'){showReportPicker();return;}
  const record=emptyRecord();record.id=uid();record.sourceType=sourceType;record.category=sourceType==='application'?'experience':'attendance';
  openEditor(record,sourceType);
}
function openEditor(record,sourceType) {
  if(record&&isExamRecord(record)){location.href='/exams.html';return;}
  if(!record)return;
  if(uploadController)uploadController.abort();
  before=state.records.find(r=>r.id===record.id)?clone(record):null;
  draft={...emptyRecord(),...clone(record)};
  if(draft.attendanceType==='결석') { const lessons=schoolPeriodsForDate(draft.startDate,draft.lessonCount); draft.periods=lessons.length?formatSchoolPeriods(lessons.map(item=>item.period)):''; }
  editorWarnings=[];conversationCandidates=[];selectedCandidateId='';manualIdentity=studentIdentity(draft);
  if(sourceType)draft.sourceType=sourceType;
  periodEntry={mode:'manual',arrivalTime:''};
  renderEditor();if(!dialog.open)dialog.showModal();
  if(sourceType==='capture'||sourceType==='application'||sourceType==='report') document.querySelector('#choose-files')?.focus();
}
function selectOptions(values,current,blank='선택해 주세요') {
  return `${blank!==null?`<option value="">${blank}</option>`:''}${values.map(item=>{const[value,label]=Array.isArray(item)?item:[item,item];return `<option value="${esc(value)}" ${String(current)===String(value)?'selected':''}>${esc(label)}</option>`;}).join('')}`;
}
function field(label,name,{type='text',placeholder='',required=false,extra='',value=draft[name]||'',maxlength}={}) {
  return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${maxlength?`maxlength="${maxlength}"`:''} ${extra}></div>`;
}
function selectField(label,name,values,{blank='선택해 주세요'}={}) {return `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${selectOptions(values,draft[name],blank)}</select></div>`;}
function renderEditor() {
  const isExperience=draft.category==='experience', isAttendance=isExperience||draft.category==='attendance';
  dialog.className='dialog';
  dialog.innerHTML=`<div class="dialog-head"><div><h2 id="editor-title">${draft.sourceType==='report'?'체험학습 보고서 등록':before?'기록 확인·수정':'새 기록 작성'}</h2><p>${draft.studentName?`${esc(draft.studentName)} · `:''}내용을 확인하거나 수정한 뒤 저장하세요.</p></div><button class="icon-btn" type="button" id="close-editor" aria-label="닫기">${icon('close')}</button></div><form id="editor-form"><div class="dialog-body"><section class="source-panel"><h3 class="panel-title">${icon('paper')}원문과 첨부<span>확인용 자료</span></h3>${selectField('자료 종류','sourceType',Object.entries(sourceLabels),{blank:null})}<div class="field"><label for="f-sourceText">원문 메모 · 캡처에서 읽은 내용</label><textarea id="f-sourceText" name="sourceText" maxlength="30000" placeholder="예: 학번 30801 이름 예시학생 / 11월 23일~25일 체험학습 / 사유: 가족 동반 역사 문화 탐방">${esc(draft.sourceText)}</textarea></div><div class="source-actions"><button class="btn soft small" type="button" id="parse-source">${icon('pen')}내용 정리하기</button><span class="muted"><small>날짜 기준: ${today().slice(0,4)}년</small></span></div><button class="upload-area" type="button" id="choose-files">${icon('upload')}<strong>캡처 · 서류 사진 · PDF 올리기</strong><small>Ctrl+V로 붙여넣기 · 한 번에 최대 5개</small></button><input class="hidden" id="source-files" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple><div id="upload-status"></div><div id="conversation-candidates">${conversationCandidatesHtml()}</div><div id="source-warnings">${warningsHtml()}</div><div id="attachment-list">${attachmentsHtml()}</div><p class="source-privacy">글자 인식은 이 기기에서, 기록과 첨부는 내 출결함에 저장됩니다.</p>${draft.sourceType==='report'?'<p class="source-privacy">기존 신청 건에 보고서를 연결합니다.</p>':''}</section><section class="structured-panel"><h3 class="panel-title">${icon('notebook')}정리한 기록<span>등록 명렬표 ${state.students.length}명 대조</span></h3><datalist id="roster-students">${knownStudents().map(student=>`<option value="${esc(student.studentId)}">${esc(student.studentName)} · ${esc(student.classNumber)}반 ${esc(student.number)}번</option>`).join('')}</datalist><div id="editor-error" class="form-error" role="alert"></div>${selectField('기록 구분','category',Object.entries(labels),{blank:null})}<div class="form-grid three">${field('학번','studentId',{placeholder:'30801',maxlength:5,extra:'inputmode="numeric" list="roster-students"'})}${field('반','classNumber',{placeholder:'8',extra:'inputmode="numeric" maxlength="2"'})}${field('번호','number',{placeholder:'1',extra:'inputmode="numeric" maxlength="2"'})}</div>${field('학생 이름','studentName',{placeholder:'학생 이름 확인',required:true,maxlength:40})}<div class="form-grid">${field('시작일','startDate',{type:'date',required:true})}${field('종료일','endDate',{type:'date'})}</div>${isAttendance?`<div class="form-grid">${selectField('출결 구분','attendanceType',ATTENDANCE_TYPES)}${selectField('사유 구분','reasonType',REASON_TYPES)}</div>${selectField('이 날짜 실제 수업','lessonCount',[[0,'내 학교 요일 시간표'],...Array.from({length:8},(_,i)=>[i+1,`${i+1}교시 수업`])],{blank:null})}${field('빠진 시간','periods',{placeholder:'아래 버튼으로 선택하거나 직접 입력',maxlength:100})}<div id="period-selector">${periodSelectionHtml()}</div>`:''}${isExperience?experienceFields():''}${isAttendance?attendanceDatesHtml():''}<div class="field"><label for="f-reason">나이스에 입력할 내용</label><textarea id="f-reason" name="reason" maxlength="2000" placeholder="출결 사유 또는 해당 업무에 입력할 기록을 작성하세요.">${esc(draft.reason)}</textarea>${isAttendance||isExperience?`<div class="morning-reason-shortcuts" role="group" aria-label="자주 쓰는 내용">${reasonShortcuts(state.records).map(reason=>`<button type="button" data-reason-shortcut="${esc(reason)}">${esc(reason)}</button>`).join('')}</div>`:''}</div><details class="optional-memo" ${draft.note?'open':''}><summary>참고 메모 <span>선택</span></summary><div class="field"><label class="hidden" for="f-note">교사 참고 메모</label><textarea id="f-note" name="note" maxlength="10000" placeholder="연락한 사항, 추후 챙길 내용 등">${esc(draft.note)}</textarea><small>나이스 입력 내용에는 포함되지 않습니다.</small></div></details></section></div><footer class="dialog-footer">${before?'<button class="btn danger" type="button" id="delete-record">기록 삭제</button>':''}<span class="footer-spacer"></span><span class="save-state">${demo?'예시 모드 · 서버 저장 없음':'내 출결함에 저장'}</span><button class="btn" type="button" id="cancel-editor">취소</button><button class="btn primary" type="submit" id="save-record">${icon('check')}기록 저장</button></footer></form>`;
  bindEditor();
}
/** 실제 수업 교시: ‘이 날짜 실제 수업’ → 날짜의 요일 시간표 → 날짜 전이면 7교시로 표시. */
function editorLessonNumbers() {
  const count=Number(draft.lessonCount)||0;
  if(count>=1&&count<=8)return Array.from({length:count},(_,i)=>i+1);
  const scheduled=schoolPeriodsForDate(draft.startDate).map(item=>item.period);
  return scheduled.length?scheduled:[];
}
function selectedPeriodValues(text) {
  const values=new Set(),source=String(text||'').replace(/\s+/g,'');
  if(source.includes('조회'))values.add('조회');if(source.includes('종례'))values.add('종례');
  source.replace(/조회|종례/g,'').replace(/([1-8])(?:[~–-]([1-8]))?/g,(_,a,b)=>{for(let n=Number(a);n<=Number(b||a);n++)values.add(n);return '';});
  return values;
}
function periodSelectionHtml() {
  const type=draft.attendanceType;
  if(type==='결석')return '<div class="period-picker"><p>결석은 해당 날짜의 수업 교시 전체가 자동 입력됩니다.</p></div>';
  const numbers=editorLessonNumbers(),known=numbers.length>0,lessons=known?numbers:[1,2,3,4,5,6,7];
  const selected=selectedPeriodValues(draft.periods);
  const meeting=type==='지각'?'조회':type==='조퇴'?'종례':'';
  const values=[...(type!=='조퇴'?['조회']:[]),...lessons,...(type!=='지각'?['종례']:[])];
  const help=type==='지각'?'빠진 마지막 교시를 누르면 조회부터 한 번에 선택됩니다.':type==='조퇴'?'빠지기 시작한 교시를 누르면 종례까지 한 번에 선택됩니다.':'빠진 시간을 눌러 선택하세요. 출결 구분을 지각·조퇴로 고르면 한 번에 선택됩니다.';
  const countNote=Number(draft.lessonCount)?`${draft.lessonCount}교시 수업(직접 선택)`:known?`${lessons.length}교시 수업(요일 시간표)`:'날짜 전 · 7교시로 표시 중';
  return `<div class="period-picker"><div class="period-chips" role="group" aria-label="빠진 시간 선택">${values.map(value=>`<label class="period-chip"><input type="checkbox" data-missed-period="${value}" ${selected.has(value)?'checked':''} ${value===meeting&&selected.has(value)?'disabled':''}><span>${Number.isInteger(value)?`${value}교시`:value}</span></label>`).join('')}</div><p>${help}</p><small>${countNote} · 교시 수가 다르면 위 ‘이 날짜 실제 수업’을 먼저 바꾸세요${meeting?` · ${meeting} 포함`:''}</small>${type==='지각'?`<div class="period-arrival"><label for="period-arrival-time">도착 시각</label><input id="period-arrival-time" type="time" value="${esc(periodEntry.arrivalTime)}" aria-describedby="period-arrival-hint"><small id="period-arrival-hint">시각을 넣으면 자동 선택</small></div>`:''}</div>`;
}
function refreshPeriodSelector() {
  const box=document.querySelector('#period-selector');if(!box)return;
  box.innerHTML=periodSelectionHtml();bindPeriodSelector();
}
function setSelectedPeriods(value,mode='selection') {
  draft.periods=value;periodEntry.mode=mode;
  const input=document.querySelector('#f-periods');if(input)input.value=value;
  resetReview();refreshPeriodSelector();
}
function selectPeriodEndpoint(endpoint,type=draft.attendanceType) {
  const known=editorLessonNumbers(),numbers=known.length?known:[1,2,3,4,5,6,7];
  if(type==='지각')return formatSchoolPeriods(['조회',...numbers.filter(value=>value<=endpoint)]);
  if(type==='조퇴')return formatSchoolPeriods([...numbers.filter(value=>value>=endpoint),'종례']);
  return '';
}
function updatePeriodsForDateOrType(reason='date') {
  if(draft.attendanceType==='결석'){
    const lessons=schoolPeriodsForDate(draft.startDate,draft.lessonCount);
    setSelectedPeriods(lessons.length?formatSchoolPeriods(lessons.map(item=>item.period)):'','automatic-absence');return;
  }
  if(!['지각','조퇴','결과'].includes(draft.attendanceType)){refreshPeriodSelector();return;}
  if(reason==='date'&&periodEntry.mode==='manual'){refreshPeriodSelector();return;}
  if(periodEntry.mode==='time'&&draft.attendanceType==='지각'&&periodEntry.arrivalTime) {
    const result=missedPeriods({kind:'late',date:draft.startDate,lessonCount:draft.lessonCount,arrivalTime:periodEntry.arrivalTime});
    setSelectedPeriods(result.valid?result.text:'','time');return;
  }
  const parsed=parsePeriods(draft.periods||''),numbers=parsed.valid?parsed.periods.filter(Number.isInteger):[];
  // Only generated selections follow date changes; saved or typed periods stay manual.
  if(parsed.valid) {
    const endpoint=draft.attendanceType==='조퇴'?(numbers[0]??8):(numbers.at(-1)??0);
    if(['지각','조퇴'].includes(draft.attendanceType)&&schoolPeriodsForDate(draft.startDate,draft.lessonCount).length) {
      setSelectedPeriods(selectPeriodEndpoint(endpoint));return;
    }
  }
  refreshPeriodSelector();
}
function bindPeriodSelector() {
  document.querySelectorAll('[data-missed-period]').forEach(input=>input.onchange=()=>{
    readDraft();periodEntry.arrivalTime='';
    const value=/^\d+$/.test(input.dataset.missedPeriod)?Number(input.dataset.missedPeriod):input.dataset.missedPeriod;
    if(['지각','조퇴'].includes(draft.attendanceType)) {
      const endpoint=typeof value==='number'?(input.checked?value:value+(draft.attendanceType==='지각'?-1:1)):(draft.attendanceType==='지각'?0:8);
      setSelectedPeriods(selectPeriodEndpoint(endpoint));
    }else{
      const values=[...document.querySelectorAll('[data-missed-period]:checked')].map(item=>/^\d+$/.test(item.dataset.missedPeriod)?Number(item.dataset.missedPeriod):item.dataset.missedPeriod);
      setSelectedPeriods(formatSchoolPeriods(values));
    }
  });
  const arrival=document.querySelector('#period-arrival-time');
  if(arrival)arrival.onchange=()=>{
    readDraft();periodEntry.arrivalTime=arrival.value;
    if(!arrival.value)return;
    periodEntry.mode='time';
    const result=missedPeriods({kind:'late',date:draft.startDate,lessonCount:draft.lessonCount,arrivalTime:arrival.value});
    if(result.valid)setSelectedPeriods(result.text,'time');
    else toast(result.error||'날짜와 도착 시각을 확인해 주세요.');
  };
}
function experienceFields() {
  return `<div id="experience-editor-usage" class="experience-editor-usage">${experienceDaysNote(draft)}</div><h4 class="subheading">체험학습 서류 진행 상황</h4><div class="form-grid">${selectField('신청서 제출 여부','applicationStatus',[['missing','아직 받지 않음'],['received','신청서 받음']],{blank:null})}${selectField('신청 상태','approvalStatus',[['pending','신청 유지'],['approved','신청 유지 · 기존 기록'],['rejected','반려'],['cancelled','취소']],{blank:null})}${selectField('보고서 제출 여부','reportStatus',[['missing','아직 받지 않음'],['received','보고서 받음'],['reviewed','보고서 내용까지 확인']],{blank:null})}${field('보고서 제출 기한','reportDueDate',{type:'date'})}</div>${field('체험학습 장소','location',{placeholder:'신청서에 적힌 장소',maxlength:300})}`;
}
function dateRange(start,end) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)return [];
  const list=[],value=new Date(`${start}T12:00:00Z`),last=new Date(`${end}T12:00:00Z`);
  while(value<=last&&list.length<=366){list.push(value.toISOString().slice(0,10));value.setUTCDate(value.getUTCDate()+1);}
  return list;
}
function attendanceDatesHtml() {
  const dates=dateRange(draft.startDate,draft.endDate||draft.startDate),weekdays=['일','월','화','수','목','금','토'];
  if(dates.length<=1){
    draft.attendanceDates=dates;
    return `<div id="attendance-dates">${dates.length?`<input type="hidden" name="attendanceDates" value="${dates[0]}">`:''}</div>`;
  }
  return `<div class="dates-box" id="attendance-dates"><div class="dates-heading"><label class="field-label">출결 처리할 날짜</label><button type="button" class="text-btn" id="select-weekdays">평일만 선택</button></div><p>휴업일을 제외하고 선택하세요.</p>${dates.length>366?'<p>기간을 1년 이내로 나누어 작성해 주세요.</p>':`<div class="date-weekdays">${weekdays.map(day=>`<span>${day}</span>`).join('')}</div><div class="date-pills date-calendar">${Array.from({length:new Date(`${dates[0]}T12:00:00Z`).getUTCDay()},()=>'<span class="date-empty" aria-hidden="true"></span>').join('')}${dates.map(date=>{const day=new Date(`${date}T12:00:00Z`).getUTCDay(),done=draft.neisConfirmedDates?.includes(date)||(draft.entryStatus==='confirmed'&&draft.attendanceDates.includes(date));return `<label class="date-pill ${day===0||day===6?'weekend':''} ${done?'date-completed':''}" ${done?'title="나이스 입력 완료"':''}><input type="checkbox" name="attendanceDates" value="${date}" ${draft.attendanceDates.includes(date)?'checked':''}><span>${shortDate(date)} ${weekdays[day]}</span>${done?'<small>입력 완료</small>':''}</label>`;}).join('')}</div>`}</div>`;
}
function warningsHtml() {return editorWarnings.length?`<ul class="extraction-warnings">${editorWarnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:'';}
function conversationCandidatesHtml() {
  if(conversationCandidates.length<2)return '';
  return `<section class="conversation-picker" aria-labelledby="conversation-title"><h4 id="conversation-title">출결 연락 ${conversationCandidates.length}건을 정리했습니다.</h4><p>저장할 연락을 누르세요.</p><div class="conversation-list">${conversationCandidates.map(candidate=>{
    const fields=candidate.fields||{},date=fields.startDate?rangeLabel(fields):'날짜 확인 필요',needsDate=!fields.startDate||!candidate.messageDate;
    const classification=[fields.reasonType,fields.attendanceType].filter(Boolean).join(' · ')||'출결 구분 확인 필요';
    return `<button class="conversation-option ${selectedCandidateId===candidate.id?'selected':''}" type="button" data-conversation="${esc(candidate.id)}" aria-pressed="${selectedCandidateId===candidate.id}"><span class="conversation-option-head"><strong>${esc(date)}${fields.studentName?` · ${esc(fields.studentName)}`:''}</strong><span>${selectedCandidateId===candidate.id?'선택됨':'선택'}</span></span><span class="conversation-classification">${esc(classification)}</span>${fields.reason?`<span class="conversation-summary">${esc(fields.reason)}</span>`:''}${needsDate?`<span class="conversation-date-note">${fields.startDate?'문자 날짜가 잘렸습니다. 실제 출결일을 확인해 주세요.':'출결 날짜만 직접 입력해 주세요.'}</span>`:''}</button>`;
  }).join('')}</div></section>`;
}
function attachmentsHtml() {
  return `<div class="attachment-list">${draft.attachments.map(file=>`<div class="attachment">${icon('paper')}${demo?`<span>${esc(file.name)}</span>`:`<a href="/api/notebook-file?id=${encodeURIComponent(file.id)}" target="_blank" rel="noopener">${esc(file.name)}</a>`}<small>${Math.ceil(file.size/1024)}KB</small><button type="button" data-remove-file="${esc(file.id)}" aria-label="${esc(file.name)} 첨부 해제">×</button></div>`).join('')}</div>`;
}
function readDraft() {
  const form=document.querySelector('#editor-form');if(!form||!draft)return;
  const oldReportStatus=draft.reportStatus;
  const fields=new FormData(form);
  for(const [name,value]of fields.entries())if(name!=='attendanceDates'&&name!=='reviewStatus')draft[name]=String(value);
  draft.attendanceDates=fields.getAll('attendanceDates').map(String);
  draft.experienceDayStatuses=draft.category==='experience'?Object.fromEntries(Object.entries(draft.experienceDayStatuses||{}).filter(([date])=>draft.attendanceDates.includes(date))):{};
  if(draft.category==='experience'&&draft.reportStatus!==oldReportStatus)draft.experienceDayStatuses=Object.fromEntries(draft.attendanceDates.map(date=>[date,draft.reportStatus==='reviewed'?'report':'application']));
}
function resetReview() {
  draft.reviewStatus='draft';draft.entryStatus='pending';
}
function bindEditor() {
  document.querySelector('#close-editor').onclick=closeEditor;document.querySelector('#cancel-editor').onclick=closeEditor;
  document.querySelector('#editor-form').onsubmit=saveEditor;
  document.querySelector('#editor-form').addEventListener('input',event=>{
    const previousStartDate=draft.startDate;
    readDraft();resetReview(event);
    if(event.target.name==='startDate'&&draft.endDate===previousStartDate){draft.endDate=draft.startDate;document.querySelector('#f-endDate').value=draft.endDate;}
    if(draft.category==='experience'){const usage=document.querySelector('#experience-editor-usage');if(usage)usage.innerHTML=experienceDaysNote(draft);}
    if(event.target.name==='lessonCount'){periodEntry.mode='selection';updatePeriodsForDateOrType();}
    if(event.target.name==='startDate')updatePeriodsForDateOrType('date');
    if(event.target.name==='periods'){periodEntry={mode:'manual',arrivalTime:''};refreshPeriodSelector();}
    if(event.target.name==='sourceText'){conversationCandidates=[];selectedCandidateId='';document.querySelector('#conversation-candidates').innerHTML='';}
    if(event.target.name==='studentId'&&/^[1-3]\d{4}$/.test(event.target.value)){draft.classNumber=Number(event.target.value.slice(1,3));draft.number=Number(event.target.value.slice(3));document.querySelector('#f-classNumber').value=draft.classNumber;document.querySelector('#f-number').value=draft.number;const student=knownStudents().find(item=>item.studentId===event.target.value);if(student){draft.studentName=student.studentName;document.querySelector('#f-studentName').value=student.studentName;}}
    if(['studentId','studentName','classNumber','number'].includes(event.target.name))manualIdentity=studentIdentity(draft);
  });
  document.querySelectorAll('[data-reason-shortcut]').forEach(button=>button.onclick=()=>{
    const field=document.querySelector('#f-reason');field.value=button.dataset.reasonShortcut;
    const type=document.querySelector('#f-reasonType');
    if(type&&!type.value&&button.dataset.reasonShortcut==='교외체험학습'&&[...type.options].some(option=>option.value==='출석인정'))type.value='출석인정';
    field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();
  });
  document.querySelector('#f-category').onchange=()=>{readDraft();draft.reviewStatus='draft';renderEditor();};
  document.querySelector('#f-attendanceType')?.addEventListener('change',()=>{readDraft();periodEntry.arrivalTime='';updatePeriodsForDateOrType('type');});
  document.querySelector('#f-sourceType').onchange=()=>{readDraft();draft.reviewStatus='draft';};
  document.querySelector('#f-studentName').onchange=()=>{readDraft();const matches=knownStudents().filter(student=>student.studentName===draft.studentName);if(matches.length===1){const student=matches[0];for(const key of ['studentId','classNumber','number']){draft[key]=student[key];document.querySelector(`#f-${key}`).value=student[key]||'';}draft.reviewStatus='draft';}manualIdentity=studentIdentity(draft);if(draft.category==='experience'){const usage=document.querySelector('#experience-editor-usage');if(usage)usage.innerHTML=experienceDaysNote(draft);}};
  for(const name of ['startDate','endDate'])document.querySelector(`#f-${name}`).onchange=()=>{readDraft();if(name==='startDate'&&!draft.endDate){draft.endDate=draft.startDate;document.querySelector('#f-endDate').value=draft.endDate;}draft.attendanceDates=draft.attendanceDates.filter(d=>d>=draft.startDate&&d<=(draft.endDate||draft.startDate));const box=document.querySelector('#attendance-dates');if(box){box.outerHTML=attendanceDatesHtml();bindDates();}if(name==='startDate')updatePeriodsForDateOrType();};
  document.querySelector('#parse-source').onclick=parseSource;
  document.querySelector('#choose-files').onclick=()=>document.querySelector('#source-files').click();
  document.querySelector('#source-files').onchange=event=>processFiles([...event.target.files]);
  document.querySelector('#delete-record')?.addEventListener('click',deleteRecord);
  document.querySelectorAll('[data-conversation]').forEach(button=>button.onclick=()=>{
    readDraft();const candidate=conversationCandidates.find(item=>item.id===button.dataset.conversation);if(!candidate)return;
    applyParsedSource({fields:candidate.fields,warnings:candidate.warnings},candidate.id);
  });
  bindStudentMatcher({inputs:[document.querySelector('#f-studentId'),document.querySelector('#f-studentName')],students:knownStudents,onSelect:student=>{
    for(const key of ['studentId','studentName','classNumber','number']){draft[key]=student[key]|| (key==='classNumber'?Number(student.studentId.slice(1,3)):key==='number'?Number(student.studentId.slice(3)):'');const input=document.querySelector('#f-'+key);if(input)input.value=draft[key];}
    draft.reviewStatus='draft';manualIdentity=studentIdentity(draft);if(draft.category==='experience'){const usage=document.querySelector('#experience-editor-usage');if(usage)usage.innerHTML=experienceDaysNote(draft);}
  }});
  bindAttachments();bindDates();bindPeriodSelector();
}
function bindDates() {
  const button=document.querySelector('#select-weekdays');if(button)button.onclick=()=>{
    readDraft();draft.attendanceDates=dateRange(draft.startDate,draft.endDate||draft.startDate).filter(d=>![0,6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));draft.reviewStatus='draft';
    document.querySelector('#attendance-dates').outerHTML=attendanceDatesHtml();bindDates();toast('평일을 선택했습니다. 학교 휴업일 등은 직접 해제해 주세요.');
  };
}
function bindAttachments() {
  document.querySelectorAll('[data-remove-file]').forEach(button=>button.onclick=()=>{
    readDraft();draft.attachments=draft.attachments.filter(f=>f.id!==button.dataset.removeFile);draft.reviewStatus='draft';
    document.querySelector('#attachment-list').innerHTML=attachmentsHtml();bindAttachments();
  });
}
function closeEditor() {
  if(uploadController){if(!confirm('자료를 읽는 중입니다. 중단하고 닫을까요?'))return;uploadController.abort();}
  readDraft();const original=before||{...emptyRecord(),id:draft?.id,sourceType:draft?.sourceType,category:draft?.category};
  if(draft&&JSON.stringify(draft)!==JSON.stringify(original)&&!confirm('저장하지 않은 내용이 있습니다. 닫을까요?'))return;
  dialog.close();draft=null;before=null;
}
dialog.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
function parseSource() {
  readDraft();if(!draft.sourceText.trim()){toast('메모를 입력하거나 캡처를 먼저 올려 주세요.');return;}
  const students=knownStudents();
  try {
    const table=parseAttendanceTable(draft.sourceText,{referenceDate:today(),students,sourceType:draft.sourceType});
    if(table.length>1&&!before){
      openBatchEditor({dialog,candidates:table,attachments:draft.attachments,students,escape:esc,save:record=>persistRecord(record,null),findDuplicate:record=>state.records.some(existing=>sameNeisContent(existing,record)),onBack:()=>renderEditor(),onSaved:()=>{dialog.close();draft=null;before=null;render();},notify:toast});return;
    }
    if(table.length===1){applyParsedSource({fields:table[0].fields,warnings:table[0].warnings});return;}
    const conversation=parseConversationCandidates(draft.sourceText,{referenceDate:today(),students});
    conversationCandidates=conversation.candidates;selectedCandidateId='';
    if(conversationCandidates.length>1){
      draft.reviewStatus='draft';draft.entryStatus='pending';editorWarnings=[...conversation.warnings];renderEditor();
      document.querySelector('#conversation-candidates').scrollIntoView({block:'center'});toast(`출결 연락 ${conversationCandidates.length}건을 정리했습니다. 저장할 연락을 누르세요.`);return;
    }
    if(conversationCandidates.length===1){
      const candidate=conversationCandidates[0];
      applyParsedSource({fields:candidate.fields,warnings:[...conversation.warnings,...candidate.warnings]},candidate.id);return;
    }
    const parsed=parseSourceText(draft.sourceText,{referenceDate:today(),students,sourceType:draft.sourceType});
    applyParsedSource({fields:parsed.fields,warnings:[...conversation.warnings,...parsed.warnings]});
  }catch(error){document.querySelector('#editor-error').textContent=error.message;}
}
function applyParsedSource(parsed,candidateId='') {
  const warnings=[...parsed.warnings];
  const preserved={id:draft.id,sourceText:draft.sourceText,sourceType:draft.sourceType,attachments:draft.attachments,applicationStatus:draft.applicationStatus,approvalStatus:draft.approvalStatus,reportStatus:draft.reportStatus,note:draft.note};
  if(parsed.fields.approvalStatus==='pending'&&(parsed.fields.category||draft.category)==='attendance')preserved.approvalStatus='pending';
  if(draft.reportDueDate&&!parsed.fields.reportDueDate)preserved.reportDueDate=draft.reportDueDate;
  if(before||draft.category!=='attendance')preserved.category=draft.category;
  if(before&&draft.sourceType==='report') {
    for(const key of ['studentId','studentName','classNumber','number','startDate','endDate','attendanceDates','attendanceType','reasonType','periods','reason','location'])preserved[key]=draft[key];
    warnings.push('기존 신청서의 학생과 체험 기간을 유지했습니다.');
  }
  const candidateFields=candidateId?{startDate:'',endDate:'',attendanceDates:[],attendanceType:'',reasonType:'',periods:'',reason:'',location:''}:{};
  const identity=parsed.fields.studentId||parsed.fields.studentName?studentIdentity(parsed.fields):candidateId?manualIdentity:{};
  draft={...draft,...candidateFields,...identity,...parsed.fields,...preserved,reviewStatus:'draft',entryStatus:'pending'};
  if(['application','report'].includes(draft.sourceType))draft.category='experience';
  periodEntry={mode:Object.hasOwn(parsed.fields,'periods')?'source':'manual',arrivalTime:''};
  selectedCandidateId=candidateId;editorWarnings=[...new Set(warnings)];renderEditor();toast('내용을 정리했습니다.');
}
document.addEventListener('paste',event=>{
  if(!state.user||event.defaultPrevented)return;
  const opened=document.querySelector('dialog[open]');
  if(opened&&(opened!==dialog||!document.querySelector('#editor-form')))return;
  const text=clipboardText(event.clipboardData);
  if(text.trim()){
    // Native text editing stays native; a new attendance table can open its batch preview directly.
    if(before||dialog.open&&event.target?.id!=='f-sourceText')return;
    let table;try{table=parseAttendanceTable(text,{referenceDate:today(),students:knownStudents()});}catch{return;}
    if(!table.length)return;
    event.preventDefault();
    if(uploadController){toast('자료를 읽는 중입니다. 끝난 뒤 붙여넣어 주세요.');return;}
    if(!dialog.open)startNew('memo');
    if(!draft.attachments.length){draft.sourceType='memo';document.querySelector('#f-sourceType').value='memo';}
    const field=document.querySelector('#f-sourceText');
    const length=field.value.length-(field.selectionEnd-field.selectionStart)+text.length;
    if(length>30000){toast('원문은 30000자 이내로 입력해 주세요.');return;}
    field.setRangeText(text,field.selectionStart,field.selectionEnd,'end');
    parseSource();return;
  }
  const files=clipboardImages(event.clipboardData);
  if(!files.length)return;
  event.preventDefault();
  if(uploadController){toast('캡처를 읽는 중입니다. 끝난 뒤 붙여넣어 주세요.');return;}
  if(!dialog.open)startNew('capture');
  processFiles(files).catch(error=>toast(error.message||'캡처를 붙여넣지 못했습니다.'));
});
async function processFiles(files) {
  if(!files.length)return;readDraft();
  if(files.length>5){toast('한 번에 파일 5개까지 올릴 수 있습니다.');return;}
  if(draft.attachments.length+files.length>10){toast('한 기록에 첨부파일은 10개까지 저장할 수 있습니다.');return;}
  uploadController=new AbortController();const controller=uploadController, recordId=draft.id;
  const status=document.querySelector('#upload-status');
  status.innerHTML='<div class="upload-progress"><span id="upload-message">자료를 준비하고 있습니다.</span><progress class="progress-bar" id="upload-progress" max="1" value="0"></progress><button type="button" class="text-btn" id="cancel-upload">글자 읽기 중단</button></div>';
  document.querySelector('#cancel-upload').onclick=()=>controller.abort();
  document.querySelector('#choose-files').disabled=true;document.querySelector('#save-record').disabled=true;document.querySelector('#parse-source').disabled=true;document.querySelector('#f-category').disabled=true;
  const progress=message=>{const el=document.querySelector('#upload-message');if(el)el.textContent=message;};
  try{
    const result=await recognizeFiles(files,{signal:controller.signal,onProgress:value=>{progress(typeof value==='string'?value:value.message||'글자를 읽고 있습니다.');const bar=document.querySelector('#upload-progress');if(bar&&Number.isFinite(value.progress))bar.value=value.progress;}});
    if(controller.signal.aborted||draft?.id!==recordId)return;
    readDraft();
    if(result.text.trim())draft.sourceText=[draft.sourceText,result.text].filter(Boolean).join('\n\n');
    conversationCandidates=[];selectedCandidateId='';document.querySelector('#conversation-candidates').innerHTML='';
    editorWarnings.push(...(result.warnings||[]));
    document.querySelector('#f-sourceText').value=draft.sourceText;
    let addedFiles=0;
    for(const file of files){
      if(controller.signal.aborted)break;
      progress(`${file.name} 첨부자료를 준비하고 있습니다.`);
      try{
        const prepared=await prepareAttachment(file);
        if(controller.signal.aborted)break;
        if(demo){draft.attachments.push({id:uid(),name:prepared.name,mime:prepared.mime,size:prepared.size});}
        else {const uploaded=await api({name:prepared.name,mime:prepared.mime,base64:prepared.base64},'POST','/api/notebook-file');if(draft?.id!==recordId)return;draft.attachments.push(uploaded.attachment);}
        addedFiles++;
      }catch(error){editorWarnings.push(`${file.name}: 첨부 저장을 완료하지 못했습니다. ${error.message}`);}
    }
    draft.reviewStatus='draft';draft.entryStatus='pending';
    
    document.querySelector('#source-warnings').innerHTML=warningsHtml();document.querySelector('#attachment-list').innerHTML=attachmentsHtml();bindAttachments();
    if(draft.sourceType==='application'&&addedFiles)draft.applicationStatus='received';
    if(draft.sourceType==='report'&&addedFiles)draft.reportStatus='received';
    const appStatus=document.querySelector('#f-applicationStatus'), reportStatus=document.querySelector('#f-reportStatus');if(appStatus)appStatus.value=draft.applicationStatus;if(reportStatus)reportStatus.value=draft.reportStatus;
    const autoParse=!before&&!draft.startDate&&!draft.endDate&&!draft.reason&&!draft.attendanceType&&!draft.reasonType&&!draft.periods&&result.text.trim()&&!controller.signal.aborted;
    if(autoParse){
      const uploadWarnings=[...editorWarnings];parseSource();
      editorWarnings=[...new Set([...uploadWarnings,...editorWarnings])];
      const warningBox=document.querySelector('#source-warnings');if(warningBox)warningBox.innerHTML=warningsHtml();
    }else toast('읽은 내용을 원문에 추가했습니다.');
    progress(controller.signal.aborted?'첨부 처리를 중단했습니다. 읽은 내용은 유지됩니다.':autoParse?'자료를 정리했습니다.':'읽은 내용을 원문에 추가했습니다.');
    if(draft.sourceType==='report')suggestReportMatch();
  }catch(error){
    if(draft?.id===recordId)progress(controller.signal.aborted?'글자 읽기를 중단했습니다. 직접 메모를 입력할 수 있습니다.':`자료를 읽지 못했습니다. ${error.message} 직접 원문을 입력할 수 있습니다.`);
  }finally{
    if(uploadController===controller)uploadController=null;
    if(draft?.id===recordId){for(const selector of ['#choose-files','#save-record','#parse-source','#f-category']){const control=document.querySelector(selector);if(control)control.disabled=false;}document.querySelector('#cancel-upload')?.remove();const input=document.querySelector('#source-files');if(input)input.value='';}
  }
}
function suggestReportMatch() {
  if(before)return;
  const parsed=parseSourceText(draft.sourceText,{referenceDate:today(),students:knownStudents()});
  const candidates=state.records.filter(r=>r.category==='experience'&&((parsed.fields.studentId&&r.studentId===parsed.fields.studentId)||(parsed.fields.studentName&&r.studentName===parsed.fields.studentName)));
  if(!candidates.length)return;
  const box=document.createElement('div');box.className='match-box';box.innerHTML=`같은 학생의 체험학습 기록이 있습니다. 보고서를 기존 신청서에 연결할 수 있습니다.${candidates.map(r=>`<button type="button" class="btn small" data-match="${esc(r.id)}">${esc(r.studentName)} · ${rangeLabel(r)} 신청 건에 연결</button>`).join('')}`;
  document.querySelector('#source-warnings').append(box);
  box.querySelectorAll('[data-match]').forEach(button=>button.onclick=()=>{
    readDraft();const target=state.records.find(r=>r.id===button.dataset.match), text=draft.sourceText, attachments=draft.attachments;
    openEditor(target,'report');draft.sourceText=[draft.sourceText,'[추가 보고서 자료]',text].filter(Boolean).join('\n\n');draft.attachments=[...draft.attachments,...attachments];draft.reportStatus='received';draft.reviewStatus='draft';renderEditor();
  });
}
function sameNeisContent(previous,next) {
  const keys=['category','studentId','studentName','startDate','endDate','attendanceType','reasonType','periods','lessonCount','reason','applicationStatus','approvalStatus'];
  return keys.every(key=>String(previous[key]||'')===String(next[key]||''))
    && String(previous.classNumber||'')===String(next.classNumber||'')
    && String(previous.number||'')===String(next.number||'')
    && JSON.stringify([...(previous.attendanceDates||[])].sort())===JSON.stringify([...(next.attendanceDates||[])].sort());
}
async function saveEditor(event) {
  event.preventDefault();readDraft();const button=document.querySelector('#save-record'),errorBox=document.querySelector('#editor-error');
  try{
    const record=normalizeRecord({...draft,reviewStatus:contentReadiness(draft).ready&&!(conversationCandidates.length>1&&!selectedCandidateId)?'reviewed':'draft',entryStatus:before?.entryStatus==='confirmed'&&sameNeisContent(before,draft)?'confirmed':'pending',neisConfirmedDates:sameNeisContent(before||{},draft)?before?.neisConfirmedDates||[]:[]});
    if(record.sourceType==='report'&&!before){
      const existing=state.records.filter(r=>r.category==='experience'&&((record.studentId&&r.studentId===record.studentId)||(record.studentName&&r.studentName===record.studentName)));
      if(existing.length&&!confirm('같은 학생의 기존 체험학습 기록이 있습니다. 기존 신청서에 연결하지 않고 별도 기록으로 저장할까요?'))return;
    }
    button.disabled=true;button.textContent='저장 중…';errorBox.textContent='';
    await persistRecord(record,before);
    dialog.close();draft=null;before=null;state.error='';render();toast(demo?'예시 기록을 이 화면에 반영했습니다.':'기록을 저장했습니다.');
  }catch(error){errorBox.textContent=error.status===409?'다른 기기에서 이 기록이 변경되었습니다. 입력한 내용은 유지했습니다. 내용을 복사해 두고 닫은 뒤 최신 기록을 불러와 다시 수정해 주세요.':error.message;button.disabled=false;button.innerHTML=`${icon('check')}기록 저장`;errorBox.scrollIntoView({block:'center'});}
}
function openClassSettings(){
  openSettings({settings:state.experienceSettings,demo,notify:toast,weekday:false,
    save:async(settings,beforeSettings)=>{
      if(demo){state.experienceSettings=normalizeExperienceSettings(settings);return;}
      accept(await api({action:'save-experience-settings',settings,beforeSettings},'POST'));
    },
    onSaved:()=>{if(!morningView?.hasPendingChanges()&&!experienceGrid?.hasPendingChanges())render();}});
}
/** 같은 학생·같은 달 반복 사유(교사가 등록한 문구)는 저장 전에 확인합니다. */
function confirmRepeatReason(record,previous){
  if(record.category!=='attendance'||!needsRepeatCheck(record,previous))return;
  const warnings=findRepeatWarnings({record,records:state.records,phrases:warningPhrasesFor(state.experienceSettings)});
  if(warnings.length&&!confirm(repeatWarningMessage(record,warnings)))throw new Error('같은 달 반복 사유 확인으로 저장을 취소했습니다. 출결 구분을 확인한 뒤 다시 저장해 주세요.');
}
async function persistRecord(record,previous) {
  confirmRepeatReason(record,previous);
  if(isExamRecord(record))previous=savedRecords.find(r=>r.id===record.id)||null;
  recordWrites++;
  try {
  if(previous&&!sameNeisContent(previous,record))record={...record,neisConfirmedDates:record.category==='experience'?retainedExperienceConfirmations(previous,record):[]};
  if(demo){const saved={...record,updatedAt:new Date().toISOString()};state.records=state.records.some(r=>r.id===saved.id)?state.records.map(r=>r.id===saved.id?saved:r):[saved,...state.records];return saved;}
  accept(await api({record,before:previous},'PATCH'));
  return state.records.find(saved=>saved.id===record.id);
  } finally {recordWrites--;}
}
async function deleteRecord() {
  if(!before||!confirm(`${before.studentName||'이 학생'}의 기록을 삭제할까요? 삭제 직후 ‘삭제 취소’로 복구할 수 있습니다.`))return;
  const record=clone(before);const button=document.querySelector('#delete-record');button.disabled=true;
  try{if(demo)state.records=state.records.filter(r=>r.id!==before.id);else accept(await api({id:before.id,before},'DELETE'));dialog.close();draft=null;before=null;render();showDeleteUndo(record);}
  catch(error){document.querySelector('#editor-error').textContent=error.message;button.disabled=false;}
}
function showReportPicker() {
  const records=state.records.filter(r=>r.category==='experience').sort((a,b)=>(a.studentId||'').localeCompare(b.studentId||'')||(b.startDate||'').localeCompare(a.startDate||''));
  dialog.className='dialog';dialog.innerHTML=`<div class="dialog-head"><div><h2 id="editor-title">어느 신청 건의 보고서인가요?</h2><p>기존 신청서에 연결하면 제출 여부를 한눈에 확인할 수 있습니다.</p></div><button class="icon-btn" id="close-picker" aria-label="닫기">${icon('close')}</button></div><div class="report-picker"><p>학생과 체험학습 기간을 확인해 선택해 주세요.</p><label class="search">${icon('search')}<input id="report-search" type="search" placeholder="학생 이름 또는 학번 검색" aria-label="보고서 학생 검색"></label><div class="match-list" id="report-matches"></div><button class="btn" id="new-report">기존 신청서 없이 새 기록으로 등록</button></div>`;
  const renderMatches=query=>{const filtered=records.filter(r=>[r.studentName,r.studentId].join(' ').includes(query));document.querySelector('#report-matches').innerHTML=filtered.length?filtered.map(r=>`<button class="match-record" data-report-match="${esc(r.id)}"><strong>${esc(r.studentId)} ${esc(r.studentName||'학생 미확인')}</strong><p>${rangeLabel(r)} · ${esc(r.location||r.reason||'체험학습')} · ${r.reportStatus==='missing'?'보고서 미제출':'보고서 접수됨'}</p></button>`).join(''):'<p class="muted">연결할 신청서가 없습니다. 아래에서 새 기록을 만들 수 있습니다.</p>';document.querySelectorAll('[data-report-match]').forEach(button=>button.onclick=()=>openEditor(state.records.find(r=>r.id===button.dataset.reportMatch),'report'));};
  renderMatches('');document.querySelector('#report-search').oninput=event=>renderMatches(event.target.value.trim());
  bindStudentMatcher({inputs:[document.querySelector('#report-search')],students:knownStudents,autoSelectId:false,onSelect:student=>{document.querySelector('#report-search').value=student.studentId;renderMatches(student.studentId);}});
  document.querySelector('#close-picker').onclick=()=>dialog.close();document.querySelector('#new-report').onclick=()=>{const record=emptyRecord();record.id=uid();record.category='experience';record.sourceType='report';openEditor(record,'report');};
  draft=null;before=null;if(!dialog.open)dialog.showModal();
}
function selectedRecords() {
  return sendQueueRecords(state.records.filter(r=>state.selected.has(r.id)&&!(state.examError&&isExamRecord(r))),state.queueDate);
}
function updateNeisActions() {
  const count=selectedRecords().length;
  for(const id of ['copy-rows','export-csv','export-json','send-neis-helper']) {
    const button=document.getElementById(id);if(button)button.disabled=!count||button.dataset.sending==='true';
  }
  const choice=document.querySelector('[data-neis-choice]');if(choice)choice.textContent=count?`${count}건 선택됨`:'먼저 아래 기록을 선택하세요';
}
async function exportSelected(format) {
  const records=selectedRecords();if(!records.length){toast('보낼 기록을 먼저 선택해 주세요.');return;}
  const button=document.getElementById('send-neis-helper'),status=document.querySelector('[data-neis-transfer-status]');
  const showStatus=message=>{if(status)status.textContent=message;toast(message);};
  if(format==='helper'&&button){if(button.dataset.sending==='true')return;button.dataset.sending='true';button.disabled=true;button.textContent='기록 보내는 중…';}
  try{
    const rows=toNeisRows(records);
    if(format==='helper'){
      const payload={schemaVersion:1,source:'teacher-notebook',exportedAt:new Date().toISOString(),workMode:state.neisPurpose==='report'?'report':'attendance',rows};
      const result=await sendToNeisHelper(payload);
      if(result.sent){if(state.neisPurpose!=='report')records.forEach(r=>{const original=state.records.find(x=>x.id===r.id);if(original)sentSnapshots.set(r.id,clone(original));});showStatus(state.neisPurpose==='report'?`${rows.length}건을 신고서 접수용으로 보냈습니다. 도우미에서 ‘학부모 신고서 접수’를 선택하세요. 출결 완료 상태는 유지됩니다.`:`${rows.length}건을 도우미로 보냈습니다. 나이스 입력·저장은 아직 완료되지 않았습니다.`);renderWorkspace();}
      else{showStatus('도우미와 연결되지 않았습니다. PC Chrome에서 도우미가 켜져 있는지 확인하고 기록함을 새로고침하세요. 파일로 옮기려면 아래 ‘다른 방법’을 펼치세요.');const other=document.querySelector('[data-neis-other]');if(other)other.open=true;}
    }else if(format==='copy'){
      const text=rows.map(r=>[`${r.studentId||`${r.classNumber}반 ${r.number}번`} ${r.studentName}`,r.date,[r.attendanceType,r.reasonType,r.periods].filter(Boolean).join(' · '),r.reason].filter(Boolean).join('\t')).join('\n');
      await navigator.clipboard.writeText(text);showStatus(`${records.length}건을 복사했습니다. 나이스의 해당 입력칸에 붙여 넣고 저장하세요.`);
    }else{
      const content=format==='csv'?exportCsv(records):JSON.stringify({schemaVersion:1,source:'teacher-notebook',exportedAt:new Date().toISOString(),workMode:state.neisPurpose==='report'?'report':'attendance',rows},null,2);
      download(content,`나이스_입력대기_${today()}.${format}`,format==='csv'?'text/csv;charset=utf-8':'application/json');
      showStatus(format==='json'?'파일을 저장했습니다. 나이스 도우미 패널 맨 위 ‘나이스 입력용 JSON 열기’에서 이 파일을 선택하세요.':'엑셀로 확인할 CSV 파일을 저장했습니다. 나이스에 직접 업로드하는 파일은 아닙니다.');
    }
  }catch(error){showStatus(format==='copy'?'복사하지 못했습니다. 아래 파일 저장 방법을 이용해 주세요.':error.message);}
  finally{if(format==='helper'&&button){delete button.dataset.sending;button.textContent=state.neisPurpose==='report'?'선택한 기록 신고서 접수용으로 보내기':'선택한 기록 보내기';updateNeisActions();}}
}
function download(content,name,mime) {
  const url=URL.createObjectURL(new Blob([content],{type:mime})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function confirmEntry(id) {
  const record=state.records.find(r=>r.id===id);if(!record||!readiness(record).ready)return;
  const scoped=queueDateRecords([record],state.queueDate);if(!scoped.length)return;
  if(!confirm(`${record.studentName} · ${rangeLabel(scoped[0])}\n나이스에서 해당 학생의 입력 내용이 저장된 것을 직접 확인하셨나요?\n확인한 경우 입력 대기 목록에서 완료로 옮깁니다.`))return;
  try{const days=toNeisRows(scoped).map(row=>row.date),completed=[...new Set([...(record.neisConfirmedDates||[]),...days])];const remaining=toNeisRows([record]).some(row=>!completed.includes(row.date));await persistRecord({...record,entryStatus:remaining?'pending':'confirmed',...(['attendance','experience'].includes(record.category)&&record.attendanceDates.length?{neisConfirmedDates:completed}:{})},record);state.selected.delete(id);render();toast('선생님이 확인한 나이스 저장 상태를 기록했습니다.');}catch(error){toast(error.message);}
}
function demoRecords() {
  const current=today(), dayOffset=days=>{const date=new Date(`${current}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
  const base=(id,name,number)=>({...emptyRecord(),id,studentId:`308${String(number).padStart(2,'0')}`,studentName:name,classNumber:8,number,updatedAt:new Date().toISOString()});
  return [
    {...base('demo-experience-1','예시학생가',1),category:'experience',sourceType:'application',startDate:dayOffset(-7),endDate:dayOffset(-5),attendanceDates:[dayOffset(-7),dayOffset(-6),dayOffset(-5)],attendanceType:'결석',reasonType:'출석인정',reason:'가족 동반 교외체험학습',location:'제주도',applicationStatus:'received',approvalStatus:'approved',reportDueDate:dayOffset(-1),reviewStatus:'reviewed',sourceText:'[화면 확인용 가상 자료]\n30801 예시학생가. 가족 동반 교외체험학습 신청. 신청 승인 확인. 보고서 미제출.'},
    {...base('demo-attendance-2','예시학생나',2),startDate:current,endDate:current,attendanceType:'지각',reasonType:'질병',periods:'조회 · 1교시',reason:'병원 진료 후 등교',sourceType:'capture',sourceText:`[화면 확인용 가상 자료]\n30802 예시학생나. ${current} 병원 진료 후 2교시부터 등교 예정.`,reviewStatus:'draft'},
    {...base('demo-experience-3','예시학생다',3),category:'experience',sourceType:'application',startDate:dayOffset(10),endDate:dayOffset(12),reason:'가족 동반 역사 문화 탐방',location:'경주',applicationStatus:'received',reportDueDate:dayOffset(18),sourceText:'[화면 확인용 가상 자료]\n30803 예시학생다. 가족 동반 경주 체험학습 신청서 제출. 승인 확인 전.'},
    {...base('demo-counseling-4','예시학생라',4),category:'counseling',startDate:current,endDate:current,reason:'수능 이후 진로 계획과 면접 준비 일정을 함께 점검함.',sourceText:'[화면 확인용 가상 자료]\n30804 예시학생라 면접 준비 계획 상담.',reviewStatus:'reviewed'},
    {...base('demo-experience-5','예시학생마',5),category:'experience',sourceType:'report',startDate:dayOffset(-14),endDate:dayOffset(-13),attendanceDates:[dayOffset(-14),dayOffset(-13)],attendanceType:'결석',reasonType:'출석인정',reason:'가족 동반 지역 문화 체험',applicationStatus:'received',approvalStatus:'approved',reportStatus:'reviewed',reviewStatus:'reviewed',entryStatus:'confirmed',sourceText:'[화면 확인용 가상 자료]\n신청서와 보고서 내용 확인 완료.'},
  ];
}
async function boot() {
  if(demo){state.user={username:'demo',displayName:'예시담임'};state.records=demoRecords();render();return;}
  try{accept(await api());render();}catch(error){state.error=error.status===401?'':error.message;renderAuth();}
}
boot();


async function syncNeisCompletions() {
  if(morningView?.hasPendingChanges()||morningView?.isBusy()||practicalView?.isBusy()||completionSyncBusy||!state.user||document.visibilityState==='hidden'||document.querySelector('dialog[open]')||experienceGrid?.hasPendingChanges())return;
  completionSyncBusy=true;
  try {
    const receipts=await completedNeisRows();if(!receipts.length)return;
    if(!demo)accept(await api());
    const owner=state.user?.username;if(!owner)return;
    const acknowledged=[];let changed=0;
    for(const record of [...state.records]) {
      const result=applyNeisCompletion(record,receipts);
      if(!result.acknowledged.length)continue;
      if(state.user?.username!==owner)break;
      if(result.changed){await persistRecord(result.record,record);changed++;}
      acknowledged.push(...result.acknowledged);
    }
    if(acknowledged.length)await acknowledgeNeisRows(acknowledged);
    if(changed){render();toast('나이스 저장 확인을 반영했습니다. 완료한 날짜는 다시 전송하지 않습니다.');}
  }catch(error){if(error.status===409)toast('다른 기기의 수정이 있어 완료 동기화를 다시 확인합니다.');}
  finally{completionSyncBusy=false;}
}
async function syncSharedNotebook(){
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||morningView?.hasPendingChanges()||morningView?.isBusy()||demo||sharedSyncBusy||completionSyncBusy||recordWrites||!state.user||document.visibilityState==='hidden'||document.querySelector('dialog[open]')||experienceGrid?.hasPendingChanges()||experienceGrid?.isBusy?.()||practicalView?.isBusy())return;
  const owner=state.user.username,revision=state.revision;
  sharedSyncBusy=true;
  try{
    const result=await api();
    if(morningView?.hasPendingChanges()||morningView?.isBusy()||state.user?.username!==owner||state.revision!==revision||recordWrites||document.querySelector('dialog[open]')||experienceGrid?.hasPendingChanges()||experienceGrid?.isBusy?.()||practicalView?.isBusy())return;
    if(!result.authenticated){accept(result);render();return;}
    if(result.revision!==revision||JSON.stringify(result.dailyExamEvents||[])!==JSON.stringify(state.dailyExamEvents||[])){accept(result);state.dailyExamEvents=result.dailyExamEvents;render();}
  }catch(error){if(error.status===401&&state.user?.username===owner){state.user=null;render();}}
  finally{sharedSyncBusy=false;}
}
window.addEventListener('focus',()=>syncNeisCompletions().finally(syncSharedNotebook));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncNeisCompletions().finally(syncSharedNotebook);});
setInterval(syncNeisCompletions,8000);
setInterval(syncSharedNotebook,15000);



