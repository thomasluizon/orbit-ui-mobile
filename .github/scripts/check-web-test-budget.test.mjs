import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import yaml from 'js-yaml'
import { readFileSync } from 'node:fs'

const script = new URL('./check-web-test-budget.mjs', import.meta.url)
const workflow = yaml.load(readFileSync(new URL('../workflows/test.yml', import.meta.url), 'utf8'))
const run = (...args) => spawnSync(process.execPath, [script.pathname, ...args], { encoding: 'utf8' })

// WHY: The fixture retains the real Vitest JSON reporter's timing fields; coverage is irrelevant to this gate. https://github.com/thomasluizon/orbit-tickets/issues/1693
const report = (duration) => ({ testResults: [{ assertionResults: [], startTime: 1000, endTime: 1000 + duration, status: 'passed', message: '', name: '/workspace/apps/web/example.test.tsx' }] })

test('enforces the workflow budget using every selected shard report', () => {
  const step = workflow.jobs['unit-tests'].steps.find(step => step.name === 'Enforce web test file budget')
  assert.ok(step)
  const budget = Number(step.run.split(' ').at(-1))
  assert.equal(budget, 260000)
  const directory = mkdtempSync(join(tmpdir(), 'web-test-budget-'))
  try {
    writeFileSync(join(directory, 'chromium-1.json'), JSON.stringify(report(budget)))
    writeFileSync(join(directory, 'jsdom-1.json'), JSON.stringify(report(20)))
    assert.equal(run(directory, String(budget)).status, 0)
    writeFileSync(join(directory, 'chromium-2.json'), JSON.stringify(report(547852.7985839844)))
    const slow = run(directory, String(budget))
    assert.equal(slow.status, 1)
    assert.match(slow.stderr, /example.test.tsx: 547.853s exceeds 260.000s/)
    writeFileSync(join(directory, 'chromium-2.json'), JSON.stringify(report(budget + 1)))
    assert.equal(run(directory, String(budget)).status, 1)
    for (const contents of ['{}', '{', JSON.stringify({ testResults: [] }), JSON.stringify(report(-1)), JSON.stringify({ testResults: [{ name: 'missing timestamps' }] })]) {
      writeFileSync(join(directory, 'chromium-2.json'), contents)
      assert.equal(run(directory, String(budget)).status, 1, contents)
    }
    const empty = join(directory, 'empty')
    mkdirSync(empty)
    assert.equal(run(empty, String(budget)).status, 1)
    assert.equal(run(join(directory, 'missing'), String(budget)).status, 1)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('rejects invalid arguments and documents its CLI', () => {
  for (const args of [[], ['--unknown'], ['reports', 'NaN'], ['reports', '0'], ['reports', '-1'], ['reports', 'Infinity'], ['reports', '1', 'extra']]) {
    assert.equal(run(...args).status, 2)
  }
  assert.equal(run('--help').status, 0)
  assert.match(run('--help').stdout, /usage:/)
})
