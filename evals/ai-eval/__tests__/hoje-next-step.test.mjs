import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { assertions } from 'promptfoo'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'
import { composition } from '../assertions.mjs'
import { outcome, runOutcomeCase } from '../client-path.mjs'
import { fixtureHabitTitles } from '../fixtures/names.mjs'
import { chatResponse, preview, toolCall } from './fixtures/producer.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))

function scenario(locale) {
  const test = structuredClone(corpus.find((entry) => entry.metadata.id === `composition-hoje-next-step-${locale}`))
  Object.assign(test.vars, { evalRequestId: 'hoje-request', accountDate: '2026-10-24',
    fixtureHabitTitles: fixtureHabitTitles(test.metadata.fixture, locale),
    clientContext: buildChatClientContext({ platform: 'web', locale }) })
  return test
}

// Producer: DailySummaryReadProjection, StatusCards and DailySummaryResponse.
async function dailyAnswer(test, prose = '', extra = {}) {
  const call = toolCall('get_daily_summary', { generate_narrative: true }, 'Succeeded', 'summary-call', test.vars.clientContext)
  const card = { date: test.vars.accountDate, dateTo: test.vars.accountDate, due: 12, done: 1,
    completionRate: 8, overdueCount: 0, currentStreak: 0, surfaceId: 'today', totalRows: 12,
    rows: test.vars.fixtureHabitTitles.map((title, index) => ({ id: `habit-${index}`, title, emoji: null,
      depth: ['Meals', 'Water'].includes(title) ? 0 : 1, isBadHabit: false, status: title === 'Breakfast' ? 'done' : 'today' })) }
  call.result.payload = { summary: prose, insight: '', fromCache: false, readCard: card, sourceRevision: 'fixture-revision' }
  const response = { ...chatResponse(test.vars.evalRequestId, [call]), aiMessage: prose,
    parts: [...(prose ? [{ type: 'text', text: prose }] : []), { type: 'block', kind: 'daySummary', block: card }], ...extra }
  const requestId = test.vars.evalRequestId
  const trace = { requestId, timing: response.evalTrace.timing, modelCalls: 1,
    calls: [{ id: call.id, name: call.name, arguments: call.arguments, resultStatus: call.status, result: call.result }] }
  return (await runOutcomeCase(test.vars, { send: async () => ({ kind: 'final', response, requestId, responseRequestId: requestId, trace }) })).output
}

it.each(['en', 'pt-BR'])('grades %s sentence-first next steps through the outcome, composition and rubric helpers', async (locale) => {
  const test = scenario(locale)
  const prose = locale === 'en' ? 'Your lunch is the next step because it is the earliest pending meal.'
    : 'Seu almoço é o próximo passo por ser a primeira refeição pendente.'
  const output = await dailyAnswer(test, prose)
  expect(outcome(output, { vars: test.vars })).toMatchObject({ pass: true, reason: 'The read turn held no preview and no card.' })
  expect(composition(output, { vars: test.vars }).pass).toBe(true)
  expect(composition(await dailyAnswer(test), { vars: test.vars }).pass).toBe(true)
  const grader = { id: () => 'offline-hoje-rubric', callApi: vi.fn(async () => ({
    output: JSON.stringify({ pass: true, score: 1, reason: 'Captured rubric routing only.' }),
  })) }
  await assertions.runAssertion({ prompt: test.vars.input,
    assertion: configuration.defaultTest.assert.find((assertion) => assertion.type === 'llm-rubric'),
    test: { ...test, options: { provider: grader } }, vars: test.vars, providerResponse: { output } })
  const prompt = JSON.parse(grader.callApi.mock.calls[0][0]).map((message) => message.content).join('\n')
  expect(prompt).toContain(prose)
  expect(prompt).toContain('never Afternoon snack or Dinner')
  expect(prompt).toContain('Recommend Lunch or a Water item')
  expect(prompt).toContain('Showing later meals as pending rows is valid')
  expect(prompt).toContain('including a block-only')
  expect(prompt).toContain('Stored habit titles must remain verbatim')
  if (locale === 'pt-BR') {
    expect(prompt).toContain('without dropping raw English titles')
    expect(prompt).toContain('seu almoço')
  }
})

it('rejects a held change for the next-step case', async () => {
  const test = scenario('en')
  const output = await dailyAnswer(test, '', { pendingOperations: [preview('Lunch')] })
  expect(outcome(output, { vars: test.vars })).toMatchObject({ pass: false, reason: 'The read request held a preview of a change.' })
})
