import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const INBOX_LIMIT = 60;
export const INBOX_DAYS = 3;
const digest = value => createHash('sha256').update(String(value)).digest('hex');

/** 연동 주소용 키: 계정(owner) + 비밀값. 서버에는 비밀값의 해시만 저장합니다. */
export function makeInboxKey(owner) {
  const secret = randomBytes(24).toString('base64url');
  return { key: `${owner}.${secret}`, tokenHash: digest(secret) };
}
export function parseInboxKey(key) {
  const match = /^([a-f0-9]{16,64})\.([A-Za-z0-9_-]{32})$/.exec(String(key || '').trim());
  return match ? { owner: match[1], secret: match[2] } : null;
}
export function inboxKeyMatches(inbox, secret) {
  if (!inbox?.tokenHash || !secret) return false;
  const a = Buffer.from(inbox.tokenHash), b = Buffer.from(digest(secret));
  return a.length === b.length && timingSafeEqual(a, b);
}
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

/** 문자 전달 앱마다 이름이 달라 흔한 필드명을 모두 받습니다. 전화번호는 뒤 4자리만 남깁니다. */
export function normalizeIncoming(body, now = new Date()) {
  const source = typeof body === 'string' ? { text: body } : body && typeof body === 'object' ? body : {};
  const text = clean(source.text ?? source.message ?? source.body ?? source.msg ?? source.content ?? source.sms, 1000);
  if (!text) return null;
  const from = clean(source.from ?? source.sender ?? source.phone ?? source.number ?? source.address ?? '', 40).replace(/[^0-9+]/g, '');
  const received = clean(source.receivedAt ?? source.receivedStamp ?? source.received ?? source.timestamp ?? source.time ?? source.date ?? '', 40);
  // 전달 앱에 따라 ISO 시각 또는 밀리초 숫자(epoch)로 옵니다.
  const stamp = /^\d{12,14}$/.test(received) ? Number(received) : Date.parse(received);
  const at = Number.isFinite(stamp) && Math.abs(stamp - now.getTime()) < 7 * 864e5 ? new Date(stamp).toISOString() : now.toISOString();
  return { id: randomBytes(9).toString('base64url'), text, from: from ? from.slice(-4) : '', receivedAt: at };
}
/** 오래된 문자와 같은 문자의 중복 전송을 정리합니다. */
export function addIncoming(inbox, item, now = new Date()) {
  const cutoff = now.getTime() - INBOX_DAYS * 864e5;
  const items = inbox.items.filter(entry => Date.parse(entry.receivedAt) >= cutoff);
  if (items.some(entry => entry.text === item.text && entry.from === item.from && Math.abs(Date.parse(entry.receivedAt) - Date.parse(item.receivedAt)) < 10 * 60e3)) return { ...inbox, items };
  return { ...inbox, items: [...items, item].slice(-INBOX_LIMIT) };
}
