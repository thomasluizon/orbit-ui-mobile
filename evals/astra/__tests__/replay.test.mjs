import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { replayAttempt, replayWindow } from '../replay.mjs'
import { readCorpus } from '../grade-method.mjs'
import { recordedGateThirteen } from './fixtures/gate-thirteen.mjs'

const saved = recordedGateThirteen()
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
  // The case holds an outcome, so its recorded tool grade is kept as it was recorded and graded against no expectation.
  const recordedGrade = attempts.find((attempt) => attempt.caseId === 'offers-action-lifecycle-en').assertions.find((assertion) => assertion.metric === 'toolBehavior')
  expect(lifecycle.assertions.find((assertion) => assertion.metric === 'toolBehavior')).toEqual(recordedGrade)
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

it('rejects a replay that drops properties required by the cacheable ask request', async () => {
  const attempt = structuredClone(saved.find((entry) => entry.caseId === 'composition-choice-en'))
  attempt.pass = true
  const call = attempt.toolCalls.find((entry) => entry.name === 'ask')
  delete call.arguments.input.draft_call_id
  delete call.arguments.input.missing_field
  const source = window([attempt])
  await expect(replayWindow(source, `${directory}/output`)).rejects.toThrow('previously passing')
  const audit = JSON.parse(readFileSync(`${directory}/output/replay.json`, 'utf8'))
  expect(audit.results[0].schemas.find((entry) => entry.name === 'ask').reason).toContain('draft_call_id')
})

const gateFourteen = JSON.parse(readFileSync(new URL('./fixtures/gate-fourteen.json', import.meta.url), 'utf8'))

it('reports a redacted recorded argument as a projection limit instead of a regression', async () => {
  const source = window([gateFourteen.find((entry) => entry.caseId === 'offers-dismissal-en')])
  const [verdict] = await replayWindow(source, `${directory}/output`)
  expect(verdict.after).toBe('pass')
  expect(verdict.schemas.find((schema) => !schema.pass)).toMatchObject({ name: 'get_daily_summary', redacted: true })
  expect(readFileSync(`${directory}/output/summary.md`, 'utf8')).toContain('| offers-dismissal-en | pass | pass | unreplayable projection |')
})

it('does not let a redacted value excuse a later schema error on a passing case', async () => {
  const attempt = structuredClone(gateFourteen.find((entry) => entry.caseId === 'offers-dismissal-en'))
  expect(attempt.toolCalls[0].arguments.relative_period).toBe('[redacted]')
  attempt.toolCalls[0].arguments.generate_narrative = 'yes'
  const source = window([attempt])
  await expect(replayWindow(source, `${directory}/output`)).rejects.toThrow('changed a previously passing case')
})

it('fails closed on a redacted value in a field that does not accept null', async () => {
  const attempt = structuredClone(gateFourteen.find((entry) => entry.caseId === 'offers-dismissal-en'))
  attempt.toolCalls[0].arguments.orbit_read_complete = '[redacted]'
  const source = window([attempt])
  await expect(replayWindow(source, `${directory}/output`)).rejects.toThrow('changed a previously passing case')
})

it('still counts an unredacted schema failure on a passing case as a regression', async () => {
  const attempt = structuredClone(gateFourteen.find((entry) => entry.caseId === 'offers-dismissal-en'))
  attempt.toolCalls[0].arguments.relative_period = 'tomorrow'
  const source = window([attempt])
  await expect(replayWindow(source, `${directory}/output`)).rejects.toThrow('changed a previously passing case')
})

it('keeps the recorded tool grades of a case with an outcome and grades its calls against no expectations', async () => {
  const descriptor = readCorpus().find((entry) => entry.metadata.id === 'composition-medical-correction-en')
  const scope = { metric: 'toolBehavior', pass: false, reason: 'Mutation outside the declared operation scope: log_habit' }
  const attempt = { caseId: descriptor.metadata.id, repeat: 1, pass: false, toolCalls: [], assertions: [scope],
    setup: { toolCalls: [{ name: 'bulk_create_habits', arguments: { habits: [] }, resultStatus: 'PendingConfirmation' }] } }
  const result = await replayAttempt(attempt, descriptor, { allAttemptsPass: 'fail' })
  expect(result).toMatchObject({ before: 'fail', after: 'fail', assertions: [scope], notes: [] })
})
