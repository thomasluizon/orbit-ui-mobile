import { afterEach, describe, expect, it, vi } from 'vitest'
import * as grades from '../assertions.mjs'
import { visibleAnswer } from '../visible-answer.mjs'
import { visibleBlock } from '../visible-blocks.mjs'
import { chatResponse, preview, toolCall } from './fixtures/producer.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { approveStartingStep } from '../step-persistence.mjs'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { prepareCorrection } from '../setup.mjs'
import { assertions as promptfooAssertions } from 'promptfoo'
import parseResponse from '../response.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'

export function startingResponse(locale = 'en', requestId = 'request', suppliedSuggestion, supportsContext = false) {
  const portuguese = locale === 'pt-BR'
  const suggestion = suppliedSuggestion ?? { goal: portuguese ? 'Estudar' : 'Study', step: portuguese ? 'Abrir o livro' : 'Open the book', language: locale }
  const goal = JSON.stringify(suggestion.goal)
  const step = JSON.stringify(suggestion.step)
  const actions = [
    { id: 'smaller', label: portuguese ? 'Menor ainda' : 'Smaller', message: portuguese
      ? `Quero um passo ainda menor para ${goal}. O passo anterior foi ${step}.`
      : `Give me an even smaller starting step for ${goal}. The previous step was ${step}.` },
    { id: 'saveTask', label: portuguese ? 'Salvar como tarefa' : 'Save as task', message: portuguese
      ? `Quero salvar ${step} como tarefa.` : `Save ${step} as a task.` },
    { id: 'saveChecklistItem', label: portuguese ? 'Salvar no checklist' : 'Save as checklist item', message: portuguese
      ? `Quero adicionar ${step} ao checklist de um hábito.` : `Add ${step} to a habit's checklist.` },
  ]
  if (supportsContext) actions[0].previousStep = structuredClone(suggestion)
  const call = toolCall('suggest_breakdown', { one_small_step: true, language: locale,
    title: suggestion.goal, suggested_sub_habits: [{ title: suggestion.step }] }, 'Succeeded', 'call-1', { supportsParts: true })
  call.result.payload = suggestion
  return { ...chatResponse(requestId, [call]), aiMessage: null,
    parts: [{ type: 'block', kind: 'oneSmallStep', block: { suggestion, actions } }] }
}

const varsFor = (locale = 'en', legacy = false) => ({ evalRequestId: 'request',
  clientContext: { supportsParts: true, locale, partKinds: legacy ? [] : ['oneSmallStep'] },
  composition: { mode: legacy ? 'one-small-step-legacy' : 'one-small-step' },
  expectations: { required: [{ name: 'suggest_breakdown', arguments: { one_small_step: true, language: locale }, resultStatus: 'Succeeded' }],
    allowed: ['suggest_breakdown'], counts: { suggest_breakdown: 1 } },
})
const outputFor = (response) => ({ composition: response, trace: { state: 'available', requestId: 'request',
  responseRequestId: 'request', calls: response.evalTrace.toolCalls.map(({ status, ...call }) => ({ ...call, resultStatus: status })) } })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each(['en', 'pt-BR'])('grades and projects the contract block in %s', async (locale) => {
  const response = startingResponse(locale)
  const vars = varsFor(locale)
  const output = outputFor(response)
  for (const grade of [grades.structural, grades.behavior, grades.composition]) {
    const check = await grade(output, { vars, test: { vars } })
    expect(check.pass, `${grade.name}: ${check.reason}`).toBe(true)
  }
  const projected = JSON.parse(visibleAnswer(response, vars.clientContext))
  expect(projected.parts[0].block).toEqual({ step: response.parts[0].block.suggestion.step,
    actions: response.parts[0].block.actions.map(({ label }) => label) })
  expect(visibleBlock(response.parts[0], { locale })).toEqual(projected.parts[0].block)
  expect(JSON.stringify(projected)).not.toContain('Give me an even smaller')
})

