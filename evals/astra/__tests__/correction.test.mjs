import { ATTEMPTS_PER_CASE } from '../attempts.mjs'
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { assertions, loadApiProvider } from 'promptfoo'
import { beforeEach } from '../hooks.mjs'
import { dateOffset } from '../fixtures/reset.mjs'
import { summarize } from '../report.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { chatResponse, preview, toolCall } from './fixtures/producer.mjs'
import { captures } from './fixtures/core-streams.mjs'
import { corpusTests } from '../grade-method.mjs'
import { matchesArguments } from '../operation-matcher.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const config = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

// Bulk preview fields and positional IDs follow PendingOperationChangePreviewer.PreviewCreateAsync.
function batchPreview(arguments_) {
  const pending = preview()
  pending.items = arguments_.habits.map((habit, index) => ({
    ...preview().items[0], itemId: String(index), entityName: habit.title,
    fields: Object.entries(habit).map(([field, value]) => ({
      ...preview().items[0].fields[0], entityName: habit.title, field,
      newValue: String(value), proposedValue: value,
      valueType: field.includes('time') ? 'time' : field.includes('date') ? 'date' : typeof value === 'boolean' ? 'boolean' : 'text',
    })),
  }))
  pending.changeTargetCount = pending.items.length
  return pending
}

function medicalPreviews(scenario, today) {
  const shown = (value) => value.time ?? value.contains?.[0] ?? value
  const original = JSON.parse(JSON.stringify({ habits: scenario.vars.setup.outcome.changes.map((change) =>
    Object.fromEntries(Object.entries(change.fields).map(([field, value]) => [field, field === 'is_bad_habit' ? false : shown(value)]))) }).replace(/\{accountDate([+]\d+)\}/g, (_, offset) => dateOffset(today, Number(offset))))
  const setupInput = scenario.vars.setup.input
    .replaceAll('{accountDateEn+3}', '01/02').replaceAll('{accountDateEn+7}', '01/06')
    .replaceAll('{accountDatePtBR+3}', '02/01').replaceAll('{accountDatePtBR+7}', '06/01')
  const baseline = batchPreview(original)
  baseline.items.reverse()
  const revised = structuredClone(baseline)
  const time = revised.items.find((item) => item.itemId === '0').fields.find((field) => field.field === 'due_time')
  time.newValue = '16:00'
  time.proposedValue = '16:00'
  const revision = { pending_operation_id: baseline.id, answer_question: false,
    items: [{ item_id: '0', edits_json: '{ "due_time": "16:00" }' }] }
  return { original, setupInput, baseline, revised, revision }
}

