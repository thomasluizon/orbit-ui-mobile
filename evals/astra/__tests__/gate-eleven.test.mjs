import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { assertions } from 'promptfoo'
import { behavior, composition } from '../assertions.mjs'
import { beforeEach as prepareAttempt } from '../hooks.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import parseResponse from '../response.mjs'
import { visibleAnswer } from '../visible-answer.mjs'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'
import { createChatStoreState } from '../../../packages/shared/src/stores/chat-store.ts'
import { buildRecentChatHistory } from '../../../packages/shared/src/utils/chat-history.ts'
import { habitMonthFixture } from '../../../packages/shared/src/test-support/habit-month-fixture.ts'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { chatResponse, toolCall, habitBlock } from './fixtures/producer.mjs'

vi.mock('../fixtures/reset.mjs', async (original) => ({ ...await original(), resetFixture: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const recorded = JSON.parse(readFileSync(new URL('./fixtures/gate-eleven.json', import.meta.url), 'utf8'))
const scenario = (family, locale = 'en') => structuredClone(corpus.find((entry) => entry.metadata.id === `composition-${family}-${locale}`))

async function gradingPrompt(test) {
  const grader = { id: () => 'offline-policy-grader', callApi: vi.fn(async () => ({
    output: JSON.stringify({ pass: true, score: 1, reason: 'Captured grading policy.' }),
  })) }
  await assertions.runAssertion({ prompt: test.vars.input,
    assertion: configuration.defaultTest.assert.find((assertion) => assertion.type === 'llm-rubric'),
    test: { ...test, options: { provider: grader } },
    vars: { ...test.vars, clientContext: buildChatClientContext({ platform: 'web', locale: test.metadata.locale }) },
    providerResponse: { output: { answer: recorded.featureHelp.answer } },
  })
  return JSON.parse(grader.callApi.mock.calls[0][0]).map((message) => message.content).join('\n')
}

it.each(['en', 'pt-BR'])('sends the opened proactive reminder through the app history shape in %s', async (locale) => {
  const test = scenario('proactive', locale)
  const input = locale === 'en' ? 'Show what is left for today from this reminder.'
    : 'Mostre o que falta para hoje a partir deste lembrete.'
  expect(test.vars.input).toBe(input)
  const reminder = locale === 'en' ? 'You have habits left for today. Want to see what is pending?'
    : 'Você ainda tem hábitos para hoje. Quer ver o que falta?'
  let state = createChatStoreState((patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) } })
  state.openProactiveItem({ id: 'reminder', text: reminder })
  state.addMessage({ id: 'follow-up', role: 'user', content: input })
  const history = buildRecentChatHistory(state.messages)
  expect(test.vars.history).toEqual(history)
  offlineCredentials()
  vi.stubGlobal('fetch', async (url) => new URL(url).pathname === '/health'
    ? Response.json({ status: 'Healthy', commit: null, checks: [] }) : refreshResponse())
  const prepared = (await prepareAttempt({ test })).test
  expect(prepared.vars.preconditionFailure).toBeUndefined()
  let sentHistory
  vi.stubGlobal('fetch', async (url, options) => {
    const form = await new Request(url, options).formData()
    sentHistory = JSON.parse(form.get('history'))
    expect(form.get('message')).toBe(input)
    return Response.json({ ...chatResponse(prepared.vars.evalRequestId), aiMessage: '', parts: [habitBlock] },
      { headers: { 'x-orbit-request-id': prepared.vars.evalRequestId } })
  })
  const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config,
    url: 'https://astra.invalid/api/chat', transformResponse: `file://${fileURLToPath(new URL('../response.mjs', import.meta.url))}` } })
  await provider.callApi(input, { vars: prepared.vars })
  expect(sentHistory).toEqual([{ role: 'assistant', content: reminder }])
})

it.each(['en', 'pt-BR'])('limits the streak rubric to model-written eligibility claims in %s', async (locale) => {
  const prompt = await gradingPrompt(scenario('streaks', locale))
  expect(prompt).toContain('Days before a habit existed are not eligible and must be neutral, never missed or unlogged')
  expect(prompt).toContain('Grade only model-written prose about the streak')
  expect(prompt).toContain('Do not grade the client-drawn day strip')
})

it.each(['en', 'pt-BR'])('allows only one grounded documentation-gap line with empty app_surfaces in %s', async (locale) => {
  const test = scenario('feature-help', locale)
  const sharedPolicy = configuration.defaultTest.assert.find((assertion) => assertion.type === 'llm-rubric').value
  expect(sharedPolicy).toContain('only when app_surfaces is an empty array')
  expect(test.vars.rubric).toContain('only when app_surfaces is an empty array')
  expect(test.vars.rubric).toContain('One plain line')
  expect(test.vars.rubric).toContain('Anything longer fails')
  const prompt = await gradingPrompt(test)
  expect(prompt).toContain('only when app_surfaces is an empty array')
  expect(prompt).toContain('A nonempty or missing app_surfaces does not permit this exception')
  expect(recorded.featureHelp.appSurfaces.length).toBeGreaterThan(0)
})

