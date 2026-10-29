import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { assertions } from 'promptfoo'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'
import { structural, behavior, composition } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { visibleAnswer } from '../visible-answer.mjs'
import { fixtureHabitTitles } from '../fixtures/names.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'

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
function dailyAnswer(test, prose = '') {
  const call = toolCall('get_daily_summary', { generate_narrative: true }, 'Succeeded', 'summary-call', test.vars.clientContext)
  const card = { date: test.vars.accountDate, dateTo: test.vars.accountDate, due: 12, done: 1,
    completionRate: 8, overdueCount: 0, currentStreak: 0, surfaceId: 'today', totalRows: 12,
    rows: test.vars.fixtureHabitTitles.map((title, index) => ({ id: `habit-${index}`, title, emoji: null,
      depth: ['Meals', 'Water'].includes(title) ? 0 : 1, isBadHabit: false, status: title === 'Breakfast' ? 'done' : 'today' })) }
  call.result.payload = { summary: prose, insight: '', fromCache: false, readCard: card, sourceRevision: 'fixture-revision' }
  const response = { ...chatResponse(test.vars.evalRequestId, [call]), aiMessage: prose,
    parts: [{ type: 'block', kind: 'daySummary', block: card }, ...(prose ? [{ type: 'text', text: prose }] : [])] }
  return parseResponse(response, '', { response: { status: 200, headers: { 'x-orbit-request-id': test.vars.evalRequestId } } })
}

it.each(['en', 'pt-BR'])('grades %s next steps through the existing tool, composition and rubric helpers', async (locale) => {
  const test = scenario(locale)
  const prose = locale === 'en' ? 'Start with lunch.' : 'Comece pelo seu almoço.'
  const output = dailyAnswer(test, prose)
  expect((await structural(output, { vars: test.vars, test })).pass).toBe(true)
  expect(behavior(output, { vars: test.vars }).pass).toBe(true)
  expect(composition(output, { vars: test.vars }).pass).toBe(true)
  expect(composition(dailyAnswer(test), { vars: test.vars }).pass).toBe(true)
  output.answer = visibleAnswer(output.composition, test.vars.clientContext)
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

it.each(['missing-tool', 'facts-only', 'failed-tool', 'wrong-request', 'write'])('rejects %s evidence for the next-step case', (mode) => {
  const test = scenario('en')
  const output = dailyAnswer(test)
  if (mode === 'missing-tool') output.trace.calls = []
  if (mode === 'facts-only') output.trace.calls[0].arguments.generate_narrative = false
  if (mode === 'failed-tool') output.trace.calls[0].resultStatus = 'Failed'
  if (mode === 'wrong-request') test.vars.evalRequestId = 'another-request'
  if (mode === 'write') {
    const call = toolCall('log_habit', { habit_id: 'lunch' }, 'PendingConfirmation', 'write-call', test.vars.clientContext)
    output.trace.calls.push({ ...call, resultStatus: call.status })
  }
  expect(behavior(output, { vars: test.vars }).pass).toBe(false)
})
