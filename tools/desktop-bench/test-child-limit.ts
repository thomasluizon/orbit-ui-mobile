import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { childLimit, runChild } from './child-limit.mjs'

// A cold powershell.exe start on a hosted Windows runner took up to 9965 ms in a passing run and 10088 ms in run 42704572115,
// where the old fixed 10 s limit killed it and the test saw only status null. This child takes 10.5 s, as that start did.
const slowChild = [process.execPath, ['-e', 'setTimeout(() => process.stdout.write("done"), 10500)']] as const

test('a harness child slower than the old 10 s limit finishes under the measured child limit', () => {
  const killed = spawnSync(...slowChild, { encoding: 'utf8', timeout: 10000 })
  assert.equal(killed.status, null, 'the old limit kills the child, as it did in run 42704572115')
  const finished = runChild(...slowChild)
  assert.equal(finished.status, 0, finished.stderr)
  assert.equal(finished.stdout, 'done')
})

test('a harness child that passes the measured limit fails with the limit and its source, never with a bare status null', () => {
  assert.throws(() => runChild(process.execPath, ['-e', 'setTimeout(() => {}, 2000)'], { timeout: 100 }),
    new RegExp(`^Error: ${process.execPath.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')} ran past the 100 ms child limit; ` +
      'the limit is three times the slowest passing harness child of the 30 measured Desktop Installed Acceptance runs$'))
  assert.equal(childLimit, 30000)
})
