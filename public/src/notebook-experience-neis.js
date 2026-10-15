import { normalizeRecord, readiness, toNeisRows, exportCsv } from './notebook-model.js';
import { sendToNeisHelper } from './notebook-neis-bridge.js';
import { neisGuideHtml } from './notebook-neis-guide.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Select explicit grid days without changing the saved application or completion state. */
export function prepareExperienceNeis({ records = [], datesByRecord = {}, blockedDates = [], allPending = false }) {
  const selected = [], blocked = new Set(blockedDates);
  for (const input of records) {
    const dates = [...new Set(allPending ? input.attendanceDates || [] : datesByRecord[input.id] || [])].filter(date=>!(input.neisConfirmedDates||[]).includes(date)).sort();
    if (!dates.length) continue;
    const record = normalizeRecord(input);
    if (record.category !== 'experience') throw new Error('체험학습 기록만 선택해 주세요.');
    if (dates.some(date => !record.attendanceDates.includes(date))) throw new Error('저장된 출결 날짜를 선택해 주세요.');
    if (dates.some(date => blocked.has(date))) throw new Error('체험학습 제외 날짜가 선택되어 있습니다.');
    if (record.entryStatus === 'confirmed') continue;
    const ready = readiness(record);
    if (!ready.ready && allPending) continue;
    if (!ready.ready) throw new Error(`${record.studentName}: ${ready.errors[0]}`);
    selected.push(normalizeRecord({ ...record, attendanceDates: dates, neisConfirmedDates: [],
      experienceDayStatuses: Object.fromEntries(Object.entries(record.experienceDayStatuses || {}).filter(([date]) => dates.includes(date))) }));
  }
  if (!selected.length) throw new Error('나이스에 입력할 날짜를 선택해 주세요. 이미 저장 확인한 기록은 제외됩니다.');
  const rows = toNeisRows(selected);
  if(!rows.length)throw new Error('나이스에 새로 입력할 날짜가 없습니다. 저장 확인한 날짜는 제외됩니다.');
  if (rows.length > 2000) throw new Error('한 번에 2,000일 이하로 나누어 보내 주세요.');
  return { records: selected, rows, payload: { schemaVersion: 1, source: 'teacher-notebook', exportedAt: new Date().toISOString(), rows } };
}

export function openExperienceNeis(options) {
  const prepared = prepareExperienceNeis(options);
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog experience-neis-dialog';
  dialog.setAttribute('aria-labelledby', 'experience-neis-title');
  const students = new Set(prepared.rows.map(row => row.studentId)).size;
  dialog.innerHTML = `<div class="dialog-head"><div><h2 id="experience-neis-title">체험학습 → 나이스</h2><p>학생 ${students}명 · 선택한 출결일 ${prepared.rows.length}건</p></div><button type="button" class="icon-btn" data-neis-close aria-label="나이스 입력 자료 닫기">×</button></div>
    <div class="experience-neis-body"><div class="experience-neis-table"><table><thead><tr><th>날짜</th><th>학생</th><th>출결</th><th>입력 내용</th></tr></thead><tbody>${prepared.rows.map(row => `<tr><td>${esc(row.date)}</td><td>${esc(row.studentId)} ${esc(row.studentName)}</td><td>${esc(row.reasonType)} ${esc(row.attendanceType)}</td><td>${esc(row.reason)}</td></tr>`).join('')}</tbody></table></div>
    <p class="helper-note">‘선택한 기록 보내기’를 누르면 설치한 나이스 도우미로 전달됩니다. 나이스 일일출결관리를 열어 두고 도우미에서 자동 입력하세요. 저장 확인한 날짜는 다음 전송에서 제외됩니다.</p><p class="form-error" data-neis-error role="alert"></p><p data-neis-status role="status"></p>
    ${neisGuideHtml({experience:true})}</div>
    <footer class="dialog-footer neis-dialog-actions"><details class="neis-other-methods" data-neis-other><summary>다른 방법 · 복사 또는 파일 저장</summary><div class="neis-alternative-actions"><div><button class="btn" type="button" data-neis-copy>붙여넣을 내용 복사</button><p>나이스 입력칸에 직접 붙여 넣을 때</p></div><div><button class="btn" type="button" data-neis-csv>엑셀로 확인할 파일 저장</button><p>내용을 표로 확인하는 CSV 파일</p></div><div><button class="btn" type="button" data-neis-json>도우미에서 불러올 파일 저장</button><p>도우미의 ‘나이스 입력용 JSON 열기’에서 불러옵니다.</p></div></div></details><button class="btn primary" type="button" data-neis-send>선택한 기록 보내기</button></footer>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelector('[data-neis-close]').onclick = () => dialog.close();
  const error = dialog.querySelector('[data-neis-error]'), status = dialog.querySelector('[data-neis-status]');
  const download = (content, extension, mime) => {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement('a'); link.href = url; link.download = `체험학습_나이스.${extension}`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  dialog.querySelector('[data-neis-copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(prepared.rows.map(row => [row.date, row.studentId, row.studentName, row.attendanceType, row.reasonType, row.reason].join('\t')).join('\n')); error.textContent = ''; status.textContent = '선택한 날짜의 입력 내용을 복사했습니다.'; }
    catch { error.textContent = '복사 권한을 확인하거나 CSV 저장을 이용해 주세요.'; }
  };
  dialog.querySelector('[data-neis-csv]').onclick = () => { download(exportCsv(prepared.records), 'csv', 'text/csv;charset=utf-8'); status.textContent = 'CSV를 저장했습니다.'; };
  dialog.querySelector('[data-neis-json]').onclick = () => { download(JSON.stringify(prepared.payload, null, 2), 'json', 'application/json'); status.textContent = '파일을 저장했습니다. 나이스 도우미 패널의 나이스 입력용 JSON 열기에서 불러오세요.'; };
  dialog.querySelector('[data-neis-send]').onclick = async event => {
    const button = event.currentTarget; button.disabled = true; button.textContent = '전달 중…'; error.textContent = ''; status.textContent = '';
    try {
      const result = await sendToNeisHelper(prepared.payload);
      if (result.sent) status.textContent = `${prepared.rows.length}건을 도우미에 전달했습니다. PC의 나이스 탭에서 도우미를 열어 주세요.`;
      else { status.textContent = '도우미와 연결되지 않았습니다. PC Chrome에서 도우미를 켜고 기록함을 새로고침하세요. 파일로 옮기려면 다른 방법을 펼치세요.'; dialog.querySelector('[data-neis-other]').open = true; }
    } catch (problem) { error.textContent = problem.message; }
    finally { button.disabled = false; button.textContent = '선택한 기록 보내기'; }
  };
  dialog.showModal();
  return dialog;
}
