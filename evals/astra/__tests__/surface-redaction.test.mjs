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

// Producer: orbit-api DescribeFeatureTool FeatureHelpResult, AppSurface in ChatStreamEvent camelCase, frequencies.md.
function featureCall() {
  const call = toolCall('describe_feature', { feature_key: 'frequencies' }, 'Succeeded', 'feature', clientContext)
  return { ...call, resultStatus: 'Succeeded', result: { ...call.result, payload: { key: 'frequencies',
    display_name: 'Habit Frequencies', related_capabilities: ['habits.read', 'habits.write'], related_surfaces: ['today'],
    markdown: 'Frequencies set how often a habit repeats.', answer_scope: 'Use only documented steps.',
    app_surfaces: [{ id: 'today', displayName: 'Today', description: 'Shows the current day.',
      howToSteps: ['Open Today.'], notes: [], relatedCapabilityIds: ['habits.read', 'habits.daily-summary.read'],
      relatedControllerActionKeys: ['HabitsController.GetHabits'] }] } } }
}

// Producer: orbit-api QueryHabitsTool HabitListCard with HabitListCardItem rows.
function habitsCall() {
  const call = toolCall('query_habits', {}, 'Succeeded', 'habits', clientContext)
  return { ...call, resultStatus: 'Succeeded', result: { ...call.result, payload: { scope: 'today', date: today, totalCount: 1,
    items: [{ id: habitId, title: 'Read', emoji: null, depth: 0, isBadHabit: false, status: 'today', parentHabitId: null }] } } }
}

it('keeps the facts that repeat a public surface id while it withholds habit identities', () => {
  const output = { trace: { state: 'available', requestId, responseRequestId: requestId, calls: [featureCall(), habitsCall()] } }
  const evidence = groundingEvidence(output, { evalRequestId: requestId })
  const [feature, habits] = evidence.successfulTools.map((call) => call.result)
  expect(feature).toMatchObject({ related_surfaces: ['today'], related_capabilities: ['habits.read', 'habits.write'],
    app_surfaces: [{ displayName: 'Today', howToSteps: ['Open Today.'] }] })
  expect(feature.app_surfaces[0]).not.toHaveProperty('id')
  expect(habits).toMatchObject({ scope: 'today', items: [{ title: 'Read', status: 'today' }] })
  expect(habits.items[0]).not.toHaveProperty('id')
  expect(JSON.stringify(evidence)).not.toMatch(/44444444-4444/u)
})
