import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { behavior } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'

const corpus = ['scenarios.yaml', 'composition-scenarios.yaml'].flatMap((file) =>
  parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')))
// Request-bound call arguments copied from the gate rerun artifacts for #1822.
const { accountDate, attempts } = JSON.parse(readFileSync(new URL('./fixtures/argument-drift.json', import.meta.url), 'utf8'))
const habitId = '11111111-1111-4111-8111-111111111111'

function check(caseId, calls) {
  const scenario = corpus.find((entry) => entry.metadata.id === caseId)
  const vars = JSON.parse(JSON.stringify(scenario.vars).replaceAll('{accountDate}', accountDate).replaceAll('{habitId}', habitId))
  const produced = chatResponse('request', calls.map(({ name, arguments: arguments_, resultStatus }, index) =>
    toolCall(name, arguments_, resultStatus, `call-${index}`, { supportsParts: true })))
  const output = parseResponse(produced, '', { response: { status: 200, headers: { 'x-orbit-request-id': 'request' } } })
  return behavior(output, { vars: { ...vars, evalRequestId: 'request' } })
}

it.each(attempts.filter(({ caseId }) => caseId !== 'grounding-en'))(
  'accepts the recorded $caseId attempt $repeat', ({ caseId, toolCalls }) => {
    expect(check(caseId, toolCalls)).toMatchObject({ pass: true })
  })

const todayCases = ['single-read-en', 'injection-record-pt', 'edge-skipped-pt',
  'composition-proactive-en', 'composition-proactive-pt-BR',
  'composition-writes-outcomes-en', 'composition-writes-outcomes-pt-BR']
it.each(todayCases)('accepts equivalent local-day selectors for %s and rejects other days', (caseId) => {
  for (const arguments_ of [{ relative_period: 'today' }, { date: 'today' }, { date: accountDate },
    { relative_period: 'today', date: accountDate }]) {
    expect(check(caseId, [{ name: 'query_habits', arguments: arguments_, resultStatus: 'Succeeded' }]))
      .toMatchObject({ pass: true })
  }
  for (const arguments_ of [{}, { date: '2026-10-26' }, { relative_period: 'yesterday' },
    { relative_period: 'yesterday', date: accountDate }]) {
    expect(check(caseId, [{ name: 'query_habits', arguments: arguments_, resultStatus: 'Succeeded' }]).pass).toBe(false)
  }
})

it.each(['en', 'pt-BR'])('accepts both schedule explanations in %s and rejects unrelated features', (locale) => {
  for (const feature_key of ['schedule-math', 'frequencies', 'gamification']) {
    expect(check(`composition-feature-help-${locale}`, [{ name: 'describe_feature',
      arguments: { feature_key }, resultStatus: 'Succeeded' }]).pass).toBe(feature_key !== 'gamification')
  }
})

it.each(attempts.filter(({ caseId }) => caseId === 'grounding-en'))(
  'keeps the incomplete metrics route strict for $caseId attempt $repeat', ({ caseId, toolCalls }) => {
    expect(check(caseId, toolCalls).pass).toBe(false)
  })

it('requires metrics for the requested habit', () => {
  for (const habit_id of [habitId, '22222222-2222-4222-8222-222222222222']) {
    expect(check('grounding-en', [{ name: 'get_habit_metrics', arguments: { habit_id }, resultStatus: 'Succeeded' }]).pass)
      .toBe(habit_id === habitId)
  }
})
