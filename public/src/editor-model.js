import {parseDataset} from './model.js';

const copy = value => structuredClone(value);
const clean = value => typeof value === 'string' ? value.trim() : '';
const recordDataset = event => ({schemaVersion:1,title:'일정 검증',sourceLabel:'담임교사 입력',sourceDate:'2026-01-01',defaultMonth:'2026-01',events:[event]});

/** Compare records without depending on object-key insertion order. */
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(item => canonical(item) ?? 'null').join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function compareEvent(a, b) { return canonical(a) === canonical(b); }

export function buildEditedEvent(values, before = null, nowIso = new Date().toISOString()) {
  const classNumber = Number(values.classNumber);
  const number = Number(values.number);
  if (!Number.isInteger(classNumber) || classNumber < 1 || classNumber > 99 || !Number.isInteger(number) || number < 1 || number > 99) throw new Error('반은 1~99반, 번호는 1~99번으로 입력해 주세요.');
  const dateMode = clean(values.dateMode) || 'single';
  const event = {
    ...(before ? copy(before) : {
      id:'teacher-' + crypto.randomUUID(), sourceType:'teacher',
      sourcePages:[], evidencePages:[], evidence:['담임교사 입력'], issues:[],
    }),
    studentId:'3' + String(classNumber).padStart(2,'0') + String(number).padStart(2,'0'),
    classNumber,
    name:clean(values.name), university:clean(values.university),
    department:clean(values.department) || '미기재', admission:clean(values.admission) || '미기재',
    kind:clean(values.kind) || '미기재', startDate:clean(values.startDate),
    endDate:dateMode === 'single' ? clean(values.startDate) : clean(values.endDate), dateMode,
    note:clean(values.note), updatedBy:clean(values.editor), updatedAt:nowIso,
  };
  // Reuse the same invariants used for imported and decrypted datasets.
  parseDataset(recordDataset(event));
  return event;
}

/** Apply one form submission without mutating the displayed dataset or its records. */
export function applyEventEdit(data, event, before = null) {
  parseDataset(data);
  let events;
  if (before) {
    const existing = data.events.find(item => item.id === before.id);
    if (!existing || !compareEvent(existing,before)) throw new Error('이 일정이 다른 곳에서 변경되었습니다. 최신 내용을 확인한 뒤 다시 수정해 주세요.');
    if (event.id !== before.id) throw new Error('수정 중에는 일정 식별자를 변경할 수 없습니다.');
    events = data.events.map(item => copy(item.id === before.id ? event : item));
  } else {
    if (data.events.some(item => item.id === event.id)) throw new Error('같은 일정 식별자가 이미 있습니다.');
    events = [...data.events.map(copy),copy(event)];
  }
  return parseDataset({...copy(data),events});
}

/**
 * Rebase a saved draft onto the current seed/shared dataset. Deletions are not
 * supported: an omitted record does not remove a record from the current data.
 * A changed record is applied only when the latest record still matches its
 * original base, or when both changes already resulted in the same record.
 */
export function mergeDraft(base, current, saved) {
  parseDataset(base); parseDataset(current); parseDataset(saved);
  const original = new Map(base.events.map(event => [event.id,event]));
  const latest = new Map(current.events.map(event => [event.id,event]));
  let data = copy(current);
  const conflicts = [];
  for (const event of saved.events) {
    const old = original.get(event.id);
    const now = latest.get(event.id);
    if (old && compareEvent(old,event)) continue;
    if (now && compareEvent(now,event)) continue;
    if ((old && !compareEvent(old,now)) || (!old && now)) {
      conflicts.push({id:event.id,reason:old ? '같은 일정이 다른 곳에서 변경되었습니다.' : '같은 식별자의 일정이 이미 있습니다.',base:copy(old ?? null),current:copy(now ?? null),saved:copy(event)});
      continue;
    }
    try {
      data = applyEventEdit(data,event,old ? now : null);
    } catch (error) {
      conflicts.push({id:event.id,reason:error.message,base:copy(old ?? null),current:copy(now ?? null),saved:copy(event)});
    }
  }
  return {data,conflicts};
}