it.each(['en', 'pt-BR'])('accepts the typed %s action and rejects a mismatched baseline', async locale => {
  const response = startingResponse(locale, 'request', undefined, true)
  const vars = varsFor(locale)
  expect((await grades.composition(outputFor(response), { vars, test: { vars } })).pass).toBe(true)
  expect(JSON.parse(visibleAnswer(response, vars.clientContext)).parts[0].block.step).toBe(response.parts[0].block.suggestion.step)
  response.parts[0].block.actions[0].previousStep.step = 'A different step'
  expect((await grades.composition(outputFor(response), { vars, test: { vars } })).pass).toBe(false)
})

it.each([
  (response) => { response.aiMessage = 'Here is a step.' },
  (response) => { response.parts.push({ type: 'text', text: 'Try this.' }) },
  (response) => { response.parts.push(structuredClone(response.parts[0])) },
  (response) => { response.parts[0].block.suggestion.language = 'pt-BR' },
  (response) => { response.parts[0].block.suggestion.step = 'line\nbreak' },
  (response) => { response.parts[0].block.suggestion.goal = '' },
  (response) => { response.parts[0].block.actions.pop() },
  (response) => { response.parts[0].block.actions[0].label = 'Tiny' },
  (response) => { response.parts[0].block.actions[1].message = 'Save a different task.' },
  (response) => { response.parts[0].block.suggestion.step = 'Do everything' },
  (response) => { response.followUps = ['Save it?'] },
  (response) => { response.pendingOperations = [{ id: 'unexpected-write' }] },
  (response) => { response.operations = {} },
  (response) => { response.followUps = 'Malformed surface' },
  (response) => { response.parts[0].block.suggestion.step = 'x'.repeat(201) },
  (response) => { response.evalTrace.toolCalls[0].arguments.one_small_step = false },
  (response) => { response.evalTrace.toolCalls[0].arguments.suggested_sub_habits.push({ title: 'A second step' }) },
  (response) => { response.evalTrace.toolCalls.push(structuredClone(response.evalTrace.toolCalls[0])) },
])('rejects a malformed block, invented actions or framing prose %#', (mutate) => {
  const response = startingResponse()
  mutate(response)
  expect(grades.composition(outputFor(response), { vars: varsFor() }).pass).toBe(false)
})

it.each(['en', 'pt-BR'])('requires the exact readable step without actions for the legacy view in %s', (locale) => {
  const response = startingResponse(locale)
  const step = response.parts[0].block.suggestion.step
  response.parts = [{ type: 'text', text: step }]
  response.aiMessage = step
  const vars = varsFor(locale, true)
  expect(grades.composition(outputFor(response), { vars }).pass).toBe(true)
  expect(visibleAnswer(response, vars.clientContext)).toBe(step)
  response.parts[0].text += '\nSave as task'
  response.aiMessage = response.parts[0].text
  expect(grades.composition(outputFor(response), { vars }).pass).toBe(false)
})

it.each(['en', 'pt-BR'].flatMap(locale => [false, true].map(legacy => [locale, legacy])))(
  'rejects an unchanged %s step with legacy view %s and leaves equivalent activity wording to the semantic grader', (locale, legacy) => {
    const response = startingResponse(locale)
    const suggestion = response.parts[0].block.suggestion
    if (legacy) { response.aiMessage = suggestion.step; response.parts = [{ type: 'text', text: suggestion.step }] }
    const vars = { ...varsFor(locale, legacy), previousStartingStep: structuredClone(suggestion) }
    expect(grades.composition(outputFor(response), { vars }).pass).toBe(false)
    vars.previousStartingStep = { ...suggestion, step: locale === 'en' ? 'Read ten pages' : 'Ler dez páginas' }
    expect(grades.composition(outputFor(response), { vars }).pass).toBe(true)
  },
)

it('provides an approval and independent saved-step grader', () => {
  expect(grades.savedStep).toBeTypeOf('function')
})

