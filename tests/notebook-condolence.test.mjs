import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCondolence } from '../public/src/notebook-condolence.js';
import { morningReasonType, makeMorningRecord } from '../public/src/notebook-morning-model.js';

test('조부모·부모 사망은 5일, 친척은 3일 출석인정', () => {
  for (const t of ['조모상', '조부상', '외할머니 상', '할아버지 돌아가심', '외조부 장례식', '모친상', '부친상'])
    assert.equal(classifyCondolence(t)?.days, 5, t);
  for (const t of ['증조할머니 상', '삼촌 장례', '고모부 별세', '이모 부고', '큰아버지 돌아가심', '외삼촌상'])
    assert.equal(classifyCondolence(t)?.days, 3, t);
});
test('결혼·입양, 경조사 아님', () => {
  assert.equal(classifyCondolence('누나 결혼식')?.days, 1);
  assert.equal(classifyCondolence('입양')?.days, 20);
  for (const t of ['감기', '두통', '병원 진료', '상담', '할머니 댁 방문', '엄마 병원 동행', '상처 치료', '본인 결혼', '엄마가 감기 증상', '동생 상담', '형 상태가 안좋아']) assert.equal(classifyCondolence(t), null, t);
});
test('아침 메모 기본은 질병, 경조사는 출석인정, 명백한 미인정은 유지', () => {
  assert.equal(morningReasonType('감기', '결석'), '질병');
  assert.equal(morningReasonType('아파서', '결석'), '질병');
  assert.equal(morningReasonType('조모상', '결석'), '출석인정');
  assert.equal(morningReasonType('늦잠', '지각'), '미인정');
  assert.equal(morningReasonType('생리통', '결석'), '출석인정');
  const r = makeMorningRecord({ student:{ studentId:'30801', studentName:'예시학생' }, reason:'조부상', attendanceType:'결석', date:'2026-10-27', id:'m-condo' });
  assert.equal(r.reasonType, '출석인정');
  assert.match(r.note, /^\[아침 출결 메모\].*출석인정 5일/);
});

test('경조사 인정 일수는 주말·공휴일·제외 날짜를 빼고, 매일 이어서 물어봅니다', async () => {
  const { schoolDaysFrom, condolenceFollowup, condolenceStart, CONDOLENCE_RETURNED } = await import('../public/src/notebook-condolence.js');
  assert.deepEqual(schoolDaysFrom('2026-10-28', 5), ['2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03']);
  assert.deepEqual(schoolDaysFrom('2026-10-07', 3), ['2026-10-07', '2026-10-08', '2026-10-12'], '10/9 한글날 제외');
  assert.deepEqual(schoolDaysFrom('2026-10-28', 2, ['2026-10-29']), ['2026-10-28', '2026-10-30']);
  const base = { category: 'attendance', attendanceType: '결석', reasonType: '출석인정', reason: '조부상', startDate: '2026-10-28', endDate: '2026-10-28', attendanceDates: [] };
  assert.equal(condolenceStart(base).rule.days, 5);
  assert.equal(condolenceFollowup(base, '2026-10-28'), null, '첫날에는 묻지 않음');
  assert.deepEqual(condolenceFollowup(base, '2026-10-29').pending, ['2026-10-29']);
  assert.deepEqual(condolenceFollowup(base, '2026-10-30').pending, ['2026-10-29', '2026-10-30'], '앱을 못 연 날도 함께');
  const two = { ...base, endDate: '2026-10-29', attendanceDates: ['2026-10-28', '2026-10-29'] };
  assert.deepEqual(condolenceFollowup(two, '2026-11-02').pending, ['2026-10-30', '2026-11-02']);
  const full = { ...base, endDate: '2026-11-03', attendanceDates: schoolDaysFrom('2026-10-28', 5) };
  assert.equal(condolenceFollowup(full, '2026-11-04'), null, '인정 일수를 다 쓰면 끝');
  assert.equal(condolenceFollowup({ ...base, note: CONDOLENCE_RETURNED }, '2026-10-29'), null, '등교하면 더 묻지 않음');
  assert.equal(condolenceFollowup({ ...base, reasonType: '질병' }, '2026-10-29'), null);
  assert.equal(condolenceFollowup({ ...base, reason: '삼촌 장례' }, '2026-11-02').pending.length, 2, '3일 인정');
});
