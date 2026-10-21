/** 기록 작성 창의 ‘자주 쓰는 내용’: 기본 문구 + 우리 반에서 자주 쓴 사유. */
export const DEFAULT_REASON_SHORTCUTS = Object.freeze(['교외체험학습', '생리통', '감기', '두통', '복통', '병원 진료', '늦잠']);

export function reasonShortcuts(records = [], { defaults = DEFAULT_REASON_SHORTCUTS, limit = 10 } = {}) {
  const counts = new Map();
  for (const record of records) {
    if (!record || !['attendance', 'experience'].includes(record.category)) continue;
    const reason = String(record.reason || '').replace(/\s+/g, ' ').trim();
    if (!reason || reason.length > 20 || /\n/.test(record.reason || '')) continue;
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  const frequent = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([reason]) => reason);
  return [...new Set([...defaults, ...frequent])].slice(0, limit);
}
