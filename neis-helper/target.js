(() => {
  if (globalThis.__teacherNotebookTarget) return;
  if (location.protocol !== 'https:' || !(location.hostname === 'neis.go.kr' || location.hostname.endsWith('.neis.go.kr'))) return;
  globalThis.__teacherNotebookTarget = true;
  let selected = null;
  let selectedToken = '';
  let selectedValue = '';
  let selectedPage = '';
  let selectedFramePage = '';
  let stopPicking = null;
  let removeHighlight = null;

  const valueOf = element => element.isContentEditable ? element.textContent : element.value;
  function editable(element) {
    if (!element || element.nodeType !== 1 || !element.isConnected || element.disabled || element.readOnly || element.closest('[inert]')) return false;
    if (!element.getClientRects().length) return false;
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (element.tagName === 'TEXTAREA') return true;
    if (element.tagName === 'INPUT') return ['text', 'search', 'tel', 'email', 'url', 'number', 'date', 'time', 'datetime-local', 'month', 'week'].includes(element.type);
    return element.isContentEditable;
  }
  function editableFrom(element) {
    if (editable(element)) {
      if (element.isContentEditable) {
        while (element.parentElement?.isContentEditable) element = element.parentElement;
      }
      return element;
    }
    return null;
  }
  function description(element) {
    const label = Array.from(element.labels || []).map(node => node.textContent.trim()).join(' ') ||
      element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('name') || element.id || '이름 없는 입력칸';
    return `${element.tagName === 'TEXTAREA' || element.isContentEditable ? '여러 줄 입력칸' : '입력칸'} · ${label.slice(0, 120)}`;
  }
  function clearSelection() {
    stopPicking?.(); stopPicking = null;
    removeHighlight?.(); removeHighlight = null;
    selected = null; selectedToken = ''; selectedValue = ''; selectedPage = ''; selectedFramePage = '';
  }
  function announce(message) {
    chrome.runtime.sendMessage({ type: 'TEACHER_NOTEBOOK_TARGET', ...message }).catch(() => {});
  }
  function highlight(element) {
    const previous = { outline: element.style.outline, offset: element.style.outlineOffset };
    element.style.outline = '3px solid #29866c';
    element.style.outlineOffset = '3px';
    let removed = false;
    removeHighlight = () => {
      if (removed) return;
      removed = true;
      element.style.outline = previous.outline;
      element.style.outlineOffset = previous.offset;
    };
    setTimeout(() => removeHighlight?.(), 6000);
  }
  function documentsWithin(document, result = []) {
    result.push(document);
    for (const frame of document.querySelectorAll('iframe,frame')) {
      try { if (frame.contentDocument) documentsWithin(frame.contentDocument, result); } catch { /* Cross-origin frames are not supported. */ }
    }
    return result;
  }
  function begin() {
    clearSelection();
    const documents = documentsWithin(document);
    const click = event => {
      const element = editableFrom(event.composedPath()[0]);
      if (!element) {
        announce({ error: '실제 글자를 입력하는 칸을 선택해 주세요. 표 셀은 더블 클릭해 편집칸을 연 뒤 다시 선택하세요. 별도 도메인의 프레임은 지원하지 않습니다.' });
        return;
      }
      stopPicking?.(); stopPicking = null;
      selected = element;
      selectedToken = crypto.randomUUID();
      selectedValue = valueOf(element) || '';
      selectedPage = location.href;
      selectedFramePage = element.ownerDocument.defaultView.location.href;
      highlight(element);
      announce({ token: selectedToken, label: description(element), hasValue: Boolean(selectedValue) });
    };
    const key = event => { if (event.key === 'Escape') { clearSelection(); announce({ cancelled: true }); } };
    for (const document of documents) {
      document.addEventListener('click', click, true);
      document.addEventListener('keydown', key, true);
    }
    const timeout = setTimeout(() => { clearSelection(); announce({ error: '입력칸 선택 시간이 지났습니다. ‘입력칸 선택’을 다시 눌러 주세요.' }); }, 45000);
    stopPicking = () => {
      clearTimeout(timeout);
      for (const document of documents) {
        document.removeEventListener('click', click, true);
        document.removeEventListener('keydown', key, true);
      }
    };
    return { ok: true };
  }
  async function fill(message) {
    const element = selected;
    if (!element || !selectedToken || message.token !== selectedToken || !editable(element)) throw new Error('입력칸이 바뀌었습니다. 나이스에서 입력칸을 다시 선택해 주세요.');
    if (location.href !== selectedPage || element.ownerDocument.defaultView.location.href !== selectedFramePage) {
      clearSelection();
      throw new Error('나이스 화면이 이동했습니다. 학생과 날짜를 확인하고 입력칸을 다시 선택해 주세요.');
    }
    if (typeof message.value !== 'string' || message.value.length > 6000 || !message.value.trim()) throw new Error('넣을 값이 올바르지 않습니다.');
    if ((valueOf(element) || '') !== selectedValue) throw new Error('선택한 뒤 입력칸의 내용이 바뀌었습니다. 다시 선택해 주세요.');
    if (selectedValue && !message.replace) throw new Error('기존 내용을 바꾸겠다는 확인이 필요합니다.');
    if (!element.isContentEditable && element.maxLength >= 0 && message.value.length > element.maxLength) throw new Error(`이 입력칸은 ${element.maxLength}자까지 입력할 수 있습니다. 직접 확인해 주세요.`);
    // Browsers silently clear invalid date/number/time values. Check the native
    // conversion on a detached input before touching the teacher's existing value.
    if (element.tagName === 'INPUT') {
      const probe = element.cloneNode(false);
      probe.value = message.value;
      if (probe.value !== message.value) throw new Error('선택한 입력칸의 형식과 값이 맞지 않습니다. 넣을 값과 입력칸을 다시 선택해 주세요.');
    }
    element.focus();
    if (element.isContentEditable) element.textContent = message.value;
    else {
      const view = element.ownerDocument.defaultView;
      const prototype = element.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, message.value);
    }
    const view = element.ownerDocument.defaultView;
    element.dispatchEvent(new view.Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new view.Event('change', { bubbles: true, composed: true }));
    await new Promise(resolve => setTimeout(resolve, 80));
    const matched = element.isConnected && valueOf(element) === message.value;
    clearSelection();
    if (!matched) throw new Error('화면에서 값이 그대로 유지되는지 확인할 수 없습니다. 나이스의 값을 직접 확인하고 필요하면 복사해서 붙여 넣으세요.');
    return { ok: true, message: '입력칸에 값을 넣었습니다. 나이스 저장은 직접 진행해 주세요.' };
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'TEACHER_NOTEBOOK_COMMAND') return false;
    if (message.command === 'begin') { respond(begin()); return false; }
    if (message.command === 'cancel') { clearSelection(); respond({ ok: true }); return false; }
    if (message.command === 'fill') {
      fill(message).then(respond).catch(error => respond({ ok: false, error: error.message }));
      return true;
    }
    return false;
  });
})();

