import test from 'node:test';
import assert from 'node:assert/strict';
import { findRepeatWarnings, needsRepeatCheck, warningPhrasesFor } from '../public/src/notebook-repeat-warning.js';
import { normalizeExperienceSettings } from '../public/src/notebook-experience-settings.js';
import { parseRosterText } from '../public/src/notebook-roster.js';

const rec = (id, startDate, reason, extra = {}) => ({ id, category: 'attendance', studentId: '30801', studentName: '김가가', startDate, endDate: startDate, attendanceDates: [], attendanceType: '결석', reasonType: '출석인정', reason, ...extra });

test('same student, same month, same phrase warns; other month or student does not', () => {
  const records = [rec('a', '2026-10-02', '생리통으로 결석'), rec('b', '2026-09-28', '생리통'), rec('c', '2026-10-05', '생리통', { studentId: '30802' })];
  const warnings = findRepeatWarnings({ record: rec('new', '2026-10-20', '생리 통 심함'), records, phrases: ['생리통'] });
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0].matches.map(r => r.id), ['a']);
  assert.deepEqual(findRepeatWarnings({ record: rec('new', '2026-11-03', '생리통'), records, phrases: ['생리통'] }), []);
  assert.deepEqual(findRepeatWarnings({ record: rec('new', '2026-10-20', '감기'), records, phrases: ['생리통'] }), []);
  assert.deepEqual(findRepeatWarnings({ record: rec('a', '2026-10-02', '생리통으로 결석'), records, phrases: ['생리통'] }), [], 'a record never matches itself');
});

test('unchanged re-saves skip the repeat check; no default phrase in the personal edition', () => {
  const before = rec('a', '2026-10-02', '생리통');
  assert.equal(needsRepeatCheck({ ...before, periods: '1교시' }, before), false);
  assert.equal(needsRepeatCheck({ ...before, reason: '생리통 심함' }, before), true);
  assert.deepEqual(warningPhrasesFor(normalizeExperienceSettings({})), []);
  assert.deepEqual(warningPhrasesFor(normalizeExperienceSettings({ warningPhrases: [] })), []);
});

test('settings keep optional keys absent and validate new ones', () => {
  assert.deepEqual(normalizeExperienceSettings({ blockedDates: [], baselineDays: {} }), { blockedDates: [], baselineDays: {} });
  const saved = normalizeExperienceSettings({ warningPhrases: [' 생리통 ', '생리통', '병원'], weekdayLessons: { 1: 7, 2: 6, 3: 6, 4: 6, 5: 8 } });
  assert.deepEqual(saved.warningPhrases, ['생리통', '병원']);
  assert.deepEqual(saved.weekdayLessons, { 1: 7, 2: 6, 3: 6, 4: 6, 5: 8 });
  assert.throws(() => normalizeExperienceSettings({ weekdayLessons: { 1: 9, 2: 6, 3: 6, 4: 6, 5: 7 } }));
  assert.throws(() => normalizeExperienceSettings({ warningPhrases: ['가'.repeat(21)] }));
});

test('NEIS 명렬표 CSV with title rows and number/name/gender columns', () => {
  const csv = '﻿2026학년도 명렬표,,,\n학년도: 2026  학년: 3  반: 8,,,\n번호,성명,성별,비고\n1,김가가,남,\n2,이나나,여,\n';
  const result = parseRosterText(csv, {});
  assert.deepEqual(result.students.map(s => [s.studentId, s.studentName]), [['30801', '김가가'], ['30802', '이나나']]);
  assert.deepEqual(result.unparsedLines, []);
});