function gamificationAnswer(locale = 'en') {
  const test = scenario('achievements-level', locale)
  const clientContext = buildChatClientContext({ platform: 'web', locale })
  const achievement = { ...recorded.achievement.tool, id: 'getting_momentum' }
  const call = toolCall('get_gamification_overview', { include_achievements: true, include_streak: false },
    'Succeeded', 'call-1', clientContext)
  call.result.payload = { profile: null, achievements: { achievements: [achievement] }, streak: null }
  const response = { ...chatResponse('request', [call]), aiMessage: '', parts: [{ type: 'block', kind: 'gamification',
    block: { state: structuredClone(call.result.payload), surfaceId: 'achievements' } }] }
  const output = parseResponse(response, '', { response: { headers: { 'x-orbit-request-id': 'request' } } })
  output.answer = visibleAnswer(output.composition, clientContext)
  return { output, context: { vars: { ...test.vars, clientContext, evalRequestId: 'request' } } }
}

it('rejects the recorded rendered achievement rename independently of the rubric', () => {
  const { output, context } = gamificationAnswer()
  expect(JSON.parse(output.answer).parts[0].block.achievements[0].name).toBe(recorded.achievement.rendered.name)
  expect(composition(output, context)).toMatchObject({ pass: false, reason: 'Achievement name differs from the successful tool result.' })
})

it('accepts exact achievement names and rejects changed block names or missing successful evidence', () => {
  const { output, context } = gamificationAnswer()
  const achievement = output.trace.calls[0].result.payload.achievements.achievements[0]
  achievement.name = recorded.achievement.rendered.name
  output.composition.parts[0].block.state.achievements.achievements[0].name = achievement.name
  expect(composition(output, context).pass).toBe(true)
  output.composition.parts[0].block.state.achievements.achievements[0].name = achievement.name.toUpperCase()
  expect(composition(output, context).pass).toBe(false)
  output.composition.parts[0].block.state.achievements.achievements[0].name = achievement.name
  for (const calls of [[], [{ ...output.trace.calls[0], resultStatus: 'Failed' }]]) {
    expect(composition({ ...output, trace: { ...output.trace, calls } }, context).pass).toBe(false)
  }
})

it('preserves localized achievement names for Portuguese clients', () => {
  const { output, context } = gamificationAnswer('pt-BR')
  expect(composition(output, context).pass).toBe(true)
  expect(JSON.parse(output.answer).parts[0].block.achievements[0].name).not.toBe(recorded.achievement.tool.name)
})

it.each(['Failed', 'Succeeded', 'NotExecuted'])('reports an out-of-scope tool as called with its %s status', (status) => {
  const test = scenario('goals', 'pt-BR')
  const call = toolCall('ask', recorded.rejectedCall.arguments, status)
  if (status === 'Failed') call.result.error = recorded.rejectedCall.result.error
  const output = parseResponse(chatResponse('request', [call]), '', { response: { headers: { 'x-orbit-request-id': 'request' } } })
  expect(behavior(output, { vars: { ...test.vars, evalRequestId: 'request' } })).toMatchObject({
    pass: false, reason: `A tool was called outside the allowed set: ask (${status}).`,
  })
})

it.each(['en', 'pt-BR'])('rejects an extra goals block independently of the tool allow-list in %s', (locale) => {
  const test = scenario('goals', locale)
  const clientContext = buildChatClientContext({ platform: 'web', locale })
  const response = { ...chatResponse('request', [toolCall('query_goals', {})]), aiMessage: '',
    parts: [{ type: 'block', kind: 'goalList', block: { items: [] } }] }
  const output = parseResponse(response, '', { response: { headers: { 'x-orbit-request-id': 'request' } } })
  const context = { vars: { ...test.vars, clientContext, evalRequestId: 'request' } }
  expect(behavior(output, context).pass).toBe(true)
  expect(composition(output, context).pass).toBe(true)
  output.composition.parts.unshift(structuredClone(habitBlock))
  expect(behavior(output, context).pass).toBe(true)
  expect(composition(output, context)).toMatchObject({ pass: false, reason: 'Block kind outside the expected set: habitList.' })
  output.composition.parts[0] = { type: 'block', kind: 'habitMonth', block: habitMonthFixture }
  expect(composition(output, context).pass).toBe(false)
  context.vars.composition = { mode: 'data', blocks: [{ kind: 'goalList' }] }
  expect(composition(output, context).pass).toBe(false)
  context.vars.composition = { mode: 'data', kinds: ['goalList', 'habitMonth'] }
  expect(composition(output, context).pass).toBe(true)
  context.vars.composition = { mode: 'data' }
  expect(composition(output, context).pass).toBe(true)
  context.vars.composition = { mode: 'data', kinds: [] }
  expect(composition(output, context).pass).toBe(false)
})