it('accepts equivalent JSON escaping in server action messages', () => {
  const response = startingResponse('pt-BR')
  for (const action of response.parts[0].block.actions) action.message = action.message.replaceAll('Estudar', '\\u0045studar')
  expect(grades.composition(outputFor(response), { vars: varsFor('pt-BR') }).pass).toBe(true)
})

it('matches the producer trimming surrounding whitespace from tool titles', () => {
  const response = startingResponse()
  const arguments_ = response.evalTrace.toolCalls[0].arguments
  arguments_.title = ` ${arguments_.title} `
  arguments_.suggested_sub_habits[0].title = ` ${arguments_.suggested_sub_habits[0].title} `
  expect(grades.composition(outputFor(response), { vars: varsFor() }).pass).toBe(true)
})

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))

async function checkChecklistSave(test, starting, baseline) {
  const step = starting.suggestion.step
  const habitId = test.vars.checklistHabitId
  const checklist = [...baseline[0].checklistItems, { text: step, isChecked: false }]
  const items = checklist.map(({ text, isChecked }) => ({ text, is_checked: isChecked }))
  const append = { habit_id: habitId, item_to_add: step }
  const fullList = { habit_id: habitId, checklist_items: items }
  const vars = { ...test.vars, evalRequestId: 'request' }
  const callOutput = (arguments_) => outputFor(chatResponse('request', [toolCall('update_checklist', arguments_, 'PendingConfirmation')]))
  for (const arguments_ of [append, fullList, { ...append, checklist_items: null }, { ...fullList, item_to_add: null }]) {
    const grade = grades.behavior(callOutput(arguments_), { vars })
    expect(grade.pass, grade.reason).toBe(true)
  }
  for (const arguments_ of [{ ...append, habit_id: 'another-habit' }, { ...append, item_to_add: 'Another step' },
    { ...append, checklist_items: items }, { ...fullList, habit_id: 'another-habit' },
    { ...fullList, checklist_items: items.slice(1) },
    { ...fullList, checklist_items: items.map((item, index) => index === 0 ? { ...item, is_checked: false } : item) },
    { ...fullList, checklist_items: [...items, items.at(-1)] }]) {
    expect(grades.behavior(callOutput(arguments_), { vars }).pass).toBe(false)
  }

  // Producer: PreviewChecklistAppendAsync and AgentArgumentPreview.Build merge into checklist_items.
  const pending = preview(baseline[0].title)
  pending.items[0].entityId = habitId
  pending.items[0].fields = Object.entries({ habit_id: habitId, checklist_items: items }).map(([field, proposedValue]) => ({
    entityId: habitId, entityName: baseline[0].title, field, oldValue: null,
    newValue: typeof proposedValue === 'string' ? proposedValue : JSON.stringify(proposedValue),
    valueType: 'text', proposedValue, isEditable: false,
  }))
  const parsed = { composition: { pendingOperations: [pending] } }
  offlineCredentials()
  const requests = []
  let stored = baseline
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (path === '/api/auth/refresh') return refreshResponse()
    requests.push(`${options.method} ${path}`)
    if (path === '/api/profile/export') return Response.json({ habits: stored })
    if (path.endsWith('/confirm')) return Response.json({ pendingOperationId: pending.id, confirmationToken: 'offline-confirmation' })
    expect(path).toBe(`/api/ai/pending-operations/${pending.id}/execute`)
    stored = [{ ...baseline[0], checklistItems: checklist }]
    return Response.json({})
  })
  const proposed = pending.items[0].fields[1]
  for (const invalid of [items.slice(1), [...items].reverse(), [...items, items.at(-1)],
    items.map((item, index) => index === 0 ? { ...item, is_checked: false } : item),
    items.map((item, index) => index === items.length - 1 ? { ...item, is_checked: true } : item)]) {
    proposed.proposedValue = invalid
    expect((await approveStartingStep(parsed, vars)).pass).toBe(false)
    expect(requests).toEqual([])
  }
  proposed.proposedValue = items
  const approved = await approveStartingStep(parsed, vars)
  expect(approved.pass, approved.reason).toBe(true)
  expect(approved.metadata.savedStep.checklistItems).toEqual(checklist)
  expect(requests).toEqual(['GET /api/profile/export', `POST /api/ai/pending-operations/${pending.id}/confirm`,
    `POST /api/ai/pending-operations/${pending.id}/execute`, 'GET /api/profile/export'])
}

