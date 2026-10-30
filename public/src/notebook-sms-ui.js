import { suggestFromMessage, recordFromMessage } from './notebook-sms.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = iso => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

async function inboxApi(body) {
  const response = await fetch('/api/notebook-inbox', { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || '문자 받은함에 연결하지 못했습니다.'), { status: response.status });
  return data;
}

const demoItems = today => [
  { id: 'demo-sms-1', from: '5678', receivedAt: `${today}T07:42:00+09:00`, text: '선생님 안녕하세요. 예시학생가 엄마입니다. 아이가 열이 나서 오늘 결석하겠습니다.' },
  { id: 'demo-sms-2', from: '1234', receivedAt: `${today}T07:55:00+09:00`, text: '예시학생나 병원 들렀다가 늦게 등교합니다' },
  { id: 'demo-sms-3', from: '9012', receivedAt: `${today}T08:03:00+09:00`, text: '선생님 오늘 학교 못 갈 것 같아요 감기 때문에요' },
];

const demoDismissed = new Set();
/** 아침 출결 메모 위의 ‘받은 문자’. 선택 기능이며, 켜기 전에는 작은 안내만 보입니다. */
export function mountSmsInbox({ root, demo, students, today, save, notify, onSaved, fillForm, compact = false }) {
  let enabled = demo, items = demo ? demoItems(today).filter(item => !demoDismissed.has(item.id)) : [], url = '', busy = false, loaded = demo;
  const dismiss = async ids => {
    if (demo) { ids.forEach(id => demoDismissed.add(id)); items = items.filter(item => !ids.includes(item.id)); return; }
    const result = await inboxApi({ action: 'dismiss', ids }); items = result.items; enabled = result.enabled;
  };
  function render() {
    if (compact && !items.length) { root.innerHTML = ''; return; }
    const cards = items.slice().sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).map(item => {
      const s = suggestFromMessage(item.text, students, today), f = s.fields;
      const summary = s.student ? `${esc(s.student.studentId)} ${esc(s.student.studentName || s.student.name)} · ${esc(f.reasonType)} ${esc(f.attendanceType)}${f.reason ? ` · ${esc(f.reason)}` : ''}${f.periods ? ` · ${esc(f.periods)}` : ''}` : '학생을 찾지 못했습니다 · 고쳐서 등록하세요';
      return `<article class="sms-card ${s.ready ? '' : 'sms-unsure'}"><div class="sms-meta"><span>${esc(time(item.receivedAt))}</span>${item.from ? `<span>···${esc(item.from)}</span>` : ''}</div><p class="sms-text">${esc(item.text)}</p><p class="sms-guess">→ ${summary}</p><div class="sms-actions"><button type="button" class="btn small primary" data-sms-accept="${esc(item.id)}" ${s.ready ? '' : 'disabled'}>확인 · 등록</button><button type="button" class="btn small" data-sms-edit="${esc(item.id)}">고쳐서 등록</button><button type="button" class="text-btn" data-sms-dismiss="${esc(item.id)}">무시</button></div></article>`;
    }).join('');
    const setup = compact ? '' : demo ? '<p class="sms-help">예시 문자입니다. 실제로 쓰려면 로그인한 뒤 이 자리에 나오는 ‘학부모 문자 자동 연동’을 켜세요.</p>' : `<details class="sms-setup" ${enabled ? '' : ''}><summary>${enabled ? '문자 자동 연동 · 켜짐' : '선택 기능 · 학부모 문자 자동 연동'}</summary>${enabled ? `<p>폰에 받은 학부모 문자가 이 연동 주소로 전달되면 여기에 모입니다. 교사가 확인을 눌러야 기록됩니다.</p>${url ? `<div class="sms-url"><input readonly value="${esc(url)}" aria-label="연동 주소"><button type="button" class="btn small" data-sms-copy>주소 복사</button></div><p class="sms-warn">이 주소는 지금 한 번만 보입니다. 다른 사람에게 알려주지 마세요.</p>` : '<p class="sms-help">주소를 잃어버렸으면 ‘새 주소 만들기’를 누르세요. 예전 주소는 바로 막힙니다.</p>'}${guide()}<div class="sms-actions"><button type="button" class="btn small" data-sms-enable>새 주소 만들기</button><button type="button" class="text-btn" data-sms-disable>연동 끄기</button></div>` : `<p>아침에 온 학부모 문자를 폰이 자동으로 이 앱에 넘겨 주면, ‘받은 문자’에 모아 학생·사유를 미리 채워 둡니다. 선생님은 확인만 누르면 됩니다.</p><p class="sms-help">문자 내용은 반 계정에 암호화해 3일 동안만 보관합니다. 폰에 문자 전달 앱(안드로이드) 또는 단축어(아이폰) 설정이 한 번 필요합니다.</p><button type="button" class="btn small primary" data-sms-enable>연동 켜고 주소 만들기</button>`}</details>`;
    root.innerHTML = `<section class="sms-inbox"${!enabled && !items.length ? ' data-empty' : ''}>${enabled || items.length ? `<div class="sms-head"><h2>받은 문자 <span>${items.length}</span></h2><button type="button" class="text-btn" data-sms-refresh>새로 확인</button></div>${cards || '<p class="sms-empty">새로 온 학부모 문자가 없습니다.</p>'}` : ''}${setup}</section>`;
    bind();
  }
  const guide = () => `<details class="sms-guide"><summary>폰 설정 방법</summary><h4>안드로이드(갤럭시) · 무료</h4><ol><li>무료 오픈소스 앱 <b>SMS to URL Forwarder</b>를 설치합니다. 플레이스토어에는 없고 <b>F-Droid</b>(f-droid.org에서 검색) 또는 개발자 GitHub에서 받습니다. 설치할 때 ‘출처를 알 수 없는 앱 허용’을 한 번 켜야 합니다.</li><li>앱에서 <b>+</b> → 보낸 사람(Sender)에 <b>학부모 번호</b>를 넣거나 <b>*</b>(모든 번호), 필요하면 내용 필터에 결석·지각·조퇴를 넣습니다.</li><li>URL에 위 연동 주소를 붙여넣고, JSON 본문은 <code>{"from":"%from%","text":"%text%","receivedStamp":"%receivedStamp%"}</code>로 둡니다.</li><li>문자 권한을 허용하고, 배터리 최적화에서 이 앱을 ‘제한 없음’으로 두면 잠자는 동안에도 전달됩니다.</li></ol><h4>아이폰</h4><ol><li>단축어 → 자동화 → <b>메시지</b> → 보낸 사람(학부모)·내용 조건 선택 → ‘즉시 실행’.</li><li>동작: <b>URL 콘텐츠 가져오기</b> → 방법 POST, 주소는 연동 주소, 요청 본문 JSON에 <code>text</code>=단축어 입력(메시지), <code>from</code>=보낸 사람.</li></ol><p class="sms-help">카카오톡 메시지는 전달되지 않습니다. 문자(SMS·MMS)만 해당됩니다.</p></details>`;
  function bind() {
    root.querySelectorAll('[data-sms-accept]').forEach(button => button.onclick = async () => {
      if (busy) return; const item = items.find(entry => entry.id === button.dataset.smsAccept); if (!item) return;
      const s = suggestFromMessage(item.text, students, today); if (!s.ready) return;
      busy = true; button.disabled = true;
      try { await save(recordFromMessage(item, s, today), null); await dismiss([item.id]); notify(`${s.student.studentName || s.student.name} ${s.fields.attendanceType} 기록을 등록했습니다.`); onSaved(); }
      catch (error) { notify(error.message); button.disabled = false; }
      finally { busy = false; }
    });
    root.querySelectorAll('[data-sms-edit]').forEach(button => button.onclick = async () => {
      const item = items.find(entry => entry.id === button.dataset.smsEdit); if (!item) return;
      fillForm(suggestFromMessage(item.text, students, today), item);
      try { await dismiss([item.id]); render(); } catch (error) { notify(error.message); }
    });
    root.querySelectorAll('[data-sms-dismiss]').forEach(button => button.onclick = async () => {
      try { await dismiss([button.dataset.smsDismiss]); render(); } catch (error) { notify(error.message); }
    });
    root.querySelector('[data-sms-refresh]')?.addEventListener('click', () => load(true));
    root.querySelector('[data-sms-copy]')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(url); notify('연동 주소를 복사했습니다.'); } catch { notify('복사하지 못했습니다. 주소를 길게 눌러 복사하세요.'); } });
    root.querySelector('[data-sms-enable]')?.addEventListener('click', async () => {
      if (demo) { notify('예시 모드에서는 연동을 켤 수 없습니다.'); return; }
      if (enabled && !confirm('새 연동 주소를 만들까요? 예전 주소로 오는 문자는 더 이상 받지 않습니다.')) return;
      try { const result = await inboxApi({ action: 'enable' }); enabled = result.enabled; items = result.items; url = result.url; render(); root.querySelector('.sms-setup').open = true; }
      catch (error) { notify(error.message); }
    });
    root.querySelector('[data-sms-disable]')?.addEventListener('click', async () => {
      if (!confirm('문자 자동 연동을 끌까요? 받은 문자도 함께 지워집니다.')) return;
      try { const result = await inboxApi({ action: 'disable' }); enabled = result.enabled; items = result.items; url = ''; render(); notify('문자 자동 연동을 껐습니다.'); }
      catch (error) { notify(error.message); }
    });
  }
  async function load(manual = false) {
    if (demo) { render(); return; }
    try { const result = await inboxApi(); enabled = result.enabled; items = result.items; loaded = true; render(); if (manual) notify(items.length ? `받은 문자 ${items.length}건` : '새 문자가 없습니다.'); }
    catch (error) { if (manual || !loaded) { render(); if (manual) notify(error.message); } }
  }
  render(); load();
  return { refresh: () => load(), setStudents: value => { students = value; render(); } };
}
