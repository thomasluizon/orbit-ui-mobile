import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { assertions, loadApiProvider } from 'promptfoo'
import { beforeEach } from '../hooks.mjs'
import { summarize } from '../report.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { chatResponse, preview, toolCall } from './fixtures/producer.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const config = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

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

it.each(['en', 'pt-BR'])('runs setup, held correction, every assertion and pass^3 reporting: %s', async (locale) => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://astra.invalid')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  const scenario = corpus.find((entry) => entry.metadata.family === 'medical-correction' && entry.metadata.locale === locale)
  const original = { habits: scenario.vars.setup.expectations.required[0].arguments.habits.map((habit) => ({
    ...habit, title: habit.title.textContains,
  })) }
  const revised = structuredClone(original)
  revised.habits[0].due_time = '16:00'
  let correctionArguments = revised
  let correctionStatus = 'PendingConfirmation'
  let extraCall = false
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (new URL(url).pathname === '/api/auth/refresh') return refreshResponse()
    const request = new Request(url, options)
    const requestId = request.headers.get('x-orbit-request-id')
    const form = await request.formData()
    const setup = form.get('message') === scenario.vars.setup.input
    if (!setup) expect(JSON.parse(form.get('history'))).toHaveLength(2)
    const arguments_ = setup ? original : correctionArguments
    const calls = [toolCall('bulk_create_habits', arguments_, setup ? 'PendingConfirmation' : correctionStatus)]
    if (!setup && extraCall) calls.push(toolCall('bulk_create_habits', revised, 'PendingConfirmation', 'extra'))
    return Response.json({ ...chatResponse(requestId, calls), parts: [], aiMessage: null,
      pendingOperations: [batchPreview(setup ? original : revised)] }, { headers: { 'x-orbit-request-id': requestId } })
  })
  const provider = await loadApiProvider('http', { options: { config: { ...config.providers[0].config,
    transformResponse: `file://${root}/response.mjs`,
  } } })
  let graded = 0
  const grader = { id: () => 'offline-correction-grader', callApi: async (prompt) => {
    graded++
    expect(prompt).toContain('16:00')
    expect(prompt).toContain('OneTime')
    expect(prompt).not.toContain('evalTrace')
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
    attempts.push({ testCase: prepared, success: gradingResult.pass, gradingResult })
  }
  expect(graded).toBe(3)
  expect(summarize(attempts, [scenario.metadata])).toMatchObject({ status: 'pass', groups: [{ family: 'medical-correction', locale, pass3: 'pass' }] })
  for (const corrupt of [
    () => { correctionArguments = structuredClone(revised); correctionArguments.habits[1].due_time = '17:00' },
    () => { correctionArguments = { ...revised, parent_habit_id: 'extra-target' } },
    () => { correctionArguments = revised; correctionStatus = 'Succeeded' },
    () => { correctionStatus = 'PendingConfirmation'; extraCall = true },
  ]) {
    corrupt()
    expect((await grade(prepared)).pass).toBe(false)
  }
})

vi.mock('../fixtures/reset.mjs', async (importOriginal) => ({ ...await importOriginal(), resetFixture: vi.fn() }))
