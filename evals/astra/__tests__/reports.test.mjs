import { expect, it } from 'vitest'
import { mergeReports } from '../merge-reports.mjs'
import { writeResults } from '../report.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
