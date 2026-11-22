import { evalSnapshot } from './fixtures/eval-snapshot.mjs'
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { seedOfferFixture } from '../fixtures/offers.mjs'
import { configureOffers } from '../offer-context.mjs'
import { proactiveOffers } from '../proactive-offers.mjs'

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
    if (path === 'eval/snapshot') return Response.json(evalSnapshot({ habits: [], goals: [goal], tags: [], checklistTemplates: [] }))
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

// Producer: GoalListCardBuilder.BuildItem and GoalListCardItem.
function answer(test, goal) {
  const item = { id: goal.id, title: goal.title, current: goal.currentValue, target: goal.targetValue,
    unit: goal.unit, deadline: goal.deadline, trackingStatus: null, progressPercentage: null,
    projectedCompletionDate: null, daysToDeadline: null, status: 'Completed', linkedHabits: [] }
  const output = { answer: '', composition: { aiMessage: null, parts: [{ type: 'block', kind: 'goalList', block: { items: [item], read } }] },
    offerReadback: { pass: true } }
  return { output, context: { vars: { ...test.vars, evalRequestId: 'offline-request' } } }
}

it.each(['en', 'pt-BR'])('asks for completed goals explicitly and grades the seeded completed goal in %s', async (locale) => {
  const { test, goal } = await seeded(locale)
  expect(test.vars.input).toMatch(locale === 'en' ? /completed/iu : /concluídas/iu)
  expect(test.vars.expectations).toBeUndefined()
  const { output, context } = answer(test, goal)
  expect(proactiveOffers(output, context)).toMatchObject({ pass: true })
})

it.each(['en', 'pt-BR'])('rejects an empty active-goal answer after successful completed-goal setup in %s', async (locale) => {
  const { test, goal } = await seeded(locale)
  const { output, context } = answer(test, goal)
  output.composition.parts[0].block.items = []
  expect(proactiveOffers(output, context)).toMatchObject({ pass: false,
    reason: 'Completed-goal exclusion requires its seeded goal in the displayed goalList.' })
})

it.each(['missing-block', 'wrong-block', 'wrong-status', 'wrong-progress', 'wrong-target', 'wrong-deadline'])(
  'requires the seeded completed goal with its figures in the displayed goalList: %s', async (fault) => {
    const { test, goal } = await seeded('en')
    const { output, context } = answer(test, goal)
    const row = output.composition.parts[0].block.items[0]
    if (fault === 'missing-block') output.composition.parts = []
    if (fault === 'wrong-block') row.id = read.queryId
    if (fault === 'wrong-status') row.status = 'Active'
    if (fault === 'wrong-progress') row.current = goal.currentValue + 1
    if (fault === 'wrong-target') row.target = goal.targetValue + 1
    if (fault === 'wrong-deadline') row.deadline = '2031-01-01'
    expect(proactiveOffers(output, context).pass).toBe(false)
  },
)