it.each(['en', 'pt-BR'].flatMap((locale) => ['smaller', 'smaller-legacy', 'save-task', 'save-checklist'].flatMap((family) => [true, false].map(supportsContext => [locale, family, supportsContext]))))(
  'uses the actual %s block action for %s with typed context %s', async (locale, family, supportsContext) => {
    const test = structuredClone(corpus.find((entry) => entry.metadata.id === `composition-one-small-step-${family}-${locale}`))
    test.vars.clientContext = { ...buildChatClientContext({ platform: 'web', locale }), ...test.vars.clientContext }
    test.vars.clientContextJson = JSON.stringify(test.vars.clientContext)
    test.vars.checklistHabitId = '22222222-2222-4222-8222-222222222222'
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
    const baseline = [{ id: test.vars.checklistHabitId, title: locale === 'en' ? 'Water' : 'Beber água',
      checklistItems: [{ text: 'Existing item', isChecked: true }, { text: 'Unchecked item', isChecked: false }] }]
    let starting
    vi.stubGlobal('fetch', async (url, options) => {
      if (new URL(url).pathname === '/api/profile/export') return Response.json({ habits: baseline })
      expect(new URL(url).pathname).toBe('/api/chat')
      const request = new Request(url, options)
      const form = await request.formData()
      expect(form.get('message')).toBe(test.vars.setup.input)
      expect(JSON.parse(form.get('history'))).toEqual([])
      expect(JSON.parse(form.get('clientContext')).partKinds).toContain('oneSmallStep')
      const response = startingResponse(locale, request.headers.get('x-orbit-request-id'), undefined, supportsContext)
      starting = response.parts[0].block
      return Response.json(response, { headers: { 'x-orbit-request-id': request.headers.get('x-orbit-request-id') } })
    })
    await prepareCorrection(test)
    expect(test.vars.previousStartingStep).toEqual(starting.suggestion)
    const action = starting.actions.find(({ id }) => id === test.vars.startingStepAction)
    const clientContext = JSON.parse(test.vars.clientContextJson)
    expect(clientContext.supportsStartingStepContext).toBe(true)
    if (family.startsWith('smaller') && supportsContext) expect(clientContext.previousStartingStep).toEqual(action.previousStep)
    else expect(clientContext).not.toHaveProperty('previousStartingStep')
    const suffix = family === 'save-checklist' ? locale === 'en' ? ' Use the habit "Water".' : ' Use o hábito "Beber água".' : ''
    expect(test.vars.input).toBe(action.message + suffix)
    expect(JSON.parse(test.vars.historyJson)).toEqual([{ role: 'user', content: test.vars.setup.input },
      { role: 'assistant', content: visibleAnswer({ parts: [{ type: 'block', kind: 'oneSmallStep', block: starting }] }, test.vars.clientContext) }])
    if (family === 'save-task') expect(test.vars.expectations.required[0].arguments).toMatchObject({ title: starting.suggestion.step, frequency_unit: 'OneTime' })
    if (family === 'save-checklist') {
      expect(test.vars.startingHabitBaseline).toEqual(baseline)
      await checkChecklistSave(test, starting, baseline)
    }
    if (family.startsWith('smaller')) {
      vi.stubGlobal('fetch', async (url, options) => {
        const request = new Request(url, options)
        const form = await request.formData()
        expect(form.get('message')).toBe(action.message)
        expect(JSON.parse(form.get('clientContext'))).toEqual(clientContext)
        const response = startingResponse(locale, request.headers.get('x-orbit-request-id'), undefined, supportsContext)
        if (family === 'smaller-legacy') {
          expect(JSON.parse(form.get('clientContext')).partKinds).toEqual([])
          response.aiMessage = response.parts[0].block.suggestion.step
          response.parts = [{ type: 'text', text: response.aiMessage }]
        }
        return Response.json(response,
          { headers: { 'x-orbit-request-id': request.headers.get('x-orbit-request-id') } })
      })
      const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config,
        transformResponse: new URL('../response.mjs', import.meta.url).href } })
      const sent = await provider.callApi(test.vars.input, { vars: { ...test.vars, evalRequestId: 'follow-up' } })
      expect(sent.error).toBeUndefined()
    }
    const grader = { id: () => 'offline-starting-step-grader', callApi: vi.fn(async () => ({
      output: JSON.stringify({ pass: true, score: 1, reason: 'Captured previous-step context.' }),
    })) }
    const grade = await promptfooAssertions.runAssertion({ prompt: test.vars.input,
      assertion: configuration.defaultTest.assert.find((assertion) => assertion.type === 'llm-rubric'),
      test: { ...test, options: { provider: grader } }, vars: test.vars,
      providerResponse: { output: { answer: 'Projected next answer' } },
    })
    expect(grade.pass).toBe(true)
    const gradingPrompt = grader.callApi.mock.calls[0][0]
    expect(gradingPrompt).toContain('Previous starting step:')
    expect(gradingPrompt).toContain(JSON.stringify(starting.suggestion).replaceAll('"', '\\"'))
  },
)

