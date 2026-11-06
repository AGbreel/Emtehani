import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cairoInputToUtcIso,
  formatCairoDateTime,
  toCairoInputValue,
  CAIRO_TIME_ZONE,
} from '../src/lib/format.js';

test('Africa/Cairo is the reference display timezone', () => {
  assert.equal(CAIRO_TIME_ZONE, 'Africa/Cairo');
});

test('09:00 Cairo in winter (UTC+2) is stored as 07:00 UTC', () => {
  assert.equal(cairoInputToUtcIso('2026-01-15T09:00'), '2026-01-15T07:00:00.000Z');
});

test('09:00 Cairo in summer DST (UTC+3) is stored as 06:00 UTC', () => {
  assert.equal(cairoInputToUtcIso('2026-07-01T09:00'), '2026-07-01T06:00:00.000Z');
});

test('UTC timestamps are displayed back as 09:00 Cairo, not 06:00', () => {
  assert.equal(toCairoInputValue('2026-07-01T06:00:00.000Z'), '2026-07-01T09:00');
  assert.equal(formatCairoDateTime('2026-07-01T06:00:00.000Z'), '2026-07-01 09:00');
  assert.equal(formatCairoDateTime('2026-01-15T07:00:00.000Z'), '2026-01-15 09:00');
});

test('a Cairo wall time survives a store-then-display round trip', () => {
  for (const wallClock of ['2026-03-20T09:00', '2026-07-01T09:00', '2026-10-29T09:00']) {
    assert.equal(toCairoInputValue(cairoInputToUtcIso(wallClock)), wallClock);
  }
});
