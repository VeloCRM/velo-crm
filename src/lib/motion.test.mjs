import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatIQD, clampPct, resolveMotion } from './motion.js'

test('formatIQD adds thousands separators, no decimals', () => {
  assert.equal(formatIQD(1500000), '1,500,000')
  assert.equal(formatIQD(0), '0')
  assert.equal(formatIQD(999), '999')
})
test('formatIQD floors fractional input (no decimals ever)', () => {
  assert.equal(formatIQD(1234.9), '1,234')
})
test('clampPct constrains to 0..100', () => {
  assert.equal(clampPct(-5), 0)
  assert.equal(clampPct(50), 50)
  assert.equal(clampPct(150), 100)
})
test('clampPct guards NaN to 0', () => {
  assert.equal(clampPct(NaN), 0)
})
test('resolveMotion returns instant sentinel when reduced', () => {
  assert.deepEqual(resolveMotion(true), { instant: true })
  assert.deepEqual(resolveMotion(false), { instant: false })
})
