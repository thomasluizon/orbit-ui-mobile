import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeResults } from '../report.mjs'
import parseResponse from '../response.mjs'
import { behavior } from '../assertions.mjs'
import { chatResponse, toolCall, traceTiming } from './fixtures/producer.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { PostApiChatResponse } from '../../../packages/shared/src/types/__generated__/api.generated.ts'

const directories = []
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function persist(output, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'astra-evidence-'))
  directories.push(directory)
  const entry = { testCase: { metadata: { id: 'evidence' }, vars: { clientContext: { supportsParts: true } } },
    response: { output }, success: false, ...overrides }
  writeResults([entry], directory)
  const text = readFileSync(join(directory, 'attempts/evidence-r1.json'), 'utf8')
  return { directory, text, evidence: JSON.parse(text) }
}

function outputFor(calls = []) {
  return parseResponse(chatResponse('private-request-identity', calls), '', { response: {
    status: 200, headers: { 'x-orbit-request-id': 'private-request-identity' },
  } })
}

it('preserves the graded projection, block subtypes, full verdicts and schema-confirmed timing', () => {
  const output = outputFor([toolCall('query_habits', { date: 'today' })])
  output.answer = ' Water is ready.\n\n  Keep this spacing.\n'
  output.composition.parts = [{ type: 'text', text: 'Unprojected text' },
    { type: 'block', kind: 'recordList', block: { kind: 'notifications', items: [] } },
    { type: 'block', kind: 'accountRows', block: { kind: 'profile', rows: [] } }]
  expect(PostApiChatResponse.shape.evalTrace.parse(chatResponse('request').evalTrace).timing).toEqual(traceTiming)
  const { evidence, directory, text } = persist(output, { gradingResult: {
    reason: 'Composition failed.', componentResults: [
      { assertion: { metric: 'composition' }, pass: false, reason: 'First reason.\nSecond reason.' },
      { assertion: { metric: 'finalAnswer' }, pass: true, reason: 'Complete grader rationale.\nWith details.' },
    ],
  } })
  expect(evidence.answer).toBe(output.answer)
  expect(evidence.composition).toEqual([{ kind: 'recordList', subtype: 'notifications' }, { kind: 'accountRows', subtype: 'profile' }])
  expect(evidence.timing).toEqual(traceTiming)
  expect(evidence.assertions).toEqual([
    { metric: 'composition', pass: false, reason: 'First reason.\nSecond reason.' },
    { metric: 'finalAnswer', pass: true, reason: 'Complete grader rationale.\nWith details.' },
  ])
  expect(evidence.graderRationale).toBe('Complete grader rationale.\nWith details.')
  expect(text).not.toContain('private-request-identity')
  expect(text).not.toContain('call-1')
  writeFileSync(join(directory, 'attempts/evidence-r1.json'), 'stale', { mode: 0o644 })
  writeResults([{ testCase: { metadata: { id: 'evidence' } }, response: { output }, success: true }], directory)
  expect(statSync(join(directory, 'attempts/evidence-r1.json')).mode & 0o777).toBe(0o600)
})

it('redacts credential echoes in answers, renderer errors, assertion reasons and grader rationale', () => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'private-bearer-value')
  const call = toolCall('manage_account', { action: 'confirm_deletion' })
  Object.assign(call.arguments, { code: 'private-code-value', cookie: 'private-cookie-value', accountId: 'private-account-value' })
  const output = outputFor([call])
  const secrets = ['private-bearer-value', 'offline-refresh', 'private-code-value', 'private-cookie-value',
    'private-account-value', 'person@example.invalid', '12345678-1234-1234-1234-123456789abc']
  output.answer = secrets.join('\n')
  output.renderError = { message: output.answer, blockKind: 'accountRows' }
  const { evidence, text, directory } = persist(output, { error: output.answer, gradingResult: {
    componentResults: [{ assertion: { metric: 'finalAnswer' }, pass: false, reason: output.answer }],
  } })
  for (const secret of secrets) {
    expect(text).not.toContain(secret)
    expect(readFileSync(join(directory, 'results.json'), 'utf8')).not.toContain(secret)
  }
  expect(evidence.answer).toBe(secrets.map(() => '[redacted]').join('\n'))
  expect(evidence.graderRationale).toBe(evidence.answer)
  expect(evidence.renderError.message).toBe(evidence.answer)
})

it('keeps declared nested and union arguments while omitting unknown credential fields', () => {
  const call = toolCall('ask', { form: 'pickList', action: 'create_habits', items: [{ id: 'water', label: 'Water',
    arguments: { title: 'Water', cookie: 'private-nested-cookie', checklist_items: [
      { text: 'Drink a glass', is_checked: false, token: 'private-nested-token' },
    ] } }] }, 'Succeeded', 'call-1', { supportsParts: true })
  const { evidence, text } = persist(outputFor([call]))
  expect(evidence.toolCalls[0].arguments.items[0].arguments).toEqual({ title: 'Water', checklist_items: [
    { text: 'Drink a glass', is_checked: false },
  ] })
  expect(text).not.toMatch(/private-nested-(cookie|token)/)
})

it('applies normalized sensitivity marks to ranking arguments and echoed result values', () => {
  const call = toolCall('get_habit_ranking', { relative_period: 'today' }, 'Succeeded', 'call-1', { supportsParts: true })
  Object.assign(call.arguments, { query_token: 'private-query-value', cursor: 'private-cursor-value', habit_ids: ['private-habit-value'] })
  call.result.payload = { nested: { next_cursor: 'private-next-value' } }
  const output = outputFor([call])
  output.answer = 'private-query-value private-next-value'
  const { evidence, text } = persist(output)
  expect(evidence.toolCalls[0].arguments.relative_period).toBe('today')
  expect(evidence.answer).toBe('[redacted] [redacted]')
  expect(text).not.toMatch(/private-(query|cursor|habit|next)-value/)
})

it('records unknown tools without unverified arguments and supports missing timing or responses', () => {
  const output = outputFor([toolCall('unknown_tool', { token: 'private-unknown-value' }, 'NotExecuted')])
  delete output.trace.timing
  const { evidence, text } = persist(output)
  expect(evidence.toolCalls).toEqual([{ name: 'unknown_tool', arguments: null, resultStatus: 'NotExecuted' }])
  expect(evidence.timing).toBeNull()
  expect(text).not.toContain('private-unknown-value')
  expect(persist(undefined, { response: { error: 'Astra returned HTTP 429.', metadata: { astraHttpStatus: 429 } } }).evidence)
    .toMatchObject({ httpStatus: 429, answer: null, toolCalls: [], timing: null, reason: 'Astra returned HTTP 429.' })
})

it('retains diagnostic calls from a mismatched trace without accepting it as grading evidence', () => {
  const output = parseResponse(chatResponse('wrong-request', [toolCall('query_habits', { date: 'today' })]), '', {
    response: { status: 200, headers: { 'x-orbit-request-id': 'expected-request' } },
  })
  expect(behavior(output, { vars: { evalRequestId: 'expected-request', expectations: {} } }).pass).toBe(false)
  const { evidence } = persist(output)
  expect(evidence.toolCalls).toMatchObject([{ name: 'query_habits', arguments: { date: 'today' } }])
  expect(evidence.timing).toEqual(traceTiming)
})
