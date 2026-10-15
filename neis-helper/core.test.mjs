import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQueue, isNeisUrl } from './core.js';

const source = () => ({ schemaVersion: 1, source: 'teacher-notebook', exportedAt: '2026-10-10T00:00:00Z', rows: [{ recordId: 'sample', category: 'attendance', studentId: '30801', studentName: '예시학생', classNumber: 8, number: 1, date: '2026-11-20', attendanceType: '결석', reasonType: '출석인정', periods: [1, 2], reason: '교외체험학습', note: '' }] });

test('only HTTPS NEIS hostnames are allowed, never lookalike or suffix domains', () => {
  for (const url of ['https://neis.go.kr/', 'https://goe.neis.go.kr/', 'https://sub.goe.neis.go.kr/page']) assert.equal(isNeisUrl(url), true);
  for (const url of ['http://neis.go.kr/', 'https://neis.go.kr.evil.example', 'https://fakeneis.go.kr/', 'https://neis.go.kr@evil.example', 'https://user:pass@neis.go.kr/', 'not-a-url']) assert.equal(isNeisUrl(url), false);
});

test('canonical export becomes a queue with only supported input fields', () => {
  const payload = source(); payload.rows[0].attachment = 'must-not-import'; payload.records = [{ privateSource: 'must-not-import' }];
  const [row] = parseQueue(payload);
  assert.equal(row.periods, '1, 2'); assert.equal(row.classNumber, '8');
  assert.equal(row.studentName, '예시학생'); assert.equal(row.attachment, undefined); assert.equal(row.privateSource, undefined);
});

test('weekday-specific missed periods preserve morning and closing homeroom labels', () => {
  for (const periods of ['4~7교시, 종례', '4~6교시, 종례', '조회, 1~2교시', '조회', '종례']) {
    const payload = source(); payload.rows[0].periods = periods;
    assert.equal(parseQueue(payload)[0].periods, periods);
  }
});

test('invalid dates and missing students reject the entire import', () => {
  for (const date of ['2026-02-30', '2026-13-01', '2026-11-00', '2026-1-1', '', 'tomorrow']) {
    const payload = source(); payload.rows[0].date = date;
    assert.throws(() => parseQueue(payload), /날짜/);
  }
  for (const key of ['recordId', 'studentName']) { const payload = source(); payload.rows[0][key] = ''; assert.throws(() => parseQueue(payload)); }
  const payload = source(); payload.rows[0].studentId = ''; payload.rows[0].number = ''; assert.throws(() => parseQueue(payload), /학번/);
});

test('wrong export source, huge values and malformed row types are rejected', () => {
  assert.throws(() => parseQueue({ ...source(), source: 'unrelated' }));
  assert.throws(() => parseQueue({ ...source(), schemaVersion: 2 }));
  assert.throws(() => parseQueue({ ...source(), rows: [] }));
  for (const bad of [null, [], 'x']) assert.throws(() => parseQueue({ ...source(), rows: [bad] }));
  const payload = source(); payload.rows[0].reason = 'x'.repeat(6001); assert.throws(() => parseQueue(payload));
});