it('registers bilingual starting-step cases and the independent persistence assertion in the gate', () => {
  for (const family of ['one-small-step', 'one-small-step-smaller', 'one-small-step-smaller-legacy', 'one-small-step-save-task', 'one-small-step-save-checklist', 'one-small-step-legacy']) {
    expect(corpus.filter((entry) => entry.metadata.family === family).map((entry) => entry.metadata.locale).sort()).toEqual(['en', 'pt-BR'])
  }
  expect(configuration.evaluateOptions).toMatchObject({ repeat: 3, maxConcurrency: 1, cache: false })
  expect(configuration.defaultTest.assert).toContainEqual({ type: 'javascript', value: 'file://assertions.mjs:savedStep', metric: 'savedStep' })
})

it.each(['en', 'pt-BR'])('accepts a valid %s coaching block and retains the no-framing rule', (locale) => {
  const test = structuredClone(corpus.find((entry) => entry.metadata.id === `composition-coaching-advice-${locale}`))
  const attempts = JSON.parse(readFileSync(new URL('./fixtures/gate-eight.json', import.meta.url), 'utf8'))
  const recorded = attempts.find(({ caseId }) => caseId === test.metadata.id).toolCalls[0]
  const suggestion = recorded.resultStatus === 'Succeeded'
    ? { goal: recorded.arguments.title, step: recorded.arguments.suggested_sub_habits[0].title, language: locale }
    : { goal: 'Caminhar', step: 'Calçar os tênis de caminhada', language: locale }
  const response = startingResponse(locale, 'request', suggestion)
  const vars = { ...test.vars, evalRequestId: 'request', clientContext: { supportsParts: true, locale, partKinds: ['oneSmallStep'] } }
  const verdict = grades.composition(outputFor(response), { vars })
  expect(verdict.pass, verdict.reason).toBe(true)
  response.parts.push({ type: 'text', text: 'Extra framing.' })
  response.aiMessage = 'Extra framing.'
  expect(grades.composition(outputFor(response), { vars }).pass).toBe(false)
})

