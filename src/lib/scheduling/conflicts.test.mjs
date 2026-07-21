import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasConflict, isSlotFree } from './conflicts.mjs';

const appt = (chair_id, iso, duration_minutes, status = 'scheduled') =>
  ({ chair_id, scheduled_at: iso, duration_minutes, status });

test('overlap same chair conflicts', () => {
  assert.equal(hasConflict(appt('c1','2026-08-01T09:00:00+03:00',45), appt('c1','2026-08-01T09:30:00+03:00',30)), true);
});
test('within 15-min buffer conflicts, both argument orders', () => {
  const a = appt('c1','2026-08-01T09:00:00+03:00',30), b = appt('c1','2026-08-01T09:40:00+03:00',30);
  assert.equal(hasConflict(a,b), true);
  assert.equal(hasConflict(b,a), true);
});
test('exactly at buffer boundary is free', () => {
  assert.equal(hasConflict(appt('c1','2026-08-01T09:00:00+03:00',30), appt('c1','2026-08-01T09:45:00+03:00',30)), false);
});
test('different chair / null chair never conflict', () => {
  assert.equal(hasConflict(appt('c1','2026-08-01T09:00:00+03:00',60), appt('c2','2026-08-01T09:00:00+03:00',60)), false);
  assert.equal(hasConflict(appt(null,'2026-08-01T09:00:00+03:00',60), appt(null,'2026-08-01T09:00:00+03:00',60)), false);
});
test('isSlotFree ignores cancelled and no_show', () => {
  const existing = [appt('c1','2026-08-01T09:00:00+03:00',30,'cancelled'), appt('c1','2026-08-01T09:00:00+03:00',30,'no_show')];
  assert.equal(isSlotFree(appt('c1','2026-08-01T09:10:00+03:00',30), existing), true);
});
