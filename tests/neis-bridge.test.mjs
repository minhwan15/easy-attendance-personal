import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createQueueMessageHandler, APP_MESSAGE, PANEL_MESSAGE, NOTEBOOK_ORIGIN, isNotebookUrl } from '../neis-helper/bridge-core.js';
import { sendToNeisHelper } from '../public/src/notebook-neis-bridge.js';

const extensionId = 'test-extension';
const payload = () => ({ schemaVersion: 1, source: 'teacher-notebook', rows: [{ recordId: 'experience-1', category: 'experience', studentId: '30801', studentName: '예시학생', date: '2026-11-20', attendanceType: '결석', reasonType: '출석인정', reason: '교외체험학습' }] });
const sender = () => ({ id: extensionId, frameId: 0, origin: NOTEBOOK_ORIGIN, url: `${NOTEBOOK_ORIGIN}/notebook.html`, tab: { url: `${NOTEBOOK_ORIGIN}/notebook.html` } });
const panelSender = () => ({ id: extensionId, url: `chrome-extension://${extensionId}/panel.html` });
const message = (requestId = 'request-0001') => ({ type: APP_MESSAGE, protocol: 1, command: 'queue', requestId, payload: payload() });
function receiver() {
  let state, writes = 0;
  const receive = createQueueMessageHandler({ extensionId, read: async () => state, write: async next => { writes++; state = structuredClone(next); }, remove: async () => { state = undefined; } });
  return { receive, state: () => state, writes: () => writes };
}

test('the bridge imports canonical app records locally and discards unrelated source material', async () => {
  const store = receiver(), request = message();
  request.payload.rows[0].attachment = 'unrelated-source'; request.payload.original = 'unrelated-source';
  assert.deepEqual(await store.receive(request, sender()), { ok: true, count: 1 });
  assert.equal(store.state().rows[0].category, 'experience');
  assert.equal(store.state().rows[0].attachment, undefined);
  assert.deepEqual(store.state().progress, {});
  assert.equal(store.state().transferId, request.requestId);
  assert.equal(store.state().current, 0);
});

test('only the installed extension top frame from the exact app origin may submit or discover', async () => {
  const store = receiver();
  const invalidSenders = [
    { ...sender(), id: 'other-extension' }, { ...sender(), frameId: 2 },
    { ...sender(), url: 'https://class-calendar-beryl.vercel.app.evil.example/notebook.html' },
    { ...sender(), origin: 'https://evil.example' },
    { ...sender(), tab: { url: 'https://evil.example' } },
    { ...sender(), url: 'http://class-calendar-beryl.vercel.app/notebook.html' },
  ];
  for (const caller of invalidSenders) {
    assert.equal((await store.receive(message(), caller)).ok, false);
    assert.equal((await store.receive({ ...message(), command: 'hello' }, caller)).ok, false);
  }
  assert.equal(store.writes(), 0);
  assert.equal((await store.receive({ ...message(), command: 'hello' }, sender())).available, true);
  assert.equal(store.writes(), 0);
  assert.equal(isNotebookUrl(`${NOTEBOOK_ORIGIN}/notebook.html?demo=1`), true);
  assert.equal(isNotebookUrl('https://user@class-calendar-beryl.vercel.app/'), false);
});

test('bad rows, huge payloads and malformed envelopes cannot replace the current queue', async () => {
  const store = receiver(); await store.receive(message(), sender());
  const badDate = message('request-0002'); badDate.payload.rows.push({ ...badDate.payload.rows[0], date: '2026-02-30' });
  const tooMany = message('request-0003'); tooMany.payload.rows = Array.from({ length: 2001 }, () => payload().rows[0]);
  const tooLarge = message('request-0004'); tooLarge.payload.original = '가'.repeat(1400000);
  for (const request of [badDate, tooMany, tooLarge, { ...message(), protocol: 2 }, { ...message(), requestId: 'x' }]) {
    assert.equal((await store.receive(request, sender())).ok, false);
  }
  assert.equal(store.writes(), 1);
  assert.equal(store.state().transferId, 'request-0001');
});

test('a stale open panel cannot save over or clear a newly transferred queue', async () => {
  const store = receiver(); await store.receive(message(), sender());
  const savedProgress = { [store.state().rows[0].queueId]: { fields: ['reason'], saved: true } };
  const panelSave = { type: PANEL_MESSAGE, protocol: 1, command: 'save', transferId: 'request-0001', current: 0, progress: savedProgress };
  assert.equal((await store.receive(panelSave, panelSender())).ok, true);
  await store.receive(message('request-0002'), sender());
  assert.equal((await store.receive(panelSave, panelSender())).code, 'queue_changed');
  assert.equal((await store.receive({ ...panelSave, command: 'clear' }, panelSender())).code, 'queue_changed');
  assert.equal(store.state().transferId, 'request-0002');
  assert.deepEqual(store.state().progress, {});
});

