import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { assertions } from 'promptfoo'
import { proactiveOffers } from '../proactive-offers.mjs'

const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })

it.each(['en', 'pt-BR'])('sends one-time General semantics to the actual rubric for both client modes in %s', async (locale) => {
  const test = corpus.find((entry) => entry.metadata.id === `offers-repeat-${locale}`)
  for (const supportsParts of [true, false]) {
    const grader = { id: () => 'offline-policy-grader', callApi: vi.fn(async () => ({
      output: JSON.stringify({ pass: true, score: 1, reason: 'Captured policy only.' }),
    })) }
    await assertions.runAssertion({ prompt: test.vars.input,
      assertion: configuration.defaultTest.assert.find((assertion) => assertion.type === 'llm-rubric'),
      test: { ...test, options: { provider: grader } },
      vars: { ...test.vars, clientContext: { ...test.vars.clientContext, supportsParts, partKinds: ['habitList'] } },
      providerResponse: { output: { answer: 'A task preview.' } } })
    const prompt = JSON.parse(grader.callApi.mock.calls[0][0]).map((message) => message.content).join('\n')
    expect(prompt).toContain('one-time task with no date')
    expect(prompt).toContain('only unlogging reopens it')
    expect(prompt).toContain('Reads use stored isCompleted')
    expect(prompt).toContain('A second completion must be refused with the completed one-time task error')
    expect(prompt).toContain('Never promise a daily reset or repeated completion')
  }
})

it('uses stored completion to exclude a completed General task even when its log is from yesterday', () => {
  const id = '22222222-2222-4222-8222-222222222222'
  const date = '2031-06-10'
  const habit = { id, title: 'Read a book', isGeneral: true, isCompleted: true, isBadHabit: false,
    logs: [{ date: '2031-06-09', value: 1 }] }
  const action = { offerKey: `log:${id}:${date}`, kind: 'preparePreview', label: 'Complete this task',
    prompt: 'Complete Read a book.', surface: null, entityId: id, date }
  const output = { trace: { calls: [] }, composition: { parts: [{ type: 'block', kind: 'habitList', block: { date,
    items: [{ id, title: habit.title, status: 'today', isBadHabit: false }],
    read: { queryId: '33333333-3333-4333-8333-333333333333', queryFamily: 'query_habits', scope: {},
      revision: 'offline-revision', refreshToken: 'offline-refresh', completeness: 'complete', recovery: null, nextAction: action },
  } }] } }
  const vars = { offerFamily: 'due-log', accountDate: date, clientContext: { supportsProactiveOffers: true },
    composition: { mode: 'data' }, fixtureEvidence: { habits: [habit] } }
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
  habit.isCompleted = false
  expect(proactiveOffers(output, { vars }).pass).toBe(true)
})
