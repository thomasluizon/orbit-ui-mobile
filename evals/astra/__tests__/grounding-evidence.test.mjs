import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { assertions } from 'promptfoo'
import { fixtureFetch } from './fixtures/public-api.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { beforeEach as prepareAttempt } from '../hooks.mjs'

const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const recorded = JSON.parse(readFileSync(new URL('./fixtures/gate-seven.json', import.meta.url), 'utf8'))

async function gradeRecorded(attempt, unsupported = false) {
  offlineCredentials()
  const state = { habits: [], goals: [], tags: [], templates: [], requests: [], pro: true,
    exhausted: false, capacity: 100, email: 'thomaslrgregorio+orbit-eval-pro@gmail.com' }
  vi.stubGlobal('fetch', fixtureFetch(() => state))
  try {
    const source = structuredClone(corpus.find((entry) => entry.metadata.id === attempt.caseId))
    const { test } = await prepareAttempt({ test: source })
    const grader = { id: () => 'grounding-control', callApi: vi.fn(async (prompt) => {
      const messages = JSON.parse(prompt)
      const output = JSON.parse(messages.at(-1).content.split('<Output>\n')[1].split('\n</Output>')[0])
      const fixture = output.groundingEvidence?.fixture
      const answer = JSON.parse(output.answer ?? '{}')
      const block = answer.parts?.[0]?.block
      const supportedGoals = block?.items?.every((item) => fixture?.goals?.some((goal) =>
        goal.title === item.title && item.progress === `${goal.currentValue} / ${goal.targetValue} ${goal.unit}`))
      const supportedRanking = block?.rows?.every((row) => {
        const title = row.label.replace(/^\d+\. /, '')
        const habit = fixture?.habits?.find((candidate) => candidate.title === title)
        return habit && row.value === `${habit.logs.filter((log) => log.value > 0).length} completions`
      })
      const grounded = Boolean(supportedGoals || supportedRanking)
      return { output: JSON.stringify({ pass: grounded, score: grounded ? 1 : 0,
        reason: grounded ? 'Fixture facts support the answer.' : 'Fixture facts do not support the answer.' }) }

    }) }
    const result = await assertions.runAssertion({ prompt: test.vars.input,
      assertion: configuration.defaultTest.assert.find(({ type }) => type === 'llm-rubric'),
      test: { ...test, options: { provider: grader } }, vars: test.vars,
      providerResponse: { output: { answer: unsupported ? attempt.answer.replace('5 completions', '99 completions') : attempt.answer } },
    })
    return { result, prompt: JSON.parse(grader.callApi.mock.calls[0][0]).map((message) => message.content).join('\n'), test }
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs() }
}

it.each(recorded.slice(0, 2))('grounds the recorded $caseId answer in verified fixture facts', async (attempt) => {
  const { result, prompt, test } = await gradeRecorded(attempt)
  expect(test.vars.preconditionFailure).toBeUndefined()
  expect(result.pass).toBe(true)
  expect(prompt).toContain('checklistTemplates')
  expect(prompt).toContain('apiKeys')
  expect(prompt).not.toContain('orbit-eval-pro@gmail.com')
})
it('retains a failed rubric verdict for an unsupported ranking figure', async () => {
  const { result, prompt } = await gradeRecorded(recorded[1], true)
  expect(prompt).toContain('99 completions')
  expect(result.pass).toBe(false)
})

it('grounds only successful results and removes identifiers and credentials recursively', async () => {
  const { default: gradingInput } = await import('../grading-input.mjs')
  const { retrospectiveResponse } = await import('./fixtures/public-api.mjs')
  const { toolCall } = await import('./fixtures/producer.mjs')
  const succeeded = toolCall('get_retrospective', { period: 'month' })
  succeeded.result.payload = retrospectiveResponse(true)
  const failed = toolCall('get_profile', {}, 'Failed', 'failure')
  const payload = gradingInput({ answer: 'Saved retrospective narrative.', trace: { state: 'available', requestId: 'request', responseRequestId: 'request', calls: [
    { ...succeeded, resultStatus: succeeded.status }, { ...failed, resultStatus: failed.status },
  ] } }, { vars: { evalRequestId: 'request', fixtureEvidence: { apiKeys: [{ id: 'private-key-id', name: 'Read access',
    keyPrefix: 'private-key-prefix', token: 'private-token' }], habits: [{ title: 'Water', id: 'private-habit-id' }] } } })
  expect(payload).toContain('Saved retrospective narrative.')
  expect(payload).toContain('Read access')
  expect(payload).not.toContain('private-')
  const parsed = JSON.parse(payload)
  expect(parsed.groundingEvidence.successfulTools).toEqual([{ name: 'get_retrospective', result: {
    ...retrospectiveResponse(true), sourceRevision: undefined,
  } }])
})