test('JSON panel import remains supported and panel state changes reject website senders', async () => {
  const store = receiver();
  const request = { type: PANEL_MESSAGE, protocol: 1, command: 'import', requestId: 'file-0000001', payload: payload() };
  assert.equal((await store.receive(request, sender())).ok, false);
  assert.equal((await store.receive(request, panelSender())).ok, true);
  const save = { type: PANEL_MESSAGE, protocol: 1, command: 'save', transferId: 'file-0000001', current: 0, progress: { [store.state().rows[0].queueId]: { fields: ['reason'], saved: false } } };
  assert.equal((await store.receive(save, panelSender())).ok, true);
  assert.equal((await store.receive({ ...save, command: 'clear' }, panelSender())).ok, true);
  assert.equal(store.state(), undefined);
});

function fakeWindow(answer) {
  const listeners = new Set(), sent = [];
  let serial = 0;
  const target = {
    location: { origin: NOTEBOOK_ORIGIN }, crypto: { randomUUID: () => `request-test-${++serial}` },
    addEventListener: (event, callback) => listeners.add(callback), removeEventListener: (event, callback) => listeners.delete(callback),
    postMessage: (request, origin) => {
      assert.equal(origin, NOTEBOOK_ORIGIN); sent.push(request);
      queueMicrotask(() => {
        const reply = answer(request); if (!reply) return;
        const event = { source: target, origin: NOTEBOOK_ORIGIN, data: { ...request, type: 'TEACHER_NOTEBOOK_EXTENSION_BRIDGE', ...reply } };
        for (const listener of [...listeners]) listener(event);
      });
    },
  };
  return { target, sent, listeners };
}

test('app handshake sends no student payload when the helper is absent', async () => {
  const fake = fakeWindow(() => null);
  assert.deepEqual(await sendToNeisHelper(payload(), { targetWindow: fake.target, helloTimeout: 5 }), { sent: false, reason: 'unavailable' });
  assert.equal(fake.sent.length, 1); assert.equal(fake.sent[0].command, 'hello');
  assert.equal(fake.sent[0].payload, undefined); assert.equal(fake.listeners.size, 0);
});

test('app transfer reports receiver acknowledgement and cleans up listeners', async () => {
  const fake = fakeWindow(request => request.command === 'hello' ? { ok: true, available: true } : { ok: true, count: 1 });
  assert.deepEqual(await sendToNeisHelper(payload(), { targetWindow: fake.target }), { sent: true, count: 1 });
  assert.deepEqual(fake.sent[1].payload, payload()); assert.equal(fake.listeners.size, 0);
});

test('a missing queue acknowledgement or rejection is not reported as unavailable or successful', async () => {
  const fake = fakeWindow(request => request.command === 'hello' ? { ok: true, available: true } : null);
  await assert.rejects(sendToNeisHelper(payload(), { targetWindow: fake.target, sendTimeout: 5 }), /수신 확인/);
  const rejected = fakeWindow(request => request.command === 'hello' ? { ok: true, available: true } : { ok: false, error: '날짜 오류' });
  await assert.rejects(sendToNeisHelper(payload(), { targetWindow: rejected.target }), /날짜 오류/);
  assert.equal(fake.listeners.size, 0); assert.equal(rejected.listeners.size, 0);
});

test('extension installation scope remains exact and needs no new broad host permissions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../neis-helper/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, '1.0.3');
  assert.deepEqual(manifest.content_scripts[0].matches, [`${NOTEBOOK_ORIGIN}/*`]);
  assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.deepEqual(manifest.host_permissions, ['https://*.neis.go.kr/*']);
});

test('skipped records retain their error and remain unsaved in persisted queue progress',async()=>{const store=receiver();await store.receive(message(),sender());const id=store.state().rows[0].queueId;const r=await store.receive({type:PANEL_MESSAGE,protocol:1,command:'save',transferId:'request-0001',current:0,progress:{[id]:{fields:[],saved:false,skipError:'출결 구분·교시 불완전'}}},panelSender());assert.equal(r.ok,true);assert.equal(store.state().progress[id].saved,false);assert.equal(store.state().progress[id].skipError,'출결 구분·교시 불완전');});


test('report purpose is retained for app imports and legacy queues default to attendance',async()=>{
 const store=receiver(),request=message();request.payload.workMode='report';
 assert.equal((await store.receive(request,sender())).ok,true);
 assert.equal(store.state().workMode,'report');
 await store.receive(message('request-0002'),sender());
 assert.equal(store.state().workMode,'attendance');
 const imported={type:PANEL_MESSAGE,protocol:1,command:'import',requestId:'file-report-001',payload:{...payload(),workMode:'report'}};
 assert.equal((await store.receive(imported,panelSender())).ok,true);
 assert.equal(store.state().workMode,'report');
});

