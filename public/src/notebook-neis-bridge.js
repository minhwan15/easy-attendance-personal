import { prepareNeisTransfer } from './notebook-neis-preflight.js';
const NOTEBOOK_ORIGIN = 'https://easy-attendance-personal.minhwan15370665.chatgpt.site';
const REQUEST_TYPE = 'TEACHER_NOTEBOOK_APP_BRIDGE';
const RESPONSE_TYPE = 'TEACHER_NOTEBOOK_EXTENSION_BRIDGE';

function request(target, command, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const requestId = target.crypto.randomUUID();
    let timer;
    const finish = (value, error) => {
      clearTimeout(timer);
      target.removeEventListener('message', receive);
      error ? reject(error) : resolve(value);
    };
    const receive = event => {
      const response = event.data;
      if (event.source !== target || event.origin !== NOTEBOOK_ORIGIN || response?.type !== RESPONSE_TYPE
        || response.protocol !== 1 || response.requestId !== requestId || response.command !== command) return;
      finish(response);
    };
    target.addEventListener('message', receive);
    timer = setTimeout(() => finish(null), timeoutMs);
    try {
      target.postMessage({ type: REQUEST_TYPE, protocol: 1, requestId, command, ...(['queue','ack-completed'].includes(command) ? { payload } : {}) }, NOTEBOOK_ORIGIN);
    } catch (error) { finish(null, error); }
  });
}

/** Call only from the teacher's send button. No login, API calls or NEIS save is performed. */
export async function sendToNeisHelper(payload, { targetWindow = globalThis.window, helloTimeout = 900, sendTimeout = 5000 } = {}) {
  if (!targetWindow || targetWindow.location?.origin !== NOTEBOOK_ORIGIN) return { sent: false, reason: 'unavailable' };
  payload=prepareNeisTransfer(payload);
  const hello = await request(targetWindow, 'hello', undefined, helloTimeout);
  if (!hello?.ok || !hello.available) {
    showNeisRefreshNotice(targetWindow);
    return { sent: false, reason: 'unavailable' };
  }
  const reply = await request(targetWindow, 'queue', payload, sendTimeout);
  if (!reply) throw new Error('도우미의 수신 확인이 늦어지고 있습니다. PC 도우미의 입력 대기를 확인한 뒤 다시 보내 주세요.');
  if (!reply.ok) throw new Error(reply.error || '도우미로 입력 자료를 보내지 못했습니다.');
  return { sent: true, count: reply.count };
}

/** Saved only after the teacher explicitly confirms the real NEIS save result. */
export async function completedNeisRows({targetWindow=globalThis.window,timeout=1600}={}) {
  if(!targetWindow||targetWindow.location?.origin!==NOTEBOOK_ORIGIN)return [];
  const reply=await request(targetWindow,'completed',undefined,timeout);
  if(!reply?.ok||!Array.isArray(reply.completed))return [];
  return reply.completed;
}
export async function acknowledgeNeisRows(ids,{targetWindow=globalThis.window,timeout=3000}={}) {
  const reply=await request(targetWindow,'ack-completed',{ids},timeout);
  if(!reply?.ok)throw new Error(reply?.error||'완료 동기화 확인이 늦어지고 있습니다. 앱을 다시 열면 재확인합니다.');
}

export async function checkNeisHelper({targetWindow=globalThis.window,timeout=1200}={}){
 if(!targetWindow||targetWindow.location?.origin!==NOTEBOOK_ORIGIN)return {connected:false};
 const reply=await request(targetWindow,'hello',undefined,timeout);
 const connected=reply?.ok===true&&reply.available===true;
 if(!connected)showNeisRefreshNotice(targetWindow);
 return {connected};
}

function showNeisRefreshNotice(targetWindow) {
 const doc=targetWindow?.document;
 if(!doc?.body)return;
 doc.getElementById('neis-refresh-notice')?.remove();
 const notice=doc.createElement('section');
 notice.id='neis-refresh-notice';
 notice.setAttribute('role','alert');
 notice.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:min(440px,calc(100% - 32px));box-sizing:border-box;z-index:10000;padding:18px;border:2px solid #2454d6;border-radius:14px;background:#fff;box-shadow:0 8px 32px #0003;color:#1e293b';
 const message=doc.createElement('p');
 message.textContent='방금 도우미를 설치·업데이트했다면 앱을 새로고침하세요.';
 message.style.cssText='margin:0 0 10px;font-weight:700;line-height:1.6';
 const hint=doc.createElement('p');
 hint.textContent='작성 중인 내용은 먼저 저장하세요. 새로고침 후 기록을 다시 보내 주세요.';
 hint.style.cssText='margin:0 0 14px;font-size:13px;line-height:1.6';
 const refresh=doc.createElement('button');
 refresh.type='button';refresh.className='btn primary';refresh.textContent='앱 새로고침';
 refresh.addEventListener('click',()=>targetWindow.location.reload());
 const close=doc.createElement('button');
 close.type='button';close.className='btn';close.textContent='닫기';close.style.marginLeft='8px';
 close.addEventListener('click',()=>notice.remove());
 notice.append(message,hint,refresh,close);
 doc.body.append(notice);
}