async function gradeOutput(output, vars, supported) {
  const grader = { id: () => 'grounding-regression', callApi: vi.fn(async (prompt) => {
    const messages = JSON.parse(prompt)
    const received = JSON.parse(messages.at(-1).content.split('<Output>\n')[1].split('\n</Output>')[0])
    const pass = Boolean(supported(received))
    return { output: JSON.stringify({ pass, score: pass ? 1 : 0, reason: pass ? 'Grounded.' : 'Unsupported.' }) }
  }) }
  const assertion = configuration.defaultTest.assert.find(({ type }) => type === 'llm-rubric')
  const result = await assertions.runAssertion({ prompt: 'Show the requested facts.', assertion,
    test: { vars, options: { provider: grader } }, vars, providerResponse: { output } })
  return { result, prompt: grader.callApi.mock.calls[0][0] }
}

const gateEight = JSON.parse(readFileSync(new URL('./fixtures/gate-eight.json', import.meta.url), 'utf8'))
it.each(gateEight.filter(({ caseId }) => /quota|budget-cap/.test(caseId)))(
  'grounds the actual HTTP refusal for $caseId and rejects an invented limit', async ({ answer }) => {
    const { default: parseResponse } = await import('../response.mjs')
    const output = parseResponse({ error: answer, errorCode: 'PAY_GATE' }, '',
      { response: { status: 403, headers: { 'x-orbit-request-id': 'request' } } })
    const vars = { evalRequestId: 'request' }
    const supported = (received) => received.groundingEvidence.httpError?.status === 403
      && received.groundingEvidence.httpError.errorCode === 'PAY_GATE'
      && received.answer === received.groundingEvidence.httpError.error
    expect((await gradeOutput(output, vars, supported)).result.pass).toBe(true)
    expect((await gradeOutput({ ...output, answer: answer.replace('(5)', '(99)') }, vars, supported)).result.pass).toBe(false)
    expect((await gradeOutput(output, { evalRequestId: 'other-request' }, supported)).result.pass).toBe(false)
  },
)

it.each(['en', 'pt-BR'])('grounds only the owned email with consistent private placeholders in %s', async (locale) => {
  const { toolCall } = await import('./fixtures/producer.mjs')
  const call = toolCall('get_profile')
  call.result.payload = { email: 'owned@example.test', language: locale }
  const output = { answer: 'owned@example.test', trace: { state: 'available', requestId: 'request', responseRequestId: 'request',
    calls: [{ ...call, resultStatus: call.status }] } }
  const supported = (received) => received.answer === received.groundingEvidence.successfulTools[0].result.email
    && !received.answer.includes('unsupported-email')
  const owned = await gradeOutput(output, { evalRequestId: 'request' }, supported)
  expect(owned.result.pass).toBe(true)
  const invented = await gradeOutput({ ...output, answer: 'invented@example.test' }, { evalRequestId: 'request' }, supported)
  expect(invented.result.pass).toBe(false)
  for (const { prompt } of [owned, invented]) {
    expect(prompt).not.toContain('owned@example.test')
    expect(prompt).not.toContain('invented@example.test')
  }
})

it('passes the server-resolved calendar read window to the grader without trusting answer dates', async () => {
  const { toolCall, chatResponse } = await import('./fixtures/producer.mjs')
  const { default: parseResponse } = await import('../response.mjs')
  const recorded = gateEight.find(({ caseId }) => caseId === 'composition-error-en')
  const call = toolCall('get_calendar_overview', recorded.toolCalls[0].arguments)
  call.result.payload = recorded.successfulTools[0].result
  // Producer: ReadBlockFactory.Metadata uses the normalized arguments as scope.
  const read = { queryId: '11111111-1111-4111-8111-111111111111', queryFamily: 'get_calendar_overview',
    scope: { date_from: '2026-10-01', date_to: '2026-10-28', window_from_utc: '2026-10-01T00:00:00Z',
      window_to_utc: '2026-10-29T00:00:00Z' }, revision: 'private-revision', completeness: 'partial',
    refreshToken: 'private-refresh-token', nextCursor: null, totalCount: 0, recovery: 'reconnect' }
  const response = chatResponse('request', [call])
  response.parts = [{ type: 'block', kind: 'calendar', block: { events: [], surfaceId: 'calendar', read } }]
  const output = parseResponse(response, '', { response: { status: 200, headers: { 'x-orbit-request-id': 'request' } } })
  output.answer = recorded.answer
  const supported = (received) => received.groundingEvidence.readScopes?.some(({ name, scope }) =>
    name === 'get_calendar_overview' && scope.date_from === '2026-10-01' && received.answer.includes('Oct 1, 2026'))
  const grade = await gradeOutput(output, { evalRequestId: 'request' }, supported)
  expect(grade.result.pass).toBe(true)
  expect(grade.prompt).not.toContain('private-')
  expect((await gradeOutput({ ...output, answer: recorded.answer.replace('Oct 1,', 'Sep 1,') },
    { evalRequestId: 'request' }, supported)).result.pass).toBe(false)
  output.trace.responseRequestId = 'other-request'
  expect((await gradeOutput(output, { evalRequestId: 'request' }, supported)).result.pass).toBe(false)
})
