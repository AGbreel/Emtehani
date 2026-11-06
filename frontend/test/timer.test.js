import test from 'node:test';
import assert from 'node:assert/strict';
import {
  remainingSecondsFromDeadline,
  serverClockOffset,
  serverNow,
} from '../src/lib/timer.js';

test('remaining time is derived from the absolute deadline', () => {
  const deadline = '2026-07-01T10:00:00.000Z';
  const clientNow = Date.parse('2026-07-01T09:00:00.000Z');
  assert.equal(remainingSecondsFromDeadline(deadline, 0, clientNow), 3600);
  assert.equal(remainingSecondsFromDeadline(deadline, 0, clientNow + 1_000), 3599);
  assert.equal(remainingSecondsFromDeadline(deadline, 0, clientNow + 3_594_000), 6);
  assert.equal(remainingSecondsFromDeadline(deadline, 0, clientNow + 3_600_000), 0);
  assert.equal(remainingSecondsFromDeadline(deadline, 0, clientNow + 9_000_000), 0);
});

test('a skewed client clock is corrected by the server offset', () => {
  const receivedAt = Date.parse('2026-07-01T09:00:00.000Z');
  // Server says it is 09:05 while the browser clock says 09:00.
  const offset = serverClockOffset('2026-07-01T09:05:00.000Z', receivedAt);
  assert.equal(offset, 300_000);
  assert.equal(serverNow(offset, receivedAt), receivedAt + 300_000);
  assert.equal(
    remainingSecondsFromDeadline('2026-07-01T10:00:00.000Z', offset, receivedAt),
    3300,
  );
});

test('repeated reads never rewind or fast-forward the countdown', () => {
  const deadline = '2026-07-01T10:00:00.000Z';
  let clientNow = Date.parse('2026-07-01T09:59:00.000Z');
  let previous = remainingSecondsFromDeadline(deadline, 0, clientNow);
  for (let tick = 0; tick < 120; tick++) {
    clientNow += 1_000;
    const next = remainingSecondsFromDeadline(deadline, 0, clientNow);
    assert.equal(next, Math.max(0, previous - 1));
    previous = next;
  }
  assert.equal(previous, 0);
});
