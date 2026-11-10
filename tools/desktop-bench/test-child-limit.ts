import assert from 'node:assert/strict'
import { test } from 'node:test'
import { childLimit, runChild } from './child-limit.mjs'

test('a harness child that passes the measured limit fails with the limit and its source, never with a bare status null', () => {
  assert.throws(() => runChild(process.execPath, ['-e', 'setTimeout(() => {}, 2000)'], { timeout: 100 }),
    new RegExp(`^Error: ${process.execPath.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')} ran past the 100 ms child limit; ` +
      'the limit is three times the slowest passing harness child of the 30 measured Desktop Installed Acceptance runs$'))
  assert.equal(childLimit, 30000)
})
