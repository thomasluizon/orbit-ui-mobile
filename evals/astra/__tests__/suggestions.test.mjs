import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { assertions as promptfooAssertions } from 'promptfoo'
import { composition, behavior, structural } from '../assertions.mjs'
import { validDraft, suggestionAnswer } from '../suggestions.mjs'
import { visibleAnswer } from '../visible-answer.mjs'
import parseResponse from '../response.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { beforeEach } from '../hooks.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { suggestionDraft, suggestionResponse } from './fixtures/producer.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const scenario = (family = 'suggestions', locale = 'en') => structuredClone(corpus.find((entry) => entry.metadata.family === family && entry.metadata.locale === locale))
const output = (response) => parseResponse(response, '', { response: { status: 200, headers: { 'x-orbit-request-id': 'request' } } })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each(['en', 'pt-BR'])('grades the producer suggestion block and its projected fields in %s', async (locale) => {
  const test = scenario('suggestions', locale)
  test.vars.evalRequestId = 'request'
  const response = suggestionResponse('request', locale)
  const parsed = output(response)
  expect(composition(parsed, { vars: test.vars }).pass).toBe(true)
  expect(behavior(parsed, { vars: test.vars }).pass).toBe(true)
  expect((await structural(parsed, { vars: test.vars, test })).pass).toBe(true)
  const answer = JSON.parse(visibleAnswer(parsed.composition, test.vars.clientContext))
  const draft = answer.parts[1].block.drafts[0]
  expect(draft).toMatchObject({ title: locale === 'en' ? 'Read' : 'Ler', dueTime: '21:00:00', dueEndTime: '21:10:00',
    reminderMinutesBefore: 5, checklistItems: [locale === 'en' ? 'Read one page' : 'Ler uma página'] })
  expect(draft.dueDate).toBe(locale === 'en' ? 'October 26, 2026' : '26 de outubro de 2026')
  expect(draft.id).toBe(response.parts[1].block.drafts[0].id)
})
it.each([
  (response) => { response.parts = null },
  (response) => { response.parts = {} },
  (response) => { response.parts = [{ type: 'text', text: 'Read and stretch' }] },
  (response) => { response.parts[0].text = 'Read ten minutes each night'; response.aiMessage = response.parts[0].text },
  (response) => { response.parts[1].block.drafts.pop() },
  (response) => { response.parts[1].block.drafts[1] = response.parts[1].block.drafts[0] },
  (response) => { response.parts[1].block.language = 'pt-BR' },
  (response) => { response.pendingOperations = [{ id: 'write' }] },
  (response) => { response.parts.push({ type: 'text', text: 'Saved.' }) },
])('rejects missing, duplicate, malformed or prose replacement suggestions %#', (mutate) => {
  const response = suggestionResponse('request')
  mutate(response)
  expect(composition({ composition: response }, { vars: scenario().vars }).pass).toBe(false)
})
it.each(Object.keys(suggestionDraft()))('rejects a draft missing %s', (key) => {
  const draft = suggestionDraft()
  delete draft[key]
  expect(validDraft(draft)).toBe(false)
})
it.each([
  { days: ['Monday', 'Monday'] }, { days: ['Segunda'] }, { dueDate: '2026-02-30' }, { dueTime: '25:00:00' },
  { dueEndTime: '20:00:00' }, { reminderMinutesBefore: -1 }, { checklistItems: [null] }, { frequencyQuantity: 0 },
  { type: 'Task' }, { existingHabitId: 'invented' }, { reason: 'line\nbreak' },
])('rejects invalid draft schedules or contents %j', (fields) => {
  expect(validDraft(suggestionDraft(fields))).toBe(false)
  expect(() => suggestionAnswer([{ type: 'block', kind: 'habitSuggestions', block: { drafts: [suggestionDraft(fields)] } }], 'en')).toThrow()
})
it.each(['en', 'pt-BR'])('requires one existing target without a new duplicate in %s', (locale) => {
  const test = scenario('suggestions-duplicate', locale)
  const response = suggestionResponse('request', locale)
  const existing = test.vars.composition.existing[0]
  existing.id = '33333333-3333-4333-8333-333333333333'
  const draft = response.parts[1].block.drafts[0]
  draft.title = existing.title
  expect(composition(output(response), { vars: test.vars }).pass).toBe(false)
  draft.existingHabitId = existing.id
  expect(composition(output(response), { vars: test.vars }).pass).toBe(true)
  const answer = JSON.parse(visibleAnswer(response, test.vars.clientContext))
  expect(answer.parts[1].block.drafts[0].existingHabitId).toBe(existing.id)
  response.parts[1].block.drafts[1].title = existing.title
  expect(composition(output(response), { vars: test.vars }).pass).toBe(false)
})
it.each(['en', 'pt-BR'])('drives verified chat setup and one real HTTP refine request in %s', async (locale) => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  const test = scenario('suggestions-refine', locale)
  let baseline
  let requests = 0
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (path === '/api/auth/refresh') return refreshResponse()
    const request = new Request(url, options)
    if (path === '/api/chat') {
      const form = await request.formData()
      expect(form.get('message')).toBe(test.vars.setup.input)
      expect(JSON.parse(form.get('clientContext')).partKinds).toContain('habitSuggestions')
      const response = suggestionResponse(request.headers.get('x-orbit-request-id'), locale)
      baseline = response.parts[1].block.drafts
      for (const draft of baseline) draft.dueDate = test.vars.accountDate
      return Response.json(response, { headers: { 'x-orbit-request-id': request.headers.get('x-orbit-request-id') } })
    }
    expect(path).toBe('/api/chat/habit-suggestions/refine')
    expect(request.method).toBe('POST')
    expect(request.headers.get('authorization')).toBe('Bearer offline-token')
    expect(request.headers.get('content-type')).toBe('application/json')
    const body = await request.json()
    expect(body).toEqual({ draft: baseline[0], instruction: test.vars.input, language: locale })
    requests++
    return Response.json({ ...body.draft, ...test.vars.refine.expected, dueEndTime: '22:40:00' })
  })
  await beforeEach({ test })
  expect(test.vars.preconditionFailure).toBeUndefined()
  expect(test.vars.baselineDrafts).toEqual(baseline)
  const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config,
    url: 'https://astra.invalid/api/chat', transformResponse: `file://${fileURLToPath(new URL('../response.mjs', import.meta.url))}` } })
  const response = await provider.callApi(test.vars.input, { vars: test.vars })
  expect(requests).toBe(1)
  expect(response.error).toBeUndefined()
  expect(response.output.drafts[1]).toEqual(baseline[1])
  for (const assertion of [structural, behavior, composition]) expect((await assertion(response.output, { vars: test.vars })).pass).toBe(true)
  const grader = { id: () => 'offline-refine-grader', callApi: vi.fn(async () => ({
    output: JSON.stringify({ pass: true, score: 1, reason: 'Captured baseline context.' }),
  })) }
  const grade = await promptfooAssertions.runAssertion({
    prompt: test.vars.input, assertion: configuration.defaultTest.assert.find((assertion) => assertion.type === 'llm-rubric'),
    test: { ...test, options: { provider: grader } }, vars: test.vars, providerResponse: { output: response.output },
  })
  expect(grade.pass).toBe(true)
  const gradingPrompt = grader.callApi.mock.calls[0][0]
  expect(gradingPrompt).toContain('Original selected draft:')
  expect(gradingPrompt).toContain(JSON.stringify(baseline[0]).replaceAll('"', '\\"'))
  expect(gradingPrompt).toContain(test.vars.input)
  response.output.drafts[1].title = 'Unrequested change'
  expect(composition(response.output, { vars: test.vars }).pass).toBe(false)
})
it.each(['en', 'pt-BR'])('preserves the selected draft in %s', async (locale) => {
  const test = scenario('suggestions-refine', locale)
  const baseline = suggestionResponse('request', locale).parts[1].block.drafts
  test.vars.refineDraft = structuredClone(baseline[0])
  test.vars.baselineDrafts = structuredClone(baseline)
  const revised = { ...baseline[0], ...test.vars.refine.expected, dueEndTime: '22:40:00' }
  const check = async (draft, siblings = [baseline[1]]) => {
    const response = { httpStatus: 200, refinedDraft: draft, drafts: [draft, ...siblings] }
    return Promise.all([structural, behavior, composition].map(async (assertion) => (await assertion(response, { vars: test.vars })).pass))
  }
  expect(await check(revised)).toEqual([true, true, true])
  for (const fields of [
    { title: locale === 'en' ? 'Cycle outdoors' : 'Pedalar ao ar livre' },
    { checklistItems: [locale === 'en' ? 'Cycle around the block' : 'Dar uma volta de bicicleta'] },
    { type: 'Task', days: [], frequencyUnit: null, frequencyQuantity: null },
  ]) expect(await check({ ...revised, ...fields })).toEqual([false, false, false])
  expect(await check(revised, [{ ...baseline[1], title: 'Unrequested change' }])).toEqual([false, false, false])
  const response = { httpStatus: 200, refinedDraft: revised, drafts: [baseline[1], revised] }
  expect(composition(response, { vars: test.vars }).pass).toBe(false)
})
it.each(['en', 'pt-BR'])('compares selected weekdays as a set in %s', async (locale) => {
  const test = scenario('suggestions-refine', locale)
  test.vars.refineDraft = suggestionDraft()
  test.vars.baselineDrafts = [suggestionDraft()]
  const revised = suggestionDraft({ ...test.vars.refine.expected, dueEndTime: '22:40:00' })
  for (const [days, pass] of [
    [[...revised.days].reverse(), true], [revised.days.slice(1), false],
    [[...revised.days, 'Saturday'], false], [[...revised.days, 'Monday'], false],
  ]) {
    const draft = { ...revised, days }
    const response = { httpStatus: 200, refinedDraft: draft, drafts: [draft] }
    for (const assertion of [structural, behavior, composition]) expect((await assertion(response, { vars: test.vars })).pass).toBe(pass)
  }
})
it.each([{}, [], { draft: suggestionDraft() }, suggestionDraft(), suggestionDraft({ id: '22222222-2222-4222-8222-222222222222' })])(
  'fails malformed, unchanged or mismatched refine responses %#', async (refinedDraft) => {
    const test = scenario('suggestions-refine')
    test.vars.refineDraft = suggestionDraft()
    test.vars.baselineDrafts = [suggestionDraft()]
    const response = { httpStatus: 200, refinedDraft, drafts: [refinedDraft] }
    for (const assertion of [structural, behavior, composition]) expect((await assertion(response, { vars: test.vars })).pass).toBe(false)
  },
)

