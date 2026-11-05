import { expect, it } from 'vitest'
import { attemptEvidence } from '../evidence.mjs'
import { groundingEvidence } from '../grading-input.mjs'
import { toolCall } from './fixtures/producer.mjs'

const clientContext = { supportsParts: true, supportsProactiveOffers: true }
const today = '2031-06-10'
const queryId = '33333333-3333-4333-8333-333333333333'
const habitId = '44444444-4444-4444-8444-444444444444'
const requestId = '55555555-5555-4555-8555-555555555555'
const read = { queryId, queryFamily: 'get_daily_summary', revision: 'revision-private', refreshToken: 'refresh-private',
  completeness: 'complete', nextCursor: 'cursor-private' }
const issuedOffer = { action: { offerKey: `smallStep:account:${today}`, kind: 'continueChat', label: 'Choose one small step',
  surface: null, prompt: 'Help me choose one small step I can take today.', entityId: null, date: today },
read, block: { date: today, surfaceId: 'today', rows: [], read }, kind: 'daySummary' }

function summaryCall() {
  const call = toolCall('get_daily_summary', { relative_period: 'today', generate_narrative: true }, 'Succeeded', 'summary', clientContext)
  return { ...call, resultStatus: 'Succeeded', result: { ...call.result,
    payload: { surfaceId: 'today', habitId, note: 'Start today.', cursor: 'cursor-private' } } }
}

it('keeps a public surface name in recorded arguments and prose while it withholds identities', () => {
  const entry = { testCase: { vars: { clientContext, offerFamily: 'dismissal', issuedOffer } },
    response: { output: { answer: 'Nothing is due today.', trace: { state: 'available', calls: [summaryCall()] } } } }
  const evidence = attemptEvidence(entry, { assertions: [] })
  expect(evidence.toolCalls[0].arguments.relative_period).toBe('today')
  expect(evidence.answer).toBe('Nothing is due today.')
  expect(evidence.issuedOffer.action.prompt).toBe('Help me choose one small step I can take today.')
  expect(evidence.issuedOffer.block.surfaceId).toBe('today')
  expect(JSON.stringify(evidence)).not.toMatch(/revision-private|refresh-private|cursor-private|33333333-3333/u)
})

it('keeps a public surface name in grading facts while it withholds identities', () => {
  const output = { trace: { state: 'available', requestId, responseRequestId: requestId, calls: [summaryCall()] } }
  const evidence = groundingEvidence(output, { evalRequestId: requestId })
  expect(evidence.successfulTools[0].result).toEqual({ surfaceId: 'today', note: 'Start today.' })
  expect(JSON.stringify(evidence)).not.toMatch(/cursor-private|44444444-4444/u)
})
