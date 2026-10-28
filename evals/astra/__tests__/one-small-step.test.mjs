import { afterEach, expect, it, vi } from 'vitest'
import * as grades from '../assertions.mjs'
import { visibleAnswer } from '../visible-answer.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'

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

it('rejects a smaller step that changes the original activity or repeats the previous step', () => {
  const response = startingResponse()
  const vars = { ...varsFor(), previousStartingStep: structuredClone(response.parts[0].block.suggestion) }
  expect(grades.composition(outputFor(response), { vars }).pass).toBe(false)
  vars.previousStartingStep = { goal: 'Exercise', step: 'Walk outside', language: 'en' }
  expect(grades.composition(outputFor(response), { vars }).pass).toBe(false)
})

it('provides an approval and independent saved-step grader', () => {
  expect(grades.savedStep).toBeTypeOf('function')
})
