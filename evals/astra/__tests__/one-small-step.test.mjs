import { afterEach, describe, expect, it, vi } from 'vitest'
import * as grades from '../assertions.mjs'
import { visibleAnswer } from '../visible-answer.mjs'
import { visibleBlock } from '../visible-blocks.mjs'
import { toolCall } from './fixtures/producer.mjs'
import { startingResponse } from './fixtures/starting-step.mjs'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import parseResponse from '../response.mjs'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'

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

  it.each([1, 2])('accepts %i successful reads followed by one matching suggestion', async (count) => {
    const response = readThenSuggestion()
    if (count === 2) response.evalTrace.toolCalls.unshift({ ...structuredClone(response.evalTrace.toolCalls[0]),
      id: 'read-2', result: { ...response.evalTrace.toolCalls[0].result, id: 'read-2' } })
    const output = parsedResponse(response)
    expect(vars.outcome).toEqual({ read: true })
    expect(grades.composition(output, { vars })).toMatchObject({ pass: true, reason: 'One starting step with its server actions and no prose.' })
    expect(output.trace.calls.map(({ name }) => name)).toEqual([...Array(count).fill('query_habits'), 'suggest_breakdown'])
  })

  it.each([
    ['malformed actions', (response) => { response.parts[0].block.actions[1].message = 'Save something else.' }],
    ['framing part', (response) => { response.parts.unshift({ type: 'text', text: 'Try this.' }) }],
    ['framing message', (response) => { response.aiMessage = 'Try this.' }],
    ['a held change', (response) => { response.pendingOperations = [{ id: 'held' }] }],
    ['a second block', (response) => { response.parts.push(structuredClone(response.parts[0])) }],
  ])('rejects %s even with a permitted read', (_, mutate) => {
    const response = readThenSuggestion()
    mutate(response)
    expect(grades.composition(parsedResponse(response), { vars }).pass).toBe(false)
  })

  it('reads the starting step from the reply alone and grades no tool name of the trace', () => {
    const response = readThenSuggestion()
    response.evalTrace.toolCalls.unshift(toolCall('get_profile', {}, 'Succeeded', 'profile'))
    response.evalTrace.toolCalls.at(-1).name = 'bulk_create_habits'
    expect(grades.composition(parsedResponse(response), { vars }).pass).toBe(true)
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
