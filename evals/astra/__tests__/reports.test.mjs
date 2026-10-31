import { expect, it } from 'vitest'
import { mergeReportFiles, mergeReports } from '../merge-reports.mjs'
import { summarize, writeReport, writeResults } from '../report.mjs'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import parseResponse from '../response.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'
const descriptors = [{ id: 'english', family: 'habits', locale: 'en' }, { id: 'portuguese', family: 'habits', locale: 'pt-BR' }]
const window = (index, overrides = {}) => ({ k: 3, cases: [{ ...descriptors[index], attempts: 3, passed: 3, skipped: 0, unavailable: 0, missingComposition: 0, pass3: 'pass', ...overrides }] })
it('writes private evidence without catalog-marked secrets or injected credential fields', () => {
  const call = toolCall('manage_account', { action: 'confirm_deletion' })
  Object.assign(call.arguments, { code: 'private-code-value', token: 'private-token-value', cookie: 'private-cookie-value',
    refreshToken: 'private-refresh-value', accountId: 'private-account-value', email: 'private@example.invalid' })
  const output = parseResponse(chatResponse('request', [call]), '', { response: {
    status: 200, headers: { 'x-orbit-request-id': 'request' },
  } })
  output.answer = 'Water is ready.'
  const directory = mkdtempSync(join(tmpdir(), 'astra-private-evidence-'))
  try {
    writeResults([{ testCase: { metadata: { id: 'private-evidence' } }, response: { output }, success: true }], directory)
    const contents = readFileSync(join(directory, 'attempts/private-evidence-r1.json'), 'utf8')
    expect(JSON.parse(contents)).toMatchObject({ answer: 'Water is ready.', toolCalls: [{
      name: 'manage_account', arguments: { action: 'confirm_deletion' }, resultStatus: 'Succeeded',
    }] })
    expect(contents).not.toMatch(/private-(?:code|token|cookie|refresh|account)-value|private@example\.invalid/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
it('merges disjoint windows against the entire corpus without hiding missing families', () => {
  expect(mergeReports([window(0)], descriptors).status).toBe('incomplete')
  const merged = mergeReports([window(0), window(1)], descriptors)
  expect(merged.status).toBe('pass')
  expect(merged.groups).toHaveLength(2)
  expect(mergeReports([window(0), window(1, { pass3: 'fail', passed: 2 })], descriptors).status).toBe('fail')
})
it.each([{ skipped: 1 }, { unavailable: 1 }, { missingComposition: 1 }, { attempts: 2 }, { passed: 2 }])('rejects an unsupported pass: %j', (overrides) => {
  expect(() => mergeReports([window(0, overrides)], descriptors)).toThrow()
})
it('rejects repeated, foreign, mislabeled and overcounted cases', () => {
  for (const windows of [[window(0), window(0)], [window(0, { id: 'unknown' })], [window(0, { family: 'other' })], [window(0, { attempts: 4 })]]) {
    expect(() => mergeReports(windows, descriptors)).toThrow()
  }
})

const result = (index, success = true) => ({ testCase: { metadata: descriptors[index] }, success,
  gradingResult: { componentResults: [{ assertion: { metric: 'composition' }, pass: true }] } })
const completed = (index, success = true) => Array.from({ length: 3 }, () => result(index, success))

it.each([0, 1])('continues an interrupted window with %i attempts without losing completed cases', (attempts) => {
  const first = summarize([...completed(0), ...Array.from({ length: attempts }, () => result(1))], descriptors)
  const continuation = summarize(completed(1), [descriptors[1]])
  const merged = mergeReports([first, continuation], descriptors)
  expect(merged.status).toBe('pass')
  expect(merged.cases[0]).toMatchObject({ id: 'english', sourceWindow: 1, attempts: 3, passed: 3, pass3: 'pass' })
  expect(merged.cases[1]).toMatchObject({ id: 'portuguese', sourceWindow: 2, attempts: 3, passed: 3, pass3: 'pass',
    superseded: [{ ...first.cases[1], sourceWindow: 1 }] })
  expect(merged.groups.every((group) => group.passed === 1)).toBe(true)
})

it('replaces only the failed case in a declared rerun and preserves its passing window companion', () => {
  const first = summarize([...completed(0), ...completed(1, false)], descriptors)
  const rerun = summarize(completed(1), [descriptors[1]])
  const merged = mergeReports([first, rerun], descriptors, { rerunWindows: [2] })
  expect(merged.status).toBe('pass')
  expect(merged.cases[0]).toMatchObject({ id: 'english', sourceWindow: 1, pass3: 'pass' })
  expect(merged.cases[1]).toMatchObject({ id: 'portuguese', sourceWindow: 2, attempts: 3, passed: 3,
    rerun: true, superseded: [{ ...first.cases[1], sourceWindow: 1 }] })
  const directory = mkdtempSync(join(tmpdir(), 'astra-merged-evidence-'))
  try {
    writeReport(merged, directory)
    expect(JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'))).toEqual(merged)
    expect(readFileSync(join(directory, 'summary.md'), 'utf8')).toContain('| portuguese | 2 | 1 | 0/3 | fail |')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

it('rejects a later entry for an already passed case, including a declared rerun', () => {
  const first = summarize(completed(0), descriptors)
  for (const options of [{}, { rerunWindows: [2] }]) {
    expect(() => mergeReports([first, window(0)], descriptors, options)).toThrow(/already passed/)
  }
})

it('keeps an incomplete case incomplete when no later window completes it', () => {
  const first = summarize([...completed(0), result(1)], descriptors)
  const merged = mergeReports([first], descriptors)
  expect(merged.status).toBe('incomplete')
  expect(merged.cases[1]).toMatchObject({ attempts: 1, passed: 1, pass3: 'incomplete' })
  expect(merged.cases[1].superseded).toBeUndefined()
})

it('rejects complete failed-case replacement without a declaration and rejects a second rerun', () => {
  const first = summarize(completed(1, false), [descriptors[1]])
  expect(() => mergeReports([first, window(1)], descriptors)).toThrow(/declare.*rerun/)
  expect(() => mergeReports([first, first, window(1)], descriptors, { rerunWindows: [2, 3] }))
    .toThrow(/already.*rerun/)
})

it('keeps all interrupted evidence without adding superseded attempts to the final counts', () => {
  const first = summarize([result(1, false)], [descriptors[1]])
  const second = summarize([result(1), result(1)], [descriptors[1]])
  const merged = mergeReports([first, second, window(1)], descriptors)
  expect(merged.cases[1]).toMatchObject({ attempts: 3, passed: 3, sourceWindow: 3,
    superseded: [{ attempts: 1, passed: 0, sourceWindow: 1, reportedPass3: 'fail' }, { attempts: 2, passed: 2, sourceWindow: 2 }] })
  expect(mergeReports([first], descriptors).cases[1].pass3).toBe('incomplete')
})

it('continues an interrupted rerun without granting another rerun', () => {
  const first = summarize(completed(1, false), [descriptors[1]])
  const interrupted = summarize([result(1)], [descriptors[1]])
  const merged = mergeReports([first, interrupted, window(1)], descriptors, { rerunWindows: [2] })
  expect(merged.cases[1]).toMatchObject({ rerun: true, sourceWindow: 3, pass3: 'pass', superseded: [
    { sourceWindow: 1, pass3: 'fail' }, { sourceWindow: 2, rerun: true, pass3: 'incomplete' },
  ] })
  expect(() => mergeReports([first, interrupted, window(1)], descriptors, { rerunWindows: [2, 3] }))
    .toThrow(/already.*rerun/)
})

it('keeps skipped or unavailable replacement evidence incomplete', () => {
  for (const field of ['skipped', 'unavailable', 'missingComposition']) {
    const replacement = window(1, { [field]: 1, pass3: 'incomplete' })
    const merged = mergeReports([window(0), window(1, { attempts: 0, passed: 0, pass3: 'incomplete' }), replacement], descriptors)
    expect(merged.status).toBe('incomplete')
    expect(merged.cases[1]).toMatchObject({ pass3: 'incomplete', [field]: 1 })
  }
})

it('rejects duplicate entries inside a window and rerun declarations without a failed predecessor', () => {
  const incomplete = window(1, { attempts: 0, passed: 0, pass3: 'incomplete' })
  expect(() => mergeReports([{ k: 3, cases: [...incomplete.cases, ...window(1).cases] }], descriptors))
    .toThrow(/Duplicate case within window/)
  expect(() => mergeReports([window(1)], descriptors, { rerunWindows: [1] })).toThrow(/previous failed case/)
  expect(() => mergeReports([incomplete, window(1)], descriptors, { rerunWindows: [2] })).toThrow(/previous failed case/)
  expect(() => mergeReports([window(1)], descriptors, { rerunWindows: [2] })).toThrow(/input positions/)
})

it('reads ordered summary paths with --rerun applying only to its following window', () => {
  const directory = mkdtempSync(join(tmpdir(), 'astra-window-files-'))
  const initial = join(directory, 'initial.json')
  const rerun = join(directory, 'rerun.json')
  try {
    writeFileSync(initial, JSON.stringify(summarize([...completed(0), ...completed(1, false)], descriptors)))
    writeFileSync(rerun, JSON.stringify(summarize(completed(1), [descriptors[1]])))
    expect(mergeReportFiles([initial, '--rerun', rerun], descriptors)).toMatchObject({ status: 'pass', cases: [
      { sourceWindow: 1, pass3: 'pass' }, { sourceWindow: 2, rerun: true, pass3: 'pass' },
    ] })
    expect(() => mergeReportFiles([initial, rerun], descriptors)).toThrow(/declare.*rerun/)
    expect(() => mergeReportFiles([initial, '--rerun'], descriptors)).toThrow(/summary path/)
    expect(() => mergeReportFiles(['--unknown', initial], descriptors)).toThrow(/options are unsupported/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

it('preserves exact incomplete preconditions in merged windows and the written report', async () => {
  const { summarize, writeReport } = await import('../report.mjs')
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const reason = 'Daily safety budget prevented message allowance exhaustion. Setup cannot reset counters, rotate accounts or raise limits.'
  const attempts = Array.from({ length: 3 }, () => ({ testCase: { metadata: descriptors[0] }, success: false,
    response: { metadata: { astraPreconditionFailure: true, astraPreconditionReason: reason } } }))
  const summary = summarize(attempts, [descriptors[0]])
  expect(summary.cases[0]).toMatchObject({ pass3: 'incomplete', unavailableReasons: [reason] })
  const merged = mergeReports([summary, window(1)], descriptors)
  expect(merged.cases[0].unavailableReasons).toEqual([reason])
  const directory = mkdtempSync(join(tmpdir(), 'astra-report-'))
  try {
    writeReport(merged, directory)
    expect(readFileSync(join(directory, 'summary.md'), 'utf8')).toContain(reason)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

it('retains a minimal pending result while excluding arbitrary payload and credential fields', () => {
  const call = toolCall('create_habit', { title: 'Stretch', frequency_unit: 'Day' }, 'PendingConfirmation')
  Object.assign(call.result.payload, { item_count: 1, proposed_titles: ['Stretch'],
    confirmationToken: 'private-confirmation-value', arbitrary: 'private-payload-value' })
  const output = parseResponse(chatResponse('request', [call]), '', { response: {
    status: 200, headers: { 'x-orbit-request-id': 'request' },
  } })
  const directory = mkdtempSync(join(tmpdir(), 'astra-pending-evidence-'))
  try {
    writeResults([{ testCase: { metadata: { id: 'pending' } }, response: { output }, success: true }], directory)
    const contents = readFileSync(join(directory, 'attempts/pending-r1.json'), 'utf8')
    expect(JSON.parse(contents).toolCalls[0].result).toEqual({ success: true, error: null,
      payload: { status: 'awaiting_confirmation', item_count: 1, habit_count: null, date_count: null,
        proposed_titles: ['Stretch'], dates: null } })
    expect(contents).not.toMatch(/private-(?:confirmation|payload)-value/)
    call.result.payload.status = { secret: 'private-nested-result' }
    call.result.payload.arguments = [{ secret: 'private-nested-result' }]
    writeResults([{ testCase: { metadata: { id: 'pending' } }, response: { output }, success: true }], directory)
    expect(readFileSync(join(directory, 'attempts/pending-r1.json'), 'utf8')).not.toContain('private-nested-result')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
