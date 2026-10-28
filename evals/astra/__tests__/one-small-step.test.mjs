import { afterEach, expect, it, vi } from 'vitest'
import * as grades from '../assertions.mjs'
import { visibleAnswer } from '../visible-answer.mjs'
import { visibleBlock } from '../visible-blocks.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { prepareCorrection } from '../setup.mjs'
import { assertions as promptfooAssertions } from 'promptfoo'

// Producer: OneSmallStepCard.Build and SuggestBreakdownTool at the catalog API commit.
export function startingResponse(locale = 'en', requestId = 'request') {
  const portuguese = locale === 'pt-BR'
  const suggestion = { goal: portuguese ? 'Estudar' : 'Study', step: portuguese ? 'Abrir o livro' : 'Open the book', language: locale }
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

it('rejects an unchanged step and leaves equivalent activity wording to the semantic grader', () => {
  const response = startingResponse()
  const vars = { ...varsFor(), previousStartingStep: structuredClone(response.parts[0].block.suggestion) }
  expect(grades.composition(outputFor(response), { vars }).pass).toBe(false)
  vars.previousStartingStep = { goal: 'Studying', step: 'Read ten pages', language: 'en' }
  expect(grades.composition(outputFor(response), { vars }).pass).toBe(true)
})

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
it.each(['en', 'pt-BR'].flatMap((locale) => ['smaller', 'save-task', 'save-checklist'].map((family) => [locale, family])))(
  'uses the actual %s block action for %s with history and verified setup', async (locale, family) => {
    const test = structuredClone(corpus.find((entry) => entry.metadata.id === `composition-one-small-step-${family}-${locale}`))
    test.vars.clientContextJson = JSON.stringify(test.vars.clientContext)
    test.vars.checklistHabitId = '22222222-2222-4222-8222-222222222222'
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
    const baseline = [{ id: test.vars.checklistHabitId, title: locale === 'en' ? 'Water' : 'Beber água',
      checklistItems: [{ text: 'Existing item', isChecked: true }] }]
    let starting
    vi.stubGlobal('fetch', async (url, options) => {
      if (new URL(url).pathname === '/api/profile/export') return Response.json({ habits: baseline })
      expect(new URL(url).pathname).toBe('/api/chat')
      const request = new Request(url, options)
      const form = await request.formData()
      expect(form.get('message')).toBe(test.vars.setup.input)
      expect(JSON.parse(form.get('history'))).toEqual([])
      expect(JSON.parse(form.get('clientContext')).partKinds).toContain('oneSmallStep')
      const response = startingResponse(locale, request.headers.get('x-orbit-request-id'))
      starting = response.parts[0].block
      return Response.json(response, { headers: { 'x-orbit-request-id': request.headers.get('x-orbit-request-id') } })
    })
    await prepareCorrection(test)
    expect(test.vars.previousStartingStep).toEqual(starting.suggestion)
    const action = starting.actions.find(({ id }) => id === test.vars.startingStepAction)
    const suffix = family === 'save-checklist' ? locale === 'en' ? ' Use the habit "Water".' : ' Use o hábito "Beber água".' : ''
    expect(test.vars.input).toBe(action.message + suffix)
    expect(JSON.parse(test.vars.historyJson)).toEqual([{ role: 'user', content: test.vars.setup.input },
      { role: 'assistant', content: visibleAnswer({ parts: [{ type: 'block', kind: 'oneSmallStep', block: starting }] }, test.vars.clientContext) }])
    if (family === 'save-task') expect(test.vars.expectations.required[0].arguments).toMatchObject({ title: starting.suggestion.step, frequency_unit: 'OneTime' })
    if (family === 'save-checklist') {
      expect(test.vars.startingHabitBaseline).toEqual(baseline)
      expect(test.vars.expectations.required[0].arguments).toEqual({ habit_id: test.vars.checklistHabitId,
        checklist_items: [{ text: 'Existing item', is_checked: true }, { text: starting.suggestion.step, is_checked: { optional: false } }] })
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

it('registers five bilingual starting-step cases and the independent persistence assertion in the gate', () => {
  for (const family of ['one-small-step', 'one-small-step-smaller', 'one-small-step-save-task', 'one-small-step-save-checklist', 'one-small-step-legacy']) {
    expect(corpus.filter((entry) => entry.metadata.family === family).map((entry) => entry.metadata.locale).sort()).toEqual(['en', 'pt-BR'])
  }
  expect(configuration.evaluateOptions).toMatchObject({ repeat: 3, maxConcurrency: 1, cache: false })
  expect(configuration.defaultTest.assert).toContainEqual({ type: 'javascript', value: 'file://assertions.mjs:savedStep', metric: 'savedStep' })
})