// The recorded events of a staging stream before its final event, then the final event of the test.
const streamed = (response, requestId) => new Response([...captures.complete.turns[0].slice(0, -1), { type: 'final', response, evalTrace: response.evalTrace }]
  .map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream', 'x-orbit-request-id': requestId } })

it.each(['en', 'pt-BR'])('runs setup, held correction, every assertion and pass^k reporting on the client path: %s', async (locale) => {
  const today = '2031-12-30'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${today}T12:00:00Z`))
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  const scenario = corpus.find((entry) => entry.metadata.family === 'medical-correction' && entry.metadata.locale === locale)
  const { original, setupInput, baseline, revised, revision } = medicalPreviews(scenario, today)
  let revisedPreview = structuredClone(revised)
  const conversations = new Set()
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (new URL(url).pathname === '/api/auth/refresh') return refreshResponse()
    const request = new Request(url, options)
    expect(new URL(url).pathname).toBe('/api/chat/stream')
    const requestId = request.headers.get('x-orbit-request-id')
    const form = await request.formData()
    const setup = form.get('message') === setupInput
    const { conversationId } = JSON.parse(form.get('clientContext'))
    conversations.add(conversationId)
    // The client keeps no text for a reply that is a preview alone, so the history starts with the setup message alone.
    if (!setup) expect(JSON.parse(form.get('history'))[0]).toEqual({ role: 'user', content: setupInput })
    const calls = setup ? [toolCall('bulk_create_habits', original, 'PendingConfirmation', 'setup', scenario.vars.clientContext)]
      : [toolCall('query_habits', { search: locale === 'en' ? 'cholesterol' : 'colesterol' }, 'Succeeded', 'read', scenario.vars.clientContext),
        toolCall('revise_pending_changes', revision, 'PendingConfirmation', 'revision', scenario.vars.clientContext)]
    return streamed({ ...captures.complete.turns[0].at(-1).response, ...chatResponse(requestId, calls), parts: [], aiMessage: null,
      conversationId, pendingOperations: [setup ? baseline : revisedPreview] }, requestId)
  })
  const provider = await loadApiProvider(`file://${root}/http-provider.mjs`, { options: { config: { ...config.providers[0].config,
    transformResponse: `file://${root}/response.mjs`,
  } } })
  let graded = 0
  const grader = { id: () => 'offline-correction-grader', callApi: async () => {
    graded++
    return { output: JSON.stringify({ pass: true, score: 1, reason: 'Offline answer projection control.' }) }
  } }
  const attempts = []
  let prepared
  const graders = corpusTests().find((test) => test.metadata.id === scenario.metadata.id).assert
  expect(graders.map((assertion) => assertion.metric)).toEqual(['outcome', 'composition'])
  async function grade(test) {
    const received = await provider.callApi(test.vars.input, { vars: test.vars })
    return assertions.runAssertions({ provider, providerResponse: received, test: {
      ...test, options: { provider: grader }, assert: graders.map((assertion) => ({ ...assertion,
        value: assertion.value.replace('file://', `file://${root}/`) })),
    } })
  }
  for (let attempt = 0; attempt < ATTEMPTS_PER_CASE; attempt++) {
    prepared = (await beforeEach({ test: structuredClone(scenario) })).test
    const gradingResult = await grade(prepared)
    expect(gradingResult.componentResults).toHaveLength(graders.length)
    expect(gradingResult.pass, gradingResult.reason).toBe(true)
    expect(prepared.vars.baselinePreview).toEqual([baseline])
    attempts.push({ testCase: prepared, success: gradingResult.pass, gradingResult })
  }
  expect(graded).toBe(0)
  expect(conversations.size).toBe(ATTEMPTS_PER_CASE)
  expect(summarize(attempts, [scenario.metadata])).toMatchObject({ status: 'pass', groups: [{ family: 'medical-correction', locale, allAttemptsPass: 'pass' }] })
  const corruptions = [
    () => { revisedPreview.id = '22222222-2222-4222-8222-222222222222' },
    () => { revisedPreview.items.pop() },
    () => { revisedPreview.items[0].entityName = 'Changed' },
    () => { revisedPreview.items.find((item) => item.itemId === '0').fields.find((field) => field.field === 'due_time').newValue = '17:00' },
    () => { revisedPreview = structuredClone(baseline) },
    ...['title', 'frequency_unit', 'due_date', 'end_date', 'due_time', 'due_end_time'].map((name) => () => {
      const item = revisedPreview.items.find((item) => item.itemId === '2')
      const field = item.fields.find((field) => field.field === name)
      if (field) { field.proposedValue = 'Changed'; field.newValue = 'Changed' }
      else item.fields.push({ ...item.fields[0], field: name, proposedValue: 'Changed', newValue: 'Changed' })
    }),
  ]
  for (const corrupt of corruptions) {
    revisedPreview = structuredClone(revised)
    corrupt()
    const result = await grade(prepared)
    expect(result.pass, String(corrupt)).toBe(false)
  }
})

it('keeps a correction whose setup holds no preview as missing evidence, before its own turn', async () => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  const scenario = corpus.find((entry) => entry.metadata.id === 'composition-medical-correction-en')
  let turns = 0
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (new URL(url).pathname === '/api/auth/refresh') return refreshResponse()
    turns++
    const requestId = new Request(url, options).headers.get('x-orbit-request-id')
    return streamed({ ...captures.complete.turns[0].at(-1).response, ...chatResponse(requestId), parts: [{ type: 'text', text: 'Done.' }], aiMessage: 'Done.' }, requestId)
  })
  const { test } = await beforeEach({ test: structuredClone(scenario) })
  expect(test.vars.preconditionFailure).toBe('Correction setup failed dependency composition-medical-batch-en: The reply holds no preview and no question card.')
  const provider = await loadApiProvider(`file://${root}/http-provider.mjs`, { options: { config: config.providers[0].config } })
  expect(await provider.callApi(test.vars.input, { vars: test.vars })).toMatchObject({
    error: `Precondition unavailable: ${test.vars.preconditionFailure}`, metadata: { astraPreconditionFailure: true } })
  expect(turns).toBe(1)
})

vi.mock('../fixtures/reset.mjs', async (importOriginal) => ({ ...await importOriginal(), resetFixture: vi.fn() }))

it.each([
  ['{"due_time":"16:00"}', true], ['{ "due_time": "16:00" }', true],
  ['{"due_time":"16:00","title":"Changed"}', false], ['{"due_time":"17:00"}', false],
  ['{"due_time":1600}', false], ['null', false], ['[]', false], ['invalid', false],
  [{ due_time: '16:00' }, false],
])('matches only the exact decoded edit object: %j', (actual, accepted) => {
  expect(matchesArguments(actual, { jsonEquals: { due_time: '16:00' } })).toBe(accepted)
})
