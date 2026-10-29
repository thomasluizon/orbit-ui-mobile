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
import { visiblePreview } from '../visible-preview.mjs'
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
  const original = JSON.parse(JSON.stringify({ habits: scenario.vars.setup.expectations.required[0].arguments.habits.map((habit) => ({
    ...habit, title: (habit.title.anyOf?.[0] ?? habit.title).textContains,
  })) }).replace(/\{accountDate([+]\d+)\}/g, (_, offset) => dateOffset(today, Number(offset))))
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

it.each(['en', 'pt-BR'])('runs setup, held correction, every assertion and pass^3 reporting: %s', async (locale) => {
  const today = '2031-12-30'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${today}T12:00:00Z`))
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  const scenario = corpus.find((entry) => entry.metadata.family === 'medical-correction' && entry.metadata.locale === locale)
  const { original, setupInput, baseline, revised, revision } = medicalPreviews(scenario, today)
  let correctionArguments = structuredClone(revision)
  let correctionStatus = 'PendingConfirmation'
  let revisedPreview = structuredClone(revised)
  let extraCall = null
  let omitRevision = false
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (new URL(url).pathname === '/api/auth/refresh') return refreshResponse()
    const request = new Request(url, options)
    const requestId = request.headers.get('x-orbit-request-id')
    const form = await request.formData()
    const setup = form.get('message') === setupInput
    if (!setup) expect(JSON.parse(form.get('history'))).toHaveLength(2)
    const arguments_ = setup ? original : correctionArguments
    const calls = setup ? [toolCall('bulk_create_habits', arguments_, 'PendingConfirmation', 'setup', scenario.vars.clientContext)]
      : [toolCall('query_habits', { search: locale === 'en' ? 'cholesterol' : 'colesterol' }, 'Succeeded', 'read', scenario.vars.clientContext),
        ...(omitRevision ? [] : [toolCall('revise_pending_changes', arguments_, correctionStatus, 'revision', scenario.vars.clientContext)])]
    if (!setup && extraCall) calls.push(toolCall(extraCall, extraCall === 'revise_pending_changes' ? revision
      : extraCall === 'create_habit' ? original.habits[0] : original, 'PendingConfirmation', 'extra', scenario.vars.clientContext))
    return Response.json({ ...chatResponse(requestId, calls), parts: [], aiMessage: null,
      pendingOperations: [setup ? baseline : revisedPreview] }, { headers: { 'x-orbit-request-id': requestId } })
  })
  const provider = await loadApiProvider(`file://${root}/http-provider.mjs`, { options: { config: { ...config.providers[0].config,
    transformResponse: `file://${root}/response.mjs`,
  } } })
  let graded = 0
  let gradingPrompt
  const grader = { id: () => 'offline-correction-grader', callApi: async (prompt) => {
    graded++
    gradingPrompt = JSON.parse(prompt).map((message) => message.content).join('\n')
    return { output: JSON.stringify({ pass: true, score: 1, reason: 'Offline answer projection control.' }) }
  } }
  const attempts = []
  let prepared
  async function grade(test) {
    const received = await provider.callApi(test.vars.input, { vars: test.vars })
    return assertions.runAssertions({ provider, providerResponse: received, test: {
      ...test, options: { provider: grader }, assert: config.defaultTest.assert.map((assertion) => ({ ...assertion,
        ...(assertion.type === 'javascript' ? { value: assertion.value.replace('file://', `file://${root}/`) } : {}),
      })),
    } })
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    prepared = (await beforeEach({ test: structuredClone(scenario) })).test
    const gradingResult = await grade(prepared)
    expect(gradingResult.componentResults).toHaveLength(config.defaultTest.assert.length)
    expect(gradingResult.pass, gradingResult.reason).toBe(true)
    expect(gradingPrompt).toContain('16:00')
    expect(gradingPrompt).toContain('OneTime')
    expect(gradingPrompt).toContain('Day')
    expect(gradingPrompt).toContain('setupPreview')
    expect(gradingPrompt).toContain(JSON.stringify(visiblePreview(baseline)))
    expect(gradingPrompt).not.toContain('one-time types')
    expect(gradingPrompt).toContain('every other item keeps the frequency, dates, times, preparation bounds and title from the setup preview')
    expect(gradingPrompt).not.toContain('evalTrace')
    attempts.push({ testCase: prepared, success: gradingResult.pass, gradingResult })
  }
  expect(graded).toBe(3)
  expect(summarize(attempts, [scenario.metadata])).toMatchObject({ status: 'pass', groups: [{ family: 'medical-correction', locale, pass3: 'pass' }] })
  const corruptions = [
    () => { correctionArguments.pending_operation_id = '22222222-2222-4222-8222-222222222222' },
    () => { correctionArguments.items[0].item_id = '1' },
    () => { correctionArguments.items[0].edits_json = '{"due_time":"17:00"}' },
    () => { correctionArguments.items[0].edits_json = '{"due_time":"16:00","title":"Changed"}' },
    () => { correctionArguments.remove_item_ids = ['1'] },
    () => { correctionArguments.items.push({ item_id: '1', edits_json: '{"due_time":"17:00"}' }) },
    () => { correctionStatus = 'Succeeded' },
    () => { omitRevision = true },
    ...['revise_pending_changes', 'bulk_create_habits', 'create_habit'].map((name) => () => { extraCall = name }),
    () => { revisedPreview.id = '22222222-2222-4222-8222-222222222222' },
    () => { revisedPreview.items.pop() },
    () => { revisedPreview.items[0].entityName = 'Changed' },
    () => { revisedPreview.items.find((item) => item.itemId === '0').fields.find((field) => field.field === 'due_time').newValue = '17:00' },
    ...['title', 'frequency_unit', 'due_date', 'end_date', 'due_time', 'due_end_time'].map((name) => () => {
      const item = revisedPreview.items.find((item) => item.itemId === '2')
      const field = item.fields.find((field) => field.field === name)
      if (field) { field.proposedValue = 'Changed'; field.newValue = 'Changed' }
      else item.fields.push({ ...item.fields[0], field: name, proposedValue: 'Changed', newValue: 'Changed' })
    }),
  ]
  for (const corrupt of corruptions) {
    correctionArguments = structuredClone(revision)
    correctionStatus = 'PendingConfirmation'
    revisedPreview = structuredClone(revised)
    extraCall = null
    omitRevision = false
    corrupt()
    const result = await grade(prepared)
    expect(result.pass, String(corrupt)).toBe(false)
  }
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
