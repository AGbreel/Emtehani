import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authUserFromResponse,
  formatSessionRemaining,
  getSessionState,
  SESSION_STORAGE_KEY,
  storeSession,
} from '../src/lib/session.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const storage = new MemoryStorage();
globalThis.localStorage = storage;

test('storeSession keeps the fixed server expiry and clock offset', () => {
  storage.clear();
  const realNow = Date.now;
  const fixedClientNow = 1_800_000_000_000;
  Date.now = () => fixedClientNow;
  try {
    const serverNow = new Date(fixedClientNow - 60_000).toISOString();
    const expiresAt = new Date(fixedClientNow + 24 * 60 * 60 * 1000 - 60_000).toISOString();
    storeSession(expiresAt, serverNow);

    const raw = JSON.parse(storage.getItem(SESSION_STORAGE_KEY));
    assert.equal(raw.expiresAtUtc, new Date(expiresAt).toISOString());
    assert.equal(raw.offsetMs, -60_000);

    const state = getSessionState(fixedClientNow);
    assert.equal(state.remainingMs, 24 * 60 * 60 * 1000);
    assert.equal(formatSessionRemaining(state.remainingMs), '24:00:00');
  } finally {
    Date.now = realNow;
  }
});

test('storeSession ignores a missing expiry instead of creating a fake session', () => {
  storage.clear();
  storeSession(null, new Date().toISOString());
  assert.equal(getSessionState(), null);
});

test('getSessionState returns null for corrupted storage', () => {
  storage.clear();
  storage.setItem(SESSION_STORAGE_KEY, '{bad json');
  assert.equal(getSessionState(), null);
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ expiresAtUtc: 'not-a-date' }));
  assert.equal(getSessionState(), null);
});

test('formatSessionRemaining never displays a negative clock', () => {
  assert.equal(formatSessionRemaining(-5000), '00:00');
  assert.equal(formatSessionRemaining(5 * 60 * 1000), '05:00');
  assert.equal(formatSessionRemaining(65 * 1000), '01:05');
  assert.equal(formatSessionRemaining(3_661_000), '01:01:01');
});

test('authUserFromResponse normalizes auth payloads including the legacy id field', () => {
  const fromLogin = authUserFromResponse({
    userId: 'a1',
    fullName: 'سارة أحمد',
    email: 'sara@example.test',
    role: 'Teacher',
    sessionExpiresAtUtc: '2026-11-01T10:00:00Z',
    subscriptionStatus: 'Pending',
    subscriptionPlan: 'free',
  });
  assert.equal(fromLogin.userId, 'a1');
  assert.equal(fromLogin.fullName, 'سارة أحمد');
  assert.equal(fromLogin.subscriptionStatus, 'Pending');
  assert.equal(fromLogin.subscriptionPlan, 'free');

  const fromMe = authUserFromResponse({ id: 'b2', fullName: 'طالب', email: 's@example.test', role: 'Student' });
  assert.equal(fromMe.userId, 'b2');
  assert.equal(fromMe.studentCode, '');
  assert.equal(fromMe.subscriptionStatus, null);
});
