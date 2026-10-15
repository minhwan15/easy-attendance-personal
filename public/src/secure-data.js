import { parseDataset } from './model.js';

const ITERATIONS = 600000;
const MAX_CIPHERTEXT_BYTES = 3000000;
const AAD = new TextEncoder().encode('homeroom-calendar:v1');
const FORMAT_ERROR = '암호화된 일정 자료 형식이 올바르지 않습니다. 관리자에게 문의하세요.';
const UNLOCK_ERROR = '비밀번호가 맞지 않거나 일정 자료를 열 수 없습니다. 다시 확인해 주세요.';

function decodeBase64(value, minBytes, maxBytes) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 ||
      value.length > Math.ceil(maxBytes / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error(FORMAT_ERROR);
  }
  let binary;
  try { binary = atob(value); } catch { throw new Error(FORMAT_ERROR); }
  if (binary.length < minBytes || binary.length > maxBytes || btoa(binary) !== value) {
    throw new Error(FORMAT_ERROR);
  }
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

/** Validate all untrusted KDF parameters before performing any expensive work. */
export function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM' ||
      envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== ITERATIONS) {
    throw new Error(FORMAT_ERROR);
  }
  decodeBase64(envelope.salt, 16, 16);
  decodeBase64(envelope.iv, 12, 12);
  decodeBase64(envelope.ciphertext, 17, MAX_CIPHERTEXT_BYTES);
  return {
    version: 1, algorithm: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
    salt: envelope.salt, iv: envelope.iv, ciphertext: envelope.ciphertext,
  };
}

/** Unlock only in memory. No password, key, or plaintext is persisted. */
export async function decryptDataset(envelope, password) {
  const validated = validateEnvelope(envelope);
  if (!globalThis.crypto?.subtle) {
    throw new Error('암호화된 자료를 열려면 최신 브라우저에서 HTTPS 주소로 접속해 주세요.');
  }
  if (typeof password !== 'string' || password.length === 0 || password.length > 256) {
    throw new Error(UNLOCK_ERROR);
  }
  const passwordBytes = new TextEncoder().encode(password);
  let plaintext;
  try {
    const material = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
    passwordBytes.fill(0);
    const key = await crypto.subtle.deriveKey({
      name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS,
      salt: decodeBase64(validated.salt, 16, 16),
    }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    plaintext = new Uint8Array(await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: decodeBase64(validated.iv, 12, 12),
      additionalData: AAD, tagLength: 128,
    }, key, decodeBase64(validated.ciphertext, 17, MAX_CIPHERTEXT_BYTES)));
    return parseDataset(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  } catch {
    throw new Error(UNLOCK_ERROR);
  } finally {
    passwordBytes.fill(0);
    plaintext?.fill(0);
  }
}

/** Re-encrypt a validated shared snapshot with a fresh salt and nonce. */
export async function encryptDataset(data, password) {
  parseDataset(data);
  if (!globalThis.crypto?.subtle) throw new Error('암호화 저장 기능을 사용할 수 없습니다.');
  if (typeof password !== 'string' || password.length < 5 || password.length > 256) {
    throw new Error('저장 비밀번호 설정을 확인해 주세요.');
  }
  const passwordBytes = new TextEncoder().encode(password);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  if (plaintext.byteLength + 16 > MAX_CIPHERTEXT_BYTES) {
    passwordBytes.fill(0); plaintext.fill(0);
    throw new Error('일정 자료가 저장 가능한 크기를 초과했습니다.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encode = bytes => {
    let binary = '';
    for (let start = 0; start < bytes.length; start += 8192) {
      binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
    }
    return btoa(binary);
  };
  try {
    const material = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
    passwordBytes.fill(0);
    const key = await crypto.subtle.deriveKey({
      name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt,
    }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
      name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128,
    }, key, plaintext));
    return { version: 1, algorithm: 'AES-256-GCM', kdf: 'PBKDF2-SHA256',
      iterations: ITERATIONS, salt: encode(salt), iv: encode(iv), ciphertext: encode(ciphertext) };
  } finally {
    passwordBytes.fill(0);
    plaintext.fill(0);
  }
}
