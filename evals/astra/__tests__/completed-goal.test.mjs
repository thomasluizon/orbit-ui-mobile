import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { seedOfferFixture } from '../fixtures/offers.mjs'
import { configureOffers } from '../offer-context.mjs'
import { proactiveOffers } from '../proactive-offers.mjs'
import { behavior } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const id = '22222222-2222-4222-8222-222222222222'
const today = '2031-06-10'
const read = { queryId: '33333333-3333-4333-8333-333333333333', queryFamily: 'query_goals', scope: {},
  revision: 'offline-revision', completeness: 'complete', refreshToken: 'offline-refresh', nextCursor: null,
  totalCount: 1, recovery: null, nextAction: null }

async function seeded(locale) {
  const test = structuredClone(corpus.find((entry) => entry.metadata.id === `offers-goal-on-track-completed-${locale}`))
  configureOffers(test)
  const goal = { id, title: locale === 'en' ? 'Consistent hydration' : 'Hidratação consistente',
    description: null, unit: 'sessions', targetValue: 10, currentValue: 5, deadline: null, status: 'Active' }
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://api.useorbit.org')
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname.slice(5)
    if (path === 'profile/export') return Response.json({ habits: [], goals: [goal], tags: [], checklistTemplates: [] })
    if (path === 'goals') return Response.json({ items: [{ ...goal, trackingStatus: 'completed' }], page: 1, pageSize: 50, totalCount: 1, totalPages: 1 })
    if (options.method === 'PUT' && path === `goals/${id}`) Object.assign(goal, JSON.parse(options.body))
    else if (options.method === 'PUT' && path === `goals/${id}/status`) goal.status = JSON.parse(options.body).status
    else throw new Error('Unexpected setup request.')
    return new Response(null, { status: 204 })
  })
  await seedOfferFixture(test, today)
  expect(test.vars.offerGoalTracking).toBe('completed')
  expect(test.vars.fixtureEvidence.goals).toEqual([expect.objectContaining({ id, status: 'Completed' })])
  return { test, goal }
}

// Producer: QueryGoalsTool filter, GoalListCardBuilder.BuildItem and GoalListCardItem.
function answer(test, goal, arguments_ = { include_completed: true }) {
  const item = { id: goal.id, title: goal.title, current: goal.currentValue, target: goal.targetValue,
    unit: goal.unit, deadline: goal.deadline, trackingStatus: null, progressPercentage: null,
    projectedCompletionDate: null, daysToDeadline: null, status: 'Completed', linkedHabits: [] }
  const call = toolCall('query_goals', arguments_, 'Succeeded', 'goals-read', test.vars.clientContext)
  call.result.payload = { items: [item], totalCount: 1, sourceRevision: 'offline-revision' }
  const response = { ...chatResponse('offline-request', [call]), aiMessage: null,
    parts: [{ type: 'block', kind: 'goalList', block: { items: [item], read } }] }
  const output = parseResponse(response, '', { response: { headers: { 'x-orbit-request-id': 'offline-request' } } })
  output.offerReadback = { pass: true }
  return { output, context: { vars: { ...test.vars, evalRequestId: 'offline-request' } } }
}

it.each(['en', 'pt-BR'])('asks for completed goals explicitly and grades the seeded completed goal in %s', async (locale) => {
  const { test, goal } = await seeded(locale)
  expect(test.vars.input).toMatch(locale === 'en' ? /completed/iu : /concluídas/iu)
  for (const arguments_ of [{ include_completed: true }, { status: 'Completed' }]) {
    const { output, context } = answer(test, goal, arguments_)
    expect(behavior(output, context).pass).toBe(true)
    expect(proactiveOffers(output, context).pass).toBe(true)
  }
  const { output, context } = answer(test, goal, { status: 'Active', include_completed: true })
  expect(behavior(output, context).pass).toBe(false)
})

it.each(['en', 'pt-BR'])('rejects an empty active-goal answer after successful completed-goal setup in %s', async (locale) => {
  const { test, goal } = await seeded(locale)
  const { output, context } = answer(test, goal, {})
  output.trace.calls[0].result.payload.items = []
  output.composition.parts[0].block.items = []
  expect({ tools: behavior(output, context).pass, offers: proactiveOffers(output, context).pass })
    .toEqual({ tools: false, offers: false })
})

it.each(['no-call', 'failed-call', 'wrong-filter', 'missing-result', 'wrong-result', 'missing-block', 'wrong-block', 'wrong-status'])(
  'requires the completed goal in the successful query and displayed goalList: %s', async (fault) => {
    const { test, goal } = await seeded('en')
    const { output, context } = answer(test, goal)
    if (fault === 'no-call') output.trace.calls = []
    if (fault === 'failed-call') output.trace.calls[0].resultStatus = 'Failed'
    if (fault === 'wrong-filter') output.trace.calls[0].arguments.status = 'Active'
    if (fault === 'missing-result') output.trace.calls[0].result.payload.items = []
    if (fault === 'wrong-result') output.trace.calls[0].result.payload.items = [{ ...output.trace.calls[0].result.payload.items[0], id: read.queryId }]
    if (fault === 'missing-block') output.composition.parts = []
    if (fault === 'wrong-block') output.composition.parts[0].block.items = [{ ...output.composition.parts[0].block.items[0], id: read.queryId }]
    if (fault === 'wrong-status') output.composition.parts[0].block.items[0].status = 'Active'
    expect(proactiveOffers(output, context).pass).toBe(false)
  },
)
