import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('settings timetable accepts HH:MM period times', async () => {
  const source = await readFile(new URL('../public/src/personal-ui.js', import.meta.url), 'utf8');
  const line = /const toMinutes=v=>(\/.+?\/)\.test\(v\)/.exec(source);
  assert.ok(line, 'toMinutes validator exists');
  const pattern = new Function(`return ${line[1]}`)();
  for (const ok of ['09:10', '00:00', '13:50', '23:59']) assert.equal(pattern.test(ok), true, ok);
  for (const bad of ['9:10', '24:00', '12:60', '\\d\\d:\\d\\d', '']) assert.equal(pattern.test(bad), false, bad);
});
