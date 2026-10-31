import { afterEach, expect, it, vi } from 'vitest'
import { seedOfferFixture } from '../fixtures/offers.mjs'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const today = '2031-06-10'
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']

function fixture(family, variant = 0, fault) {
  const state = { habits: ids.map((id, index) => ({ id, title: ['Water', 'Walk'][index],
    description: null, frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: today, isBadHabit: false,
    reminderEnabled: true, reminderTimes: [30], logs: [], checklistItems: [], emoji: null })),
  goals: [{ id: ids[0], title: 'Consistent hydration', description: null, unit: 'sessions', targetValue: 10, deadline: null, status: 'Active' }],
  tags: [], checklistTemplates: [] }
  const requests = []
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://api.useorbit.org')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname.slice(5)
    const body = options.body ? JSON.parse(options.body) : undefined
    requests.push({ path, method: options.method, body })
    if (path === 'profile/export') return Response.json(fault === 'collections' ? {} : state)
    if (path === 'profile') return Response.json({ hasGoogleConnection: variant === 1 })
    if (path === 'config') return Response.json({ features: { calendar_integration: { enabled: variant !== 2 } } })
    if (path === 'tags' || path === 'goals') {
      const collection = path === 'tags' ? state.tags : state.goals
      collection.push({ id: ids[1], ...body })
      return Response.json({ id: ids[1] }, { status: 201 })
    }
    const [resource, id, operation] = path.split('/')
    if (resource === 'tags') return new Response(null, { status: 204 })
    const item = state[resource].find((entry) => entry.id === id)
    if (options.method === 'GET') {
      if (resource === 'goals') {
        item.trackingStatus = item.status === 'Completed' ? 'completed' : !item.deadline ? 'no_deadline'
          : item.deadline < today ? 'behind' : item.deadline === '2031-06-13' ? 'at_risk' : 'on_track'
        if (fault === 'tracking') item.trackingStatus = 'unknown'
      }
      return Response.json(item)
    }
    if (operation === 'log') item.logs.push({ date: today, value: 1 })
    if (operation === 'skip' && fault !== 'skip') item.dueDate = '2031-06-11'
    if (operation === 'status') item.status = body.status
    if (options.method === 'PUT' && operation !== 'status' && fault !== 'fields') Object.assign(item, body)
    return new Response(null, { status: 204 })
  })
  const test = { metadata: { locale: 'en' }, vars: { credentialKey: 'ORBIT_EVAL_TOKEN', offerFamily: family, offerVariant: variant } }
  return { test, state, requests }
}

it.each([0, 1, 2])('seeds and reads back behind and safe goal variants %s', async (variant) => {
  for (const family of ['goal-behind', 'goal-on-track']) {
    const { test } = fixture(family, variant)
    await seedOfferFixture(test, today)
    expect(test.vars.offerBaseline.goals[0].trackingStatus).toBe(family === 'goal-behind'
      ? variant === 1 ? 'behind' : 'at_risk' : ['on_track', 'completed', 'no_deadline'][variant])
  }
})

it.each([0, 1, 2])('seeds reminder and equivalent-goal exclusions %s', async (variant) => {
  const reminders = fixture('reminder-gap', variant)
  await seedOfferFixture(reminders.test, today)
  expect(reminders.test.vars.offerBaseline.habits.every((habit) => habit.reminderEnabled === (variant === 1))).toBe(true)
  expect(reminders.test.vars.offerExclusion).toEqual(variant === 1 ? ['reminder'] : undefined)
  const goals = fixture('goal-gap', variant)
  await seedOfferFixture(goals.test, today)
  expect(goals.test.vars.offerExclusion).toEqual(variant === 1 ? ['aim'] : undefined)
  expect(goals.requests.some(({ path, method }) => path === 'goals' && method === 'POST')).toBe(variant === 1)
})

it.each([0, 1, 2])('uses actual disconnected, connected and locked calendar evidence %s', async (variant) => {
  const { test } = fixture('calendar-gap', variant)
  await seedOfferFixture(test, today)
  expect(test.vars.offerExclusion).toEqual(variant === 0 ? undefined : ['calendar'])
})

it.each(['resolved', 'stored', 'goal-link', 'empty'])('establishes the %s family state with public requests', async (family) => {
  const { test, requests } = fixture(family)
  await seedOfferFixture(test, today)
  expect(test.vars.offerRequireReadback).toBe(true)
  expect(requests.at(-1).path).toBe('profile/export')
  if (family === 'stored') expect(test.vars.offerBaseline.habits[0]).toMatchObject({ emoji: '💧', reminderEnabled: true, checklistItems: [{ text: 'Prepare water', isChecked: true }] })
  if (family === 'resolved') expect(test.vars.offerBaseline.habits[1]).toMatchObject({ isBadHabit: true, dueDate: '2031-06-11' })
  if (family === 'goal-link') expect(test.vars.offerBaseline.goals[0].title).toBe('Daily mobility')
})

it.each([['goal-behind', 'tracking'], ['stored', 'fields'], ['resolved', 'skip'], ['empty', 'collections']])(
  'rejects unproved %s setup with %s response', async (family, fault) => {
    const { test } = fixture(family, 0, fault)
    await expect(seedOfferFixture(test, today)).rejects.toThrow(/readback|collections/u)
  },
)
