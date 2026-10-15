import { withAttendanceMeetings } from './notebook-model.js';

const DEFAULT_LOGO = new URL('/favicon.svg',import.meta.url).href;
const PRINT_CSS = new URL('./notebook-pass-print.css', import.meta.url).href;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
let activePrint = null;

function logoAddress(value) {
  const url = new URL(value || DEFAULT_LOGO, DEFAULT_LOGO);
  if (!['https:', 'http:', 'file:'].includes(url.protocol)) throw new Error('학교 마크의 주소를 확인해 주세요.');
  return url.href;
}

export function passSerial(record) {
  if (!record?.id) return '저장 후 발급';
  let hash = 2166136261;
  for (const char of String(record.id)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return `${String(record.startDate || '').replace(/-/g, '')}-${hash.toString(36).toUpperCase().padStart(7, '0')}`;
}

function koreanDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return match ? `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일` : '날짜 입력';
}

// Used by both the on-screen preview and the print sheet. Only these explicit
// permit fields are rendered; original messages, files and teacher notes stay out.
export function renderPassHtml(record = {}, options = {}) {
  const outing = record.passKind !== 'early';
  const title = outing ? '외출증' : '조퇴증';
  const action = outing ? '외출' : '조퇴';
  const id = String(record.studentId || '');
  const validId = /^[1-3]\d{4}$/.test(id);
  const grade = validId ? id[0] : '—';
  const classNumber = record.classNumber || (validId ? Number(id.slice(1, 3)) : '—');
  const number = record.number || (validId ? Number(id.slice(3)) : '—');
  const schoolName = options.schoolName || globalThis.easyProfile?.schoolName || '우리 학교';
  const logo = logoAddress(options.logoUrl);
  const periods=withAttendanceMeetings(record.periods,outing?record.attendanceType:'조퇴',{date:record.startDate,lessonCount:record.lessonCount});
  return `<section class="pass-document" aria-label="${title} 출력 미리보기">
    <header class="pass-paper-header">
      <div class="pass-school"><span>${escapeHtml(schoolName)}</span></div>
      <span class="pass-serial">발급번호 ${escapeHtml(passSerial(record))}</span>
    </header>
    <h2 class="pass-paper-title">${title}</h2>
    <div class="pass-student-line"><strong>${escapeHtml(record.studentName || '학생 이름')}</strong><span>${escapeHtml(grade)}학년 ${escapeHtml(classNumber)}반 ${escapeHtml(number)}번</span></div>
    <dl class="pass-paper-fields">
      <div><dt>${action}일</dt><dd>${escapeHtml(koreanDate(record.startDate))}</dd></div>
      <div><dt>${outing ? '외출 시간' : '조퇴 시간'}</dt><dd><strong>${escapeHtml(record.departureTime || '—')}</strong>${outing ? `<span class="pass-time-divider">~</span><strong>${escapeHtml(record.returnTime || '미정')}</strong><span class="pass-return-label">(귀교 예정)</span>` : ''}</dd></div>
      ${periods ? `<div><dt>빠지는 교시</dt><dd>${escapeHtml(periods)}</dd></div>` : ''}
      <div class="pass-reason-row"><dt>사유</dt><dd>${escapeHtml(record.reason || '—')}</dd></div>
    </dl>
    <p class="pass-permission">위 학생의 ${action}을 담임교사 확인 후 허가합니다.</p>
    <footer class="pass-paper-footer"><span class="pass-teacher">담임교사 <strong>${escapeHtml(record.teacherName || '________________')}</strong></span><span class="pass-signature">서명 <span aria-label="서명란"></span></span></footer>
  </section>`;
}

function loadPrintStyles() {
  const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find(link => link.href === PRINT_CSS);
  if (existing?.sheet) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = existing || document.createElement('link');
    const timeout = setTimeout(() => finish(new Error('출력 화면을 불러오지 못했습니다. 다시 출력해 주세요.')), 10000);
    const finish = error => {
      clearTimeout(timeout);
      link.removeEventListener('load', onLoad);
      link.removeEventListener('error', onError);
      if (error) reject(error); else resolve();
    };
    const onLoad = () => finish();
    const onError = () => finish(new Error('출력 화면을 불러오지 못했습니다. 다시 출력해 주세요.'));
    link.addEventListener('load', onLoad, { once:true });
    link.addEventListener('error', onError, { once:true });
    if (!existing) { link.rel = 'stylesheet'; link.href = PRINT_CSS; document.head.append(link); }
  });
}

function loadLogo(img) {
  if (img.complete) return img.naturalWidth ? Promise.resolve() : Promise.reject(new Error('학교 마크를 불러오지 못했습니다. 저장된 기록에서 다시 출력해 주세요.'));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('학교 마크를 불러오지 못했습니다. 저장된 기록에서 다시 출력해 주세요.')), 10000);
    const finish = error => {
      clearTimeout(timeout);
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
      if (error) reject(error); else resolve();
    };
    const onLoad = () => finish();
    const onError = () => finish(new Error('학교 마크를 불러오지 못했습니다. 저장된 기록에서 다시 출력해 주세요.'));
    img.addEventListener('load', onLoad, { once:true });
    img.addEventListener('error', onError, { once:true });
  });
}

// Call only after persistence succeeds. The resolved result means a browser
// print request was made; browsers do not report physical printing or cancellation.
export async function printPass(record, options = {}) {
  if (!record?.id || !record.passIssuedAt || !['outing', 'early'].includes(record.passKind)) throw new Error('먼저 외출·조퇴증을 저장해 주세요.');
  if (typeof window === 'undefined' || typeof window.print !== 'function') throw new Error('이 브라우저에서 출력을 지원하지 않습니다. PC에서 저장된 기록을 열어 주세요.');
  activePrint?.();
  const area = document.createElement('div');
  area.id = 'pass-print-area';
  area.setAttribute('aria-hidden', 'true');
  area.innerHTML = renderPassHtml(record, options);
  document.body.append(area);
  const focused = document.activeElement;
  const media = window.matchMedia?.('print');
  let enteredPrint = false;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove('printing-pass');
    area.remove();
    window.removeEventListener('afterprint', cleanup);
    media?.removeEventListener?.('change', onMediaChange);
    if (activePrint === cleanup) activePrint = null;
    if (focused?.isConnected && typeof focused.focus === 'function') focused.focus({ preventScroll:true });
  };
  const onMediaChange = event => {
    if (event.matches) enteredPrint = true;
    else if (enteredPrint) cleanup();
  };
  activePrint = cleanup;
  try {
    await Promise.all([loadPrintStyles(), document.fonts?.ready || Promise.resolve()]);
    if (cleaned) throw new Error('출력 요청이 변경되었습니다. 다시 출력해 주세요.');
    window.addEventListener('afterprint', cleanup, { once:true });
    media?.addEventListener?.('change', onMediaChange);
    document.body.classList.add('printing-pass');
    window.print();
    return { requested:true };
  } catch (error) {
    cleanup();
    throw error;
  }
}

export const printLeavePass = printPass;
