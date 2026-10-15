import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyRecord, exportCsv } from '../public/src/notebook-model.js';
import { prepareExperienceNeis } from '../public/src/notebook-experience-neis.js';

const dates = ['2026-11-20', '2026-11-23', '2026-11-24'];
const trip = (overrides = {}) => ({ ...emptyRecord(), id: 'trip-one', category: 'experience',
  studentId: '30801', studentName: '가상학생', startDate: dates[0], endDate: dates.at(-1),
  attendanceDates: [...dates], attendanceType: '결석', reasonType: '출석인정', reason: '교외체험학습',
  applicationStatus: 'received', approvalStatus: 'approved', reviewStatus: 'reviewed',
  experienceDayStatuses: { [dates[0]]: 'report', [dates[1]]: 'application', [dates[2]]: 'application' },
  ...overrides });

test('selected-day NEIS preparation narrows JSON and CSV to exactly the chosen cells', () => {
  const original = trip({ sourceText: '학부모 원문', note: '비공개 참고 메모' });
  const snapshot = structuredClone(original);
  const result = prepareExperienceNeis({ records: [original], datesByRecord: { 'trip-one': [dates[2], dates[0], dates[2]] } });
  assert.deepEqual(result.rows.map(row => row.date), [dates[0], dates[2]]);
  assert.deepEqual(result.records[0].attendanceDates, [dates[0], dates[2]]);
  assert.deepEqual(result.records[0].experienceDayStatuses, { [dates[0]]: 'report', [dates[2]]: 'application' });
  assert.equal(result.records[0].startDate, original.startDate);
  assert.equal(result.records[0].endDate, original.endDate);
  assert.equal(result.payload.rows, result.rows);
  assert.equal(result.payload.schemaVersion, 1);
  assert.equal(result.payload.source, 'teacher-notebook');
  const csv = exportCsv(result.records);
  assert(!csv.includes(dates[1]));
  assert(!JSON.stringify(result.payload).includes(original.sourceText));
  assert(!JSON.stringify(result.payload).includes(original.note));
  assert.deepEqual(original, snapshot);
  result.records[0].attendanceDates.push('2026-11-25');
  result.records[0].experienceDayStatuses[dates[0]] = 'application';
  assert.deepEqual(original, snapshot);
});

test('unselected records are ignored and confirmed records are excluded without changing status', () => {
  const original = trip();
  const confirmed = trip({ id: 'confirmed', studentId: '30802', entryStatus: 'confirmed' });
  const result = prepareExperienceNeis({ records: [trip({ id: 'unselected', approvalStatus: 'pending' }), original, confirmed],
    datesByRecord: { 'trip-one': [dates[1]], confirmed: [dates[0]] } });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].recordId, original.id);
  assert.equal(original.entryStatus, 'pending');
  assert.equal(confirmed.entryStatus, 'confirmed');
  assert.throws(() => prepareExperienceNeis({ records: [confirmed], datesByRecord: { confirmed: [dates[0]] } }), /이미 나이스 입력 완료/);
});

test('unapproved or incomplete selected records cannot reach the NEIS queue', () => {
  for (const overrides of [{ approvalStatus: 'pending' }, { approvalStatus: 'cancelled' },
    { applicationStatus: 'missing' }, { reviewStatus: 'draft' }, { reason: '' }]) {
    assert.throws(() => prepareExperienceNeis({ records: [trip(overrides)], datesByRecord: { 'trip-one': [dates[0]] } }));
  }
});

test('selection rejects range filler days, excluded days and non-experience records', () => {
  assert.throws(() => prepareExperienceNeis({ records: [trip()], datesByRecord: { 'trip-one': ['2026-11-21'] } }), /저장된 출결 날짜/);
  assert.throws(() => prepareExperienceNeis({ records: [trip()], datesByRecord: { 'trip-one': [dates[0]] }, blockedDates: [dates[0]] }), /제외 날짜/);
  assert.throws(() => prepareExperienceNeis({ records: [trip({ category: 'attendance', experienceDayStatuses: {} })], datesByRecord: { 'trip-one': [dates[0]] } }), /체험학습 기록만/);
  assert.throws(() => prepareExperienceNeis({ records: [trip()], datesByRecord: {} }), /학생 행과 날짜 열이 만나는 칸을 선택/);
});

test('incompatible attendance for one selected student-day is rejected before sending', () => {
  const second = trip({ id: 'trip-two', reason: '다른 체험학습 사유' });
  assert.throws(() => prepareExperienceNeis({ records: [trip(), second], datesByRecord: { 'trip-one': [dates[0]], 'trip-two': [dates[0]] } }), /중복되거나 다릅니다/);
});

test('multiple students preserve stable date then student order and never add intervening dates', () => {
  const result = prepareExperienceNeis({ records: [trip({ id: 'trip-two', studentId: '30802' }), trip()],
    datesByRecord: { 'trip-one': [dates[2], dates[0]], 'trip-two': [dates[2], dates[0]] } });
  assert.deepEqual(result.rows.map(({ date, studentId }) => [date, studentId]),
    [[dates[0], '30801'], [dates[0], '30802'], [dates[2], '30801'], [dates[2], '30802']]);
  assert(!result.rows.some(row => ['2026-11-21', '2026-11-22', dates[1]].includes(row.date)));
});

test('all pending sends multiple students and dates excluding confirmed days and unapproved applications',()=>{
  const first=trip({neisConfirmedDates:[dates[0]]});
  const second=trip({id:'two',studentId:'30802'});
  const result=prepareExperienceNeis({records:[first,second,trip({id:'draft',studentId:'30803',approvalStatus:'pending'})],allPending:true});
  assert.equal(result.rows.length,5);
  assert(!result.rows.some(r=>r.studentId==='30801'&&r.date===dates[0]));
  assert(!result.rows.some(r=>r.studentId==='30803'));
  assert.throws(()=>prepareExperienceNeis({records:[trip({neisConfirmedDates:dates})],allPending:true}),/모든 체험학습 날짜가 이미 나이스 입력 완료 상태/);
});