describe.each(['en', 'pt-BR'])('%s coaching after permitted reads', (locale) => {
  const scenario = corpus.find((entry) => entry.metadata.id === `composition-coaching-advice-${locale}`)
  const vars = { ...scenario.vars, evalRequestId: 'request',
    clientContext: { ...buildChatClientContext({ platform: 'web', locale }), ...scenario.vars.clientContext } }
  const parsedResponse = (response) => parseResponse(response, '', {
    response: { status: 200, headers: { 'x-orbit-request-id': 'request' } },
  })
  function readThenSuggestion() {
    const response = startingResponse(locale)
    response.evalTrace.toolCalls.unshift(toolCall('query_habits', { search: locale === 'en' ? 'Walk' : 'Caminhar' },
      'Succeeded', 'read-1', vars.clientContext))
    return response
  }

  it.each([1, 2])('accepts %i successful reads followed by one matching suggestion through all assertions', async (count) => {
    const response = readThenSuggestion()
    if (count === 2) response.evalTrace.toolCalls.unshift({ ...structuredClone(response.evalTrace.toolCalls[0]),
      id: 'read-2', result: { ...response.evalTrace.toolCalls[0].result, id: 'read-2' } })
    const output = parsedResponse(response)
    for (const grade of [grades.structural, grades.behavior, grades.composition]) {
      const verdict = await grade(output, { vars, test: { vars } })
      expect(verdict.pass, `${grade.name}: ${verdict.reason}`).toBe(true)
    }
    expect(output.trace.calls.map(({ name }) => name)).toEqual([...Array(count).fill('query_habits'), 'suggest_breakdown'])
  })

  it.each([
    ['extra suggestion', (response) => {
      const call = structuredClone(response.evalTrace.toolCalls[1])
      call.id = call.result.id = 'extra'
      response.evalTrace.toolCalls.push(call)
    }],
    ['failed extra suggestion', (response) => { response.evalTrace.toolCalls.push(toolCall('suggest_breakdown', {}, 'Failed', 'extra')) }],
    ['unrelated write', (response) => { response.evalTrace.toolCalls.unshift(toolCall('log_habit', { habit_id: 'walk' }, 'PendingConfirmation', 'write')) }],
    ['unpermitted read', (response) => { response.evalTrace.toolCalls.unshift(toolCall('get_profile', {}, 'Succeeded', 'profile')) }],
    ['failed read', (response) => { response.evalTrace.toolCalls[0].status = 'Failed' }],
    ['unsuccessful read result', (response) => { response.evalTrace.toolCalls[0].result.success = false }],
    ['read error', (response) => { response.evalTrace.toolCalls[0].result.error = 'Unavailable' }],
    ['malformed actions', (response) => { response.parts[0].block.actions[1].message = 'Save something else.' }],
    ['framing part', (response) => { response.parts.unshift({ type: 'text', text: 'Try this.' }) }],
    ['framing message', (response) => { response.aiMessage = 'Try this.' }],
    ['extra suggested step', (response) => { response.evalTrace.toolCalls[1].arguments.suggested_sub_habits.push({ title: 'Another step' }) }],
  ])('rejects %s even with a permitted read', (_, mutate) => {
    const response = readThenSuggestion()
    mutate(response)
    expect(grades.composition(parsedResponse(response), { vars }).pass).toBe(false)
  })

  it('rejects a write even if listed among allowed tools', () => {
    const response = readThenSuggestion()
    response.evalTrace.toolCalls.unshift(toolCall('log_habit', { habit_id: 'walk' }, 'Succeeded', 'write'))
    const expectations = { ...vars.expectations, allowed: [...vars.expectations.allowed, 'log_habit'] }
    expect(grades.composition(parsedResponse(response), { vars: { ...vars, expectations } }).pass).toBe(false)
  })

  it.each([false, true])('keeps the dedicated starting-step validator strict with legacy=%s', (legacy) => {
    const response = readThenSuggestion()
    if (legacy) {
      response.aiMessage = response.parts[0].block.suggestion.step
      response.parts = [{ type: 'text', text: response.aiMessage }]
    }
    const dedicated = varsFor(locale, legacy)
    dedicated.expectations.allowed.push('query_habits')
    expect(grades.behavior(parsedResponse(response), { vars: dedicated }).pass).toBe(true)
    expect(grades.composition(parsedResponse(response), { vars: dedicated }).pass).toBe(false)
  })
})
