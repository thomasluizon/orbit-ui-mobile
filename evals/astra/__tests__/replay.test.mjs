import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { replayWindow } from '../replay.mjs'

const saved = JSON.parse(readFileSync(new URL('./fixtures/gate-thirteen.json', import.meta.url), 'utf8'))
let directory
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); vi.unstubAllGlobals() })

function window(attempts) {
  directory = mkdtempSync(join(tmpdir(), 'astra-replay-'))
  mkdirSync(`${directory}/source/attempts`, { recursive: true })
  const cases = attempts.map((attempt) => ({ id: attempt.caseId, allAttemptsPass: attempt.pass ? 'pass' : 'fail' }))
  writeFileSync(`${directory}/source/summary.json`, JSON.stringify({ cases }))
  for (const attempt of attempts) writeFileSync(`${directory}/source/attempts/${attempt.caseId}-r1.json`, JSON.stringify(attempt))
  vi.stubGlobal('fetch', () => { throw new Error('Recorded replay must never make HTTP requests.') })
  return `${directory}/source`
}

it('replays recorded schemas without provider calls or source writes and retains semantic failures', async () => {
  const attempts = saved.filter((attempt) => attempt.caseId.startsWith('composition-choice') || attempt.caseId === 'offers-action-lifecycle-en')
  const source = window(attempts)
  const snapshot = readdirSync(`${source}/attempts`).map((name) => readFileSync(`${source}/attempts/${name}`, 'utf8'))
  const results = await replayWindow(source, `${directory}/output`)
  expect(results.filter((entry) => entry.caseId.startsWith('composition-choice')).every((entry) => entry.after === 'pass')).toBe(true)
  const lifecycle = results.find((entry) => entry.caseId === 'offers-action-lifecycle-en')
  expect(lifecycle.assertions.find((assertion) => assertion.metric === 'toolBehavior').pass).toBe(true)
  expect(lifecycle.assertions.find((assertion) => assertion.metric === 'finalAnswer').pass).toBe(false)
  expect(lifecycle.after).toBe('fail')
  expect(readdirSync(`${source}/attempts`).map((name) => readFileSync(`${source}/attempts/${name}`, 'utf8'))).toEqual(snapshot)
  expect(readFileSync(`${directory}/output/summary.md`, 'utf8')).toContain('not re-executed')
})

it('rejects output inside or above its read-only input', async () => {
  const source = window([])
  await expect(replayWindow(source, source)).rejects.toThrow('read-only')
  await expect(replayWindow(source, `${source}/replay`)).rejects.toThrow('read-only')
  await expect(replayWindow(source, directory)).rejects.toThrow('read-only')
  symlinkSync(source, `${directory}/linked-source`)
  await expect(replayWindow(source, `${directory}/linked-source/output`)).rejects.toThrow('read-only')
})

it('keeps an unavailable response incomplete without inventing refusal or tool evidence', async () => {
  const attempt = saved.find((entry) => entry.httpError)
  const source = window([attempt])
  const [verdict] = await replayWindow(source, `${directory}/output`)
  expect(verdict.after).toBe('incomplete')
  expect(verdict.schemas).toEqual([])
})

it('keeps recorded latency failures after correcting a tool assertion', async () => {
  const source = window([saved.find((entry) => entry.caseId === 'composition-choice-en')])
  writeFileSync(`${source}/summary.json`, JSON.stringify({ cases: [{ id: 'composition-choice-en',
    allAttemptsPass: 'fail', latency: { status: 'fail' } }] }))
  const [verdict] = await replayWindow(source, `${directory}/output`)
  expect(verdict.assertions.every((assertion) => assertion.pass)).toBe(true)
  expect(verdict.after).toBe('fail')
})

it('never turns a formerly passing schema into a pass after an invalid declaration', async () => {
  const attempt = structuredClone(saved.find((entry) => entry.caseId === 'composition-choice-en'))
  attempt.pass = true
  attempt.toolCalls[0].arguments.invented = true
  const source = window([attempt])
  await expect(replayWindow(source, `${directory}/output`)).rejects.toThrow('previously passing')
})

it('removes a false completed-goal pass when the saved main query only read active goals', async () => {
  const attempt = { caseId: 'offers-goal-on-track-completed-en', repeat: 1, pass: true,
    toolCalls: [{ name: 'query_goals', arguments: { status: null, include_completed: false }, resultStatus: 'Succeeded',
      result: { success: true, error: null, payload: {} } }],
    assertions: [{ metric: 'toolBehavior', pass: true, reason: 'No tools required.' }] }
  const source = window([attempt])
  await expect(replayWindow(source, `${directory}/output`)).rejects.toThrow('previously passing')
  const audit = JSON.parse(readFileSync(`${directory}/output/replay.json`, 'utf8'))
  expect(audit.regressions).toHaveLength(1)
  expect(audit.results[0]).toMatchObject({ before: 'pass', after: 'fail' })
  expect(audit.results[0].notes.join(' ')).toContain('An active-only query cannot prove completed-goal exclusion')
})
