import { queueOrder, retryProgress, verified } from './queue-order.js';
import { isNeisUrl, parseQueue } from './core.js';
import { reportPlan } from './report-plan.js';
import { attendancePlan } from './attendance-plan.js';
import { PANEL_MESSAGE } from './bridge-core.js';
const $ = id => document.getElementById(id);
let autoRetries={},rows=[],progress={},current=0,busy=false,stopRequested=false,transferId='',queueChanges=0,workMode='attendance',retryRound=0;
const row=()=>rows[current];
const completed=item=>verified(progress,item);
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
async function persist(){const result=await chrome.runtime.sendMessage({type:PANEL_MESSAGE,protocol:1,command:'save',transferId,progress,current,workMode});if(!result?.ok)throw new Error(result?.error||'진행 상태를 저장하지 못했습니다.');}
function applyQueue(saved,message='앱에서 기록을 받았습니다.'){
 retryRound=0;
 rows=saved?.rows?.length?parseQueue({schemaVersion:1,source:'teacher-notebook',rows:saved.rows}):[];
 progress=saved?.progress||{};current=Math.max(0,Math.min(Number(saved?.current)||0,rows.length-1));transferId=saved?.transferId||'';
 setWorkMode(saved?.workMode);render();status(rows.length?message:'입력 대기를 지웠습니다.');
}
function renderList(){
 const list=$('student-list'),top=list.scrollTop;
 list.replaceChildren(...queueOrder(rows,progress).map(({item,index})=>{
 const button=document.createElement('div');button.className='student-item'+(workMode==='attendance'&&completed(item)?' is-completed':'');button.disabled=busy;button.setAttribute('aria-current',index===current?'true':'false');
 const check=document.createElement('input');check.type='checkbox';check.hidden=workMode==='report';check.checked=completed(item);check.disabled=busy||workMode==='report';check.setAttribute('aria-label',`${item.studentName} ${item.date} 나이스 입력 완료 표시 · 해제하면 미입력`);check.title='체크: 입력 완료 / 해제: 미입력으로 되돌리기. 나이스 저장 내용은 바뀌지 않습니다.';check.addEventListener('click',event=>event.stopPropagation());check.addEventListener('change',()=>markManualCompleted(item,check.checked));
 const text=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');
 name.textContent=`${item.studentId||`${item.classNumber}반 ${item.number}번`} ${item.studentName}`;
 detail.textContent=`${item.date} · ${item.reasonType} ${item.attendanceType}${item.periods?' · '+item.periods:''}`;
 text.append(name,detail);const state=document.createElement('span');state.className='student-state';state.textContent=workMode==='report'?(index===current?'신고서 선택됨':'신고서 선택'):completed(item)?(progress[item.queueId]?.manualConfirmed?'✓ 수기 완료':'✓ 완료'):progress[item.queueId]?.skipError?(/저장|적용한 내용|일부 내용|중단|화면을 확인/.test(progress[item.queueId].skipError)?'확인 필요':'미입력'):index===current?'선택됨':'대기';
 const select=document.createElement('button');select.type='button';select.className='student-select';select.disabled=busy;select.setAttribute('aria-label',`${item.studentName} ${item.date} 자동입력할 기록 선택`);select.append(text,state);button.append(check,select);select.onclick=async()=>{if(busy)return;current=index;render();try{await persist();}catch(error){status(error.message,true);}};return button;
 }));list.scrollTop=top;
}
async function markManualCompleted(item,checked){
 if(busy||workMode!=='attendance'||completed(item)===checked)return;
 const activeTransfer=transferId,previous=progress[item.queueId];busy=true;updateButtons();
 try{progress[item.queueId]={fields:previous?.fields||[],saved:checked,autoVerified:false,...(checked?{manualConfirmed:true}:{})};await persist();if(transferId===activeTransfer){updateProgress();status(checked?'수기 입력 완료로 표시했습니다. 앱에도 반영됩니다.':'미입력으로 되돌렸습니다. 앱에도 반영됩니다. 나이스에 저장된 내용은 그대로입니다.');}}
 catch(error){if(transferId===activeTransfer){if(previous)progress[item.queueId]=previous;else delete progress[item.queueId];updateProgress();}status(error.message,true);}
 finally{busy=false;updateButtons();}
}
function updateButtons(){
 $('stop-work').hidden=!busy||workMode==='report';$('stop-work').disabled=!busy||workMode==='report';
 $('retry-pending').hidden=workMode==='report'||!rows.some(item=>!completed(item));$('retry-pending').disabled=busy;
 for(const button of document.querySelectorAll('[data-work-mode]'))button.disabled=busy;
 let error='';try{if(row()){(workMode==='report'?reportPlan:attendancePlan)(row());if(!row().studentId)error='학생 학번을 확인해 주세요.';else if(!row().reason)error='앱에서 사유를 입력해 주세요.';}}catch(e){error=e.message;}
 $('grid-fill').disabled=busy||!row()||!!error||(workMode!=='report'&&completed(row()));
 $('input-error').textContent=error;
 for(const button of $('student-list').querySelectorAll('button'))button.disabled=busy;
 for(const check of $('student-list').querySelectorAll('input'))check.disabled=busy||workMode==='report';
}
function updateProgress(){
 renderList();$('count').textContent=workMode==='report'?`신고서 대상 ${rows.length}건`:`${rows.filter(completed).length}/${rows.length}건 완료`;
 $('completion-help').textContent=workMode==='report'?'일일출결 완료와 별개입니다. 학생을 선택하고 나이스에서 같은 학생의 신고서 상세를 여세요.':'체크하면 일일출결 입력 완료 · 다시 누르면 해제됩니다.';
 const skipped=workMode==='report'?[]:rows.filter(item=>progress[item.queueId]?.skipError);$('skip-summary').hidden=!skipped.length;
 $('skip-list').textContent=skipped.map(item=>`${item.studentId} ${item.studentName} · ${item.date}\n${progress[item.queueId].skipError}`).join('\n\n');
}
function render(){
 $('queue').hidden=!rows.length;$('grid-status').textContent='';
 updateProgress();updateButtons();
 $('student-list').querySelector('[aria-current=true]')?.scrollIntoView({block:'nearest'});
}
async function activeNeisTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isNeisUrl(tab.url)) throw new Error('HTTPS 나이스(neis.go.kr) 탭을 열고 직접 로그인해 주세요.');
  return tab;
}
async function fillCurrentGrid(){
  if(!row()||busy||stopRequested)return;
  const item=row(),activeTransfer=transferId;
  busy=true;updateButtons();$('grid-status').textContent='학생·날짜를 대조하고 입력 중…';
  try {
    const plan=attendancePlan(item),tab=await activeNeisTab();
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['popup.js','grid.js']});
    if(stopRequested)throw new Error('중단 요청을 받았습니다. 현재 학생의 나이스 화면을 확인해 주세요.');
    const result=await chrome.tabs.sendMessage(tab.id,{type:'TEACHER_NOTEBOOK_GRID',command:'fill',row:item,plan,autoSave:true});
    if(!result?.ok)throw new Error(result?.error||'학생 행에 입력하지 못했습니다.');
    if(transferId!==activeTransfer||row()!==item)throw new Error('입력 대기가 변경되었습니다. 나이스의 학생과 값을 확인해 주세요.');
    const previous=progress[item.queueId]||{fields:[],saved:false};
    progress[item.queueId]={fields:[...new Set([...previous.fields,...result.fields])],saved:result.saved===true,autoVerified:result.saved===true,...(result.skipped?{skipError:result.message}:{})};
    await persist();updateProgress();$('grid-status').textContent=result.message;
    if(result.saved===true||result.skipped===true){busy=false;await advanceAfterSave(activeTransfer);}
  }catch(error){
    $('grid-status').textContent=error.message;
    if(stopRequested){
      if(transferId===activeTransfer&&row()===item){
        const previous=progress[item.queueId]||{fields:[],saved:false};
        progress[item.queueId]={...previous,saved:false,autoVerified:false,skipError:'사용자가 중단했습니다. 나이스에 일부 내용이 입력되었을 수 있으니 화면을 확인하세요.'};
        try{await persist();}catch(saveError){status('중단 상태 동기화 실패: '+saveError.message,true);}
        updateProgress();
      }
      status('자동입력을 중단했습니다. 현재 학생은 완료 처리하지 않았습니다. 나이스 화면을 확인하세요.');
      return;
    }
    // 나이스 화면 갱신이 늦어 실패한 경우가 많아, 같은 학생을 잠시 뒤 최대 2번 자동으로 다시 시도합니다.
    if(transferId===activeTransfer&&row()===item&&(autoRetries[item.queueId]||0)<2){
      autoRetries[item.queueId]=(autoRetries[item.queueId]||0)+1;
      $('grid-status').textContent=`${error.message}\n잠시 후 같은 학생을 다시 시도합니다(${autoRetries[item.queueId]}/2).`;
      busy=false;await new Promise(resolve=>setTimeout(resolve,1500));
      if(!stopRequested&&transferId===activeTransfer&&row()===item)return await fillCurrentGrid();
    }
    if(transferId===activeTransfer&&row()===item){
      progress[item.queueId]={fields:progress[item.queueId]?.fields||[],saved:false,autoVerified:false,skipError:error.message};
      try{await persist();}catch(saveError){status('미입력 목록 동기화 실패: '+saveError.message,true);}
      updateProgress();busy=false;await advanceAfterSave(activeTransfer);
    }
  }
  finally{busy=false;updateButtons();}
}
async function fillReport(){
 if(!row()||busy)return;const item=row();busy=true;updateButtons();$('grid-status').textContent='신고서 학생·날짜 확인 중…';
 try{const plan=reportPlan(item),tab=await activeNeisTab();await chrome.scripting.executeScript({target:{tabId:tab.id},files:['report.js']});
 const result=await chrome.tabs.sendMessage(tab.id,{type:'TEACHER_NOTEBOOK_REPORT',command:'fill',row:item,plan});if(!result?.ok)throw new Error(result?.error||'신고서에 입력하지 못했습니다.');$('grid-status').textContent=result.message;
 }catch(error){$('grid-status').textContent=error.message;}finally{busy=false;updateButtons();}
}
function setWorkMode(mode){workMode=mode==='report'?'report':'attendance';$('attendance-start-guide').hidden=workMode==='report';$('report-start-guide').hidden=workMode!=='report';for(const modeButton of document.querySelectorAll('[data-work-mode]'))modeButton.setAttribute('aria-pressed',String(modeButton.dataset.workMode===workMode));$('grid-fill').textContent=workMode==='report'?'열린 신고서 접수 · 저장':'자동입력 · 저장 · 다음 학생';$('grid-status').textContent='';updateProgress();updateButtons();}
for(const button of document.querySelectorAll('[data-work-mode]'))button.addEventListener('click',()=>{if(!busy)setWorkMode(button.dataset.workMode);});
$('grid-fill').addEventListener('click',()=>{stopRequested=false;retryRound=0;autoRetries={};return workMode==='report'?fillReport():fillCurrentGrid();});
$('stop-work').addEventListener('click',async()=>{
 if(!busy||stopRequested)return;
 stopRequested=true;$('stop-work').disabled=true;$('grid-status').textContent='중단 요청 중… 현재 진행 중인 작업을 멈추고 다음 학생은 처리하지 않습니다.';
 try{const tab=await activeNeisTab();await chrome.tabs.sendMessage(tab.id,{type:'TEACHER_NOTEBOOK_GRID',command:'cancel'});}catch{}
});
async function advanceAfterSave(savedTransfer) {
  if(transferId!==savedTransfer)return;
  if(stopRequested){updateProgress();status('자동입력을 중단했습니다. 완료된 기록은 유지하고 나머지는 대기 상태입니다.');return;}
    const next = rows.findIndex((item,index)=>index>current&&!completed(item)&&!progress[item.queueId]?.skipError);
    const pending = next >= 0 ? next : rows.findIndex(item=>!completed(item)&&!progress[item.queueId]?.skipError);
    if (pending >= 0) {
      busy=true;current=pending;render();
      try {await persist();} catch(error){status(error.message,true);return;}
      finally{busy=false;updateButtons();}
      if(transferId!==savedTransfer)return;
      status('다음 학생·날짜를 입력합니다. 실패한 건은 미입력 목록에 남깁니다.');
      await new Promise(resolve=>setTimeout(resolve,1000));
      if(transferId!==savedTransfer)return;
      await fillCurrentGrid();
      return;
    }
  updateProgress();
  const failed=rows.filter(item=>!completed(item));
  // Do not automatically restart a failed queue: app sync may replace the transfer ID,
  // resetting an in-memory retry counter and causing an endless retry cycle.
  status(failed.length?`자동입력 종료 · 미입력 ${failed.length}건. 나이스 화면과 해당 학생의 저장 상태를 확인한 뒤 필요한 건만 직접 재입력해 주세요.`:'전체 저장 완료 · 앱 대기함에 반영됩니다.',failed.length>0);
}
$('retry-pending').addEventListener('click',async()=>{
  if(busy||workMode!=='attendance')return;
  stopRequested=false;retryRound=0;autoRetries={};
  const first=rows.findIndex(item=>!completed(item));if(first<0)return;
  const activeTransfer=transferId,previous=progress;busy=true;updateButtons();
  try{progress=retryProgress(rows,progress);current=first;await persist();render();busy=false;if(transferId===activeTransfer)await fillCurrentGrid();}
  catch(error){if(transferId===activeTransfer)progress=previous;status(error.message,true);}
  finally{busy=false;updateButtons();}
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes.teacherNotebook) return;
  queueChanges++;
  const next = changes.teacherNotebook.newValue;
  if (!next || (next.transferId || '') !== transferId) {
    try { applyQueue(next); } catch { status('새 입력 대기를 읽지 못했습니다. 앱에서 다시 보내 주세요.', true); }
  }
});
try {
  const initialVersion = queueChanges;
  const { teacherNotebook: saved } = await chrome.storage.session.get('teacherNotebook');
  if (initialVersion !== queueChanges) { /* The live update already rendered the newer queue. */ }
  else if (saved?.rows?.length) {
    applyQueue(saved, '브라우저를 종료하기 전의 입력 대기를 불러왔습니다.');
  } else updateButtons();
} catch { status('이전 입력 대기를 읽지 못했습니다. 앱에서 다시 보내 주세요.', true); }



