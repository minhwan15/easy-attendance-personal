import { parseQueue } from './core.js';

export const NOTEBOOK_ORIGIN = "https://easy-attendance-personal.vercel.app";
export const APP_MESSAGE = 'TEACHER_NOTEBOOK_APP_BRIDGE';
export const PANEL_MESSAGE = 'TEACHER_NOTEBOOK_PANEL_STATE';
export const queueWorkMode = payload => payload?.workMode==='report'?'report':'attendance';
export const MAX_QUEUE_BYTES = 4 * 1024 * 1024;

export function isNotebookUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === NOTEBOOK_ORIGIN && !url.username && !url.password;
  } catch { return false; }
}

export function boundedQueue(payload) {
  let json;
  try { json = JSON.stringify(payload); } catch { throw new Error('입력 자료의 형식을 확인해 주세요.'); }
  if (!json || new TextEncoder().encode(json).length > MAX_QUEUE_BYTES) throw new Error('입력 자료는 4MB 이하로 나누어 보내 주세요.');
  return parseQueue(payload);
}

const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value);

/** All queue changes are serialized; an older open panel cannot overwrite a new import. */
export function createQueueMessageHandler({ extensionId, read, write, remove, recordCompleted=async()=>{}, readCompleted=async()=>[], ackCompleted=async()=>{} }) {
  let pending = Promise.resolve();
  const enqueue = action => {
    const result = pending.then(action);
    pending = result.catch(() => {});
    return result;
  };
  return async function handle(message, sender) {
    try {
      if (sender?.id !== extensionId || message?.protocol !== 1) throw new Error('허용되지 않은 연결입니다.');
      if (message.type === APP_MESSAGE) {
        if (sender.frameId !== 0 || !isNotebookUrl(sender.url) || !isNotebookUrl(sender.tab?.url)
          || (sender.origin && sender.origin !== NOTEBOOK_ORIGIN) || !validId(message.requestId)) throw new Error('허용되지 않은 기록장 연결입니다.');
        if (message.command === 'hello') return { ok: true, available: true, version: '0.3.5' };
        if(message.command==='completed')return await enqueue(async()=>({ok:true,completed:await readCompleted()}));
        if(message.command==='ack-completed') {
          const ids=message.payload?.ids;
          if(!Array.isArray(ids)||ids.length>2000||ids.some(id=>typeof id!=='string'||!id||id.length>400))throw new Error('완료 기록 식별자를 확인해 주세요.');
          return await enqueue(async()=>{await ackCompleted(ids);return {ok:true};});
        }
        if (message.command !== 'queue') throw new Error('지원하지 않는 연결 요청입니다.');
        const rows = boundedQueue(message.payload);
        return await enqueue(async () => {
          await write({ rows, workMode:queueWorkMode(message.payload), progress: {}, current: 0, transferId: message.requestId });
          return { ok: true, count: rows.length };
        });
      }
      if (message.type !== PANEL_MESSAGE || sender.url !== `chrome-extension://${extensionId}/panel.html`) throw new Error('허용되지 않은 패널입니다.');
      if (message.command === 'import') {
        if (!validId(message.requestId)) throw new Error('입력 자료의 식별자를 확인해 주세요.');
        const rows = boundedQueue(message.payload);
        return await enqueue(async () => {
          const state = { rows, workMode:queueWorkMode(message.payload), progress: {}, current: 0, transferId: message.requestId };
          await write(state);
          return { ok: true, state };
        });
      }
      if (!['save', 'clear'].includes(message.command)) throw new Error('지원하지 않는 패널 요청입니다.');
      return await enqueue(async () => {
        const state = await read();
        if ((state?.transferId || '') !== (message.transferId || '')) return { ok: false, code: 'queue_changed', error: '앱에서 새 기록을 받았습니다. 새 입력 대기를 확인해 주세요.' };
        if (message.command === 'clear') { await remove(); return { ok: true }; }
        if (!state?.rows?.length) throw new Error('불러온 입력 대기가 없습니다.');
        const rows = boundedQueue({ schemaVersion: 1, source: 'teacher-notebook', rows: state.rows });
        if (!Number.isInteger(message.current) || message.current < 0 || message.current >= rows.length) throw new Error('선택한 기록을 확인해 주세요.');
        const progress = {};
        for (const row of rows) {
          const item = message.progress?.[row.queueId];
          if (!item) continue;
          if (!Array.isArray(item.fields) || item.fields.some(field => typeof field !== 'string' || !Object.hasOwn(row, field)) || typeof item.saved !== 'boolean') throw new Error('입력 진행 상태를 확인해 주세요.');
          progress[row.queueId] = { fields: [...new Set(item.fields)], saved: item.saved, autoVerified: item.saved===true&&item.autoVerified===true, ...(item.saved===true&&item.manualConfirmed===true?{manualConfirmed:true}:{}), ...(item.saved===false&&typeof item.skipError==='string'?{skipError:item.skipError.slice(0,300)}:{}) };
        }
        const done=value=>value?.saved===true&&(value.autoVerified===true||value.manualConfirmed===true);
        const newlySaved=rows.filter(row=>done(progress[row.queueId])&&!done(state.progress?.[row.queueId]));
        const reset=rows.filter(row=>!done(progress[row.queueId])&&done(state.progress?.[row.queueId]));
        if(newlySaved.length)await recordCompleted(newlySaved.map(row=>({completionId:`${state.transferId}:${row.queueId}:done:${crypto.randomUUID()}`,autoVerified:progress[row.queueId].autoVerified,...(progress[row.queueId].manualConfirmed?{manualConfirmed:true}:{}),row})));
        if(reset.length)await recordCompleted(reset.map(row=>({completionId:`${state.transferId}:${row.queueId}:undo:${crypto.randomUUID()}`,autoVerified:false,manualConfirmed:true,revoked:true,row})));
        await write({ ...state, rows, progress, current: message.current, workMode:message.workMode==='report'?'report':message.workMode==='attendance'?'attendance':state.workMode||'attendance' });
        return { ok: true };
      });
    } catch (error) { return { ok: false, error: error.message || '입력 대기를 전달하지 못했습니다.' }; }
  };
}