vi.mock('../fixtures/reset.mjs', async (importOriginal) => ({ ...await importOriginal(), resetFixture: vi.fn() }))

it.each([400, 403, 429, 500])('fails a refine HTTP %s without retrying', async (status) => {
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  let requests = 0
  vi.stubGlobal('fetch', async () => {
    requests++
    return Response.json({ error: 'Unavailable' }, { status })
  })
  const test = scenario('suggestions-refine')
  test.vars.refineDraft = suggestionDraft()
  test.vars.baselineDrafts = [suggestionDraft()]
  const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config, url: 'https://astra.invalid/api/chat' } })
  const response = await provider.callApi(test.vars.input, { vars: test.vars })
  expect(requests).toBe(1)
  if (status === 429) {
    expect(response.error).toBe('Astra returned HTTP 429.')
    expect(response.metadata.astraHttpStatus).toBe(429)
    return
  }
  expect(response.output.httpStatus).toBe(status)
  for (const assertion of [structural, behavior, composition]) expect((await assertion(response.output, { vars: test.vars })).pass).toBe(false)
})
it('rejects an unchanged schedule even when another target field changes', () => {
  const test = scenario('suggestions-refine')
  test.vars.refineDraft = suggestionDraft()
  test.vars.baselineDrafts = [suggestionDraft()]
  const revised = suggestionDraft({ reason: 'Another reason.' })
  expect(composition({ httpStatus: 200, refinedDraft: revised, drafts: [revised] }, { vars: test.vars }).pass).toBe(false)
})

it.each([{}, [], { drafts: [suggestionDraft()] }])('the HTTP provider fails malformed refine bodies %#', async (body) => {
  vi.stubGlobal('fetch', async () => Response.json(body))
  const test = scenario('suggestions-refine')
  test.vars.refineDraft = suggestionDraft()
  test.vars.baselineDrafts = [suggestionDraft()]
  const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config, url: 'https://astra.invalid/api/chat' } })
  expect(await provider.callApi(test.vars.input, { vars: test.vars })).toHaveProperty('error')
})
