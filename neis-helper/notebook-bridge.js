// Isolated content script: only the exact production notebook origin can send a queue.
(() => {
  const origin = 'https://easy-attendance-personal.minhwan15370665.chatgpt.site';
  const requestType = 'TEACHER_NOTEBOOK_APP_BRIDGE';
  const responseType = 'TEACHER_NOTEBOOK_EXTENSION_BRIDGE';
  if (location.origin !== origin || window.top !== window) return;
  let panelOpening=null;
  // Listen in the isolated content script to the actual user click, before async app work.
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#send-neis-helper,#morning-neis,[data-neis-send],[data-exam-send]');
    if(!event.isTrusted||!button||button.disabled)return;
    panelOpening=chrome.runtime.sendMessage({type:requestType,protocol:1,command:'open-panel'})
      .catch(()=>({ok:false}));
  },true);
  window.addEventListener('message', async event => {
    const message = event.data;
    if (event.source !== window || event.origin !== origin || message?.type !== requestType || message.protocol !== 1
      || !['hello', 'queue','completed','ack-completed'].includes(message.command) || typeof message.requestId !== 'string'
      || !/^[A-Za-z0-9_-]{8,100}$/.test(message.requestId)) return;
    let result;
    try {
      if (message.command === 'queue') {
        const text = JSON.stringify(message.payload);
        if (!text || new TextEncoder().encode(text).length > 4 * 1024 * 1024) throw new Error('입력 자료는 4MB 이하로 나누어 보내 주세요.');
      }
      result = await chrome.runtime.sendMessage({ type: requestType, protocol: 1, command: message.command, requestId: message.requestId,
        ...(['queue','ack-completed'].includes(message.command) ? { payload: message.payload } : {}) });
    } catch { result = { ok: false, error: '도우미 연결이 끊겼습니다. 확장 프로그램과 앱을 새로고침해 주세요.' }; }
    const panelResult=message.command==='queue'&&panelOpening?await panelOpening:null;
    window.postMessage({ type: responseType, protocol: 1, requestId: message.requestId, command: message.command,
      ok: result?.ok === true, available: result?.available === true, count: result?.count, error: result?.error, completed:result?.completed, ...(panelResult?{panelOpened:panelResult.ok===true}: {}) }, origin);
  });
})();
