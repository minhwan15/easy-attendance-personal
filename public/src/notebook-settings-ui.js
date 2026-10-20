import { normalizeExperienceSettings } from './notebook-experience-settings.js';
import { DEFAULT_WEEKDAY_LESSONS, WEEKDAY_LESSON_MIN, WEEKDAY_LESSON_MAX, weekdayLessonsLabel } from './school-timetable.js';
import { warningPhrasesFor } from './notebook-repeat-warning.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAYS = [['1','월'],['2','화'],['3','수'],['4','목'],['5','금']];

/** 반 설정: 요일별 교시 수, 같은 달 반복 경고 문구. 체험학습 설정과 같은 계정 설정으로 저장합니다. */
export function openSettings({ settings, save, onSaved = () => {}, notify = () => {}, demo = false, weekday = true, warning = true }) {
  const title = weekday && !warning ? '요일별 교시 설정' : !weekday && warning ? '경고 문구 설정' : '요일별 교시 · 경고 문구 설정';
  const saved = normalizeExperienceSettings(settings || {});
  const lessons = { ...Object.fromEntries(Object.entries(DEFAULT_WEEKDAY_LESSONS).map(([k, v]) => [String(k), v])), ...(saved.weekdayLessons || {}) };
  let phrases = [...warningPhrasesFor(saved)], busy = false;
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  const options = selected => Array.from({ length: WEEKDAY_LESSON_MAX - WEEKDAY_LESSON_MIN + 1 }, (_, i) => WEEKDAY_LESSON_MIN + i)
    .map(n => `<option value="${n}" ${n === selected ? 'selected' : ''}>${n}</option>`).join('');
  dialog.innerHTML = `<div class="dialog-head"><div><h2 id="settings-title">${title}</h2><p>우리 반 계정의 폰·PC에 함께 적용됩니다.</p></div><button type="button" class="icon-btn" id="settings-close" aria-label="설정 닫기">×</button></div>
    <div class="settings-body">
      ${weekday ? `<section class="settings-section"><h3>요일별 교시 설정</h3><p>지각·조퇴의 빠진 교시 계산과 나이스 입력 도우미에 쓰는 기본 교시 수입니다. 특정 날짜만 다르면 기록에서 ‘실제 수업’을 따로 고르세요.</p>
        <div class="weekday-grid">${DAYS.map(([day, label]) => `<label class="weekday-cell"><span>${label}</span><select data-weekday="${day}" aria-label="${label}요일 교시 수">${options(lessons[day])}</select></label>`).join('')}</div>
        <button type="button" class="text-btn" id="settings-weekday-reset">기본값으로 (${esc(weekdayLessonsLabel(DEFAULT_WEEKDAY_LESSONS))})</button></section>` : ''}
      ${warning ? `<section class="settings-section"><h3>경고 문구 설정</h3><p>사유에 이 문구가 들어간 기록이 <b>같은 학생·같은 달</b>에 이미 있으면 저장 전에 확인 창을 띄웁니다. 예: 생리통은 월 1회만 인정 → 두 번째부터 질병 처리 확인.</p>
        <form class="phrase-form" id="phrase-form"><input id="phrase-input" maxlength="20" placeholder="예: 생리통, 병원" aria-label="경고 문구"><button class="btn primary" type="submit">추가</button></form>
        <div class="phrase-list" id="phrase-list"></div></section>` : ''}
      <p class="form-error" id="settings-error" role="alert"></p>
    </div>
    <div class="dialog-footer"><span class="save-state">${demo ? '예시 모드 · 서버 저장 없음' : '내 계정에 저장'}</span><span class="footer-spacer"></span><button type="button" class="btn" id="settings-cancel">닫기</button><button type="button" class="btn primary" id="settings-save">설정 저장</button></div>`;
  document.body.append(dialog);
  const el = id => dialog.querySelector('#' + id);
  const renderPhrases = () => {
    el('phrase-list').innerHTML = phrases.length ? phrases.map((phrase, i) => `<span class="phrase-chip">${esc(phrase)}<button type="button" data-remove="${i}" aria-label="${esc(phrase)} 삭제">×</button></span>`).join('') : '<span class="phrase-empty">등록한 문구가 없습니다.</span>';
    el('phrase-list').querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { phrases.splice(Number(button.dataset.remove), 1); renderPhrases(); });
  };
  if (warning) renderPhrases();
  if (warning) el('phrase-form').onsubmit = event => {
    event.preventDefault();
    const value = el('phrase-input').value.replace(/\s+/g, ' ').trim();
    el('settings-error').textContent = '';
    if (!value) return;
    if (value.length > 20) { el('settings-error').textContent = '경고 문구는 20자까지 입력할 수 있습니다.'; return; }
    if (phrases.length >= 20) { el('settings-error').textContent = '경고 문구는 20개까지 등록할 수 있습니다.'; return; }
    if (!phrases.includes(value)) phrases.push(value);
    el('phrase-input').value = ''; renderPhrases(); el('phrase-input').focus();
  };
  if (weekday) el('settings-weekday-reset').onclick = () => dialog.querySelectorAll('[data-weekday]').forEach(select => { select.value = String(DEFAULT_WEEKDAY_LESSONS[select.dataset.weekday]); });
  const desired = () => {
    // 열린 항목만 바꾸고 나머지 설정은 저장된 값 그대로 둡니다.
    const next = { ...saved };
    if (warning) next.warningPhrases = phrases;
    if (weekday) next.weekdayLessons = Object.fromEntries([...dialog.querySelectorAll('[data-weekday]')].map(select => [select.dataset.weekday, Number(select.value)]));
    return normalizeExperienceSettings(next);
  };
  const close = () => { if (busy) return; dialog.close(); dialog.remove(); };
  el('settings-close').onclick = close; el('settings-cancel').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  el('settings-save').onclick = async () => {
    if (busy) return;
    if (warning && el('phrase-input').value.trim()) { el('phrase-form').requestSubmit(); }
    try {
      const next = desired(); busy = true; el('settings-save').disabled = true; el('settings-error').textContent = '';
      await save(next, saved);
      busy = false; close(); notify(`${title}을 저장했습니다.`); onSaved();
    } catch (error) {
      busy = false; el('settings-save').disabled = false;
      el('settings-error').textContent = error.status === 409 ? '다른 기기에서 설정이 바뀌었습니다. 창을 닫고 다시 열어 주세요.' : error.message;
    }
  };
  dialog.showModal();
  return dialog;
}
