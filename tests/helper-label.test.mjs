import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('도우미 다운로드 버튼의 버전이 manifest와 같습니다', async () => {
  const manifest = JSON.parse(await readFile(new URL('../neis-helper/manifest.json', import.meta.url), 'utf8'));
  const guide = await readFile(new URL('../public/src/notebook-neis-guide.js', import.meta.url), 'utf8');
  const label = /나이스 도우미 다운로드 · ([\d.]+) · (\d{4}\.\d{2}\.\d{2}) 업데이트/.exec(guide);
  assert.ok(label, '다운로드 버튼 문구를 찾지 못했습니다.');
  assert.equal(label[1], manifest.version, '도우미 버전을 올리면 다운로드 버튼의 버전·업데이트 날짜도 바꿔 주세요.');
});
