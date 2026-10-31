import { afterEach, expect, it, vi } from 'vitest'
import { readOfferState, seedOfferFixture } from '../fixtures/offers.mjs'
import { seedStaleRetrospective } from '../fixtures/reset.mjs'
import AstraHttpProvider from '../http-provider.mjs'

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const today = '2031-06-10'
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']

function fixture(family, variant = 0, fault) {
  vi.useFakeTimers().setSystemTime(new Date('2031-06-10T12:00:00Z'))
  const profile = { timeZone: 'America/Sao_Paulo', hasGoogleConnection: variant === 1 }
  const accountDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: profile.timeZone }).format(new Date())
  const state = { habits: ids.map((id, index) => ({ id, title: ['Water', 'Walk'][index],
    description: null, frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: today, isBadHabit: false,
    reminderEnabled: true, reminderTimes: [30], logs: [], checklistItems: [], emoji: null, startDate: '2031-06-02' })),
  goals: [{ id: ids[0], title: 'Consistent hydration', description: null, unit: 'sessions', targetValue: 10, deadline: null, status: 'Active' }],
  tags: [], checklistTemplates: [] }
  const requests = []
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://api.useorbit.org')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname.slice(5)
    const body = options.body ? JSON.parse(options.body) : undefined
    requests.push({ path, method: options.method, body })
    if (path === 'profile/export') return Response.json(fault === 'collections' ? {} : { ...state,
      habits: state.habits.map((habit) => Object.fromEntries(['id', 'title', 'description', 'emoji', 'isBadHabit', 'isGeneral',
        'dueDate', 'endDate', 'frequencyUnit', 'frequencyQuantity', 'days', 'checklistItems', 'createdAtUtc', 'logs', 'intervalWeeks']
        .filter((key) => Object.hasOwn(habit, key)).map((key) => [key, habit[key]]))) })
    if (path === 'profile') return Response.json(profile)
    if (path === 'profile/timezone' && options.method === 'PUT') {
      if (!(fault === 'restore' && body.timeZone === 'America/Sao_Paulo')) profile.timeZone = body.timeZone
      return new Response(null, { status: 204 })
    }
    if (path === 'config') return Response.json({ features: { calendar_integration: { enabled: variant !== 2 } } })
    if ((path === 'tags' || path === 'goals') && options.method === 'POST') {
      const collection = path === 'tags' ? state.tags : state.goals
      collection.push({ id: ids[1], ...body })
      return Response.json({ id: ids[1] }, { status: 201 })
    }
    if (path === 'goals' && options.method === 'GET') {
      const items = state.goals.map((goal) => ({ ...goal, currentValue: 5,
        trackingStatus: fault === 'tracking' ? 'unknown' : goal.status === 'Completed' ? 'completed' : !goal.deadline ? 'no_deadline'
          : goal.deadline < accountDate() ? 'behind' : goal.deadline === '2031-06-13' && 5 / goal.targetValue < 0.5 ? 'at_risk' : 'on_track',
        ...(fault === 'deadline' ? { deadline: '2031-06-09' } : {}) }))
      return Response.json({ items: fault === 'goal-items' ? null : items, page: 1, pageSize: 50, totalCount: items.length, totalPages: fault === 'goal-pages' ? 2 : 1 })
    }
    const [resource, id, operation] = path.split('/')
    if (resource === 'tags') return new Response(null, { status: 204 })
    // UpdateGoalCommand rejects a deadline before the account's current date.
    if (resource === 'goals' && options.method === 'PUT' && !operation && body.deadline < accountDate()) {
      return new Response(null, { status: 400 })
    }
    const item = state[resource].find((entry) => entry.id === id)
    if (options.method === 'GET') {
      return Response.json(item)
    }
    if (operation === 'log') item.logs.push({ date: today, value: 1 })
    if (operation === 'skip' && fault !== 'skip') item.dueDate = '2031-06-11'
    if (operation === 'status') item.status = body.status
    if (options.method === 'PUT' && operation !== 'status' && fault !== 'fields') {
      // Habit.ApplyRequiredUpdates keeps the occurrence when the unchanged startDate is supplied.
      const previous = { ...item }
      const occurrence = resource === 'habits' ? { dueDate: body.startDate != null ? item.dueDate : body.dueDate ?? item.dueDate } : {}
      Object.assign(item, body, occurrence)
      if (['dueDate', 'reminderEnabled', 'reminderTimes'].includes(fault)) item[fault] = previous[fault]
    }
    return new Response(null, { status: 204 })
  })
  const test = { metadata: { locale: 'en' }, vars: { credentialKey: 'ORBIT_EVAL_TOKEN', offerFamily: family, offerVariant: variant } }
  return { test, state, requests, profile }
}

it.each([['goal-behind', 0], ['goal-behind', 2], ['goal-on-track', 0], ['goal-on-track', 1], ['goal-on-track', 2]])(
  'seeds and reads back the available %s goal variant %s', async (family, variant) => {
    const { test } = fixture(family, variant)
    await seedOfferFixture(test, today)
    expect(test.vars.offerGoalTracking).toBe(family === 'goal-behind' ? 'at_risk' : ['on_track', 'completed', 'no_deadline'][variant])
  },
)

it.each([
  ['2031-06-10T09:59:59.999Z', '2031-06-09', '2031-06-10'],
  ['2031-06-10T11:00:00.000Z', '2031-06-10', '2031-06-11'],
  ['2031-06-11T09:59:59.999Z', '2031-06-10', '2031-06-11'],
])(
  'seeds behind through accepted local-day writes at %s and restores after the attempt', async (instant, deadline, accountDate) => {
    const { test, requests, profile } = fixture('goal-behind', 1)
    vi.setSystemTime(new Date(instant))
    await seedOfferFixture(test, '1999-01-01')
    expect(test.vars.offerGoalTracking).toBe('behind')
    expect(test.vars.offerBaseline.goals[0].deadline).toBe(deadline)
    expect(test.vars.accountDate).toBe(accountDate)
    const provider = new AstraHttpProvider({ config: {} })
    provider.attempt = async () => {
      expect(profile.timeZone).toBe('Pacific/Kiritimati')
      return { output: 'completed' }
    }
    await expect(provider.callApi('', { vars: test.vars })).resolves.toEqual({ output: 'completed' })
    expect(profile.timeZone).toBe('America/Sao_Paulo')
    expect(requests.filter(({ path }) => path === 'profile/timezone').map(({ body }) => body.timeZone))
      .toEqual(['Pacific/Pago_Pago', 'Pacific/Kiritimati', 'America/Sao_Paulo'])
    expect(requests.at(-1)).toMatchObject({ path: 'profile', method: 'GET' })
  },
)

it.each(['2031-06-10T10:00:00.000Z', '2031-06-10T10:59:59.999Z'])(
  'leaves the behind fixture unavailable without writes outside its window at %s', async (instant) => {
    const { test, requests, profile } = fixture('goal-behind', 1)
    vi.setSystemTime(new Date(instant))
    await expect(seedOfferFixture(test, today)).rejects.toThrow('Goal-behind fixture is outside its local-date window.')
    expect(requests.every(({ method }) => method === 'GET')).toBe(true)
    expect(profile.timeZone).toBe('America/Sao_Paulo')
    expect(test.vars.offerRequireReadback).toBeUndefined()
  },
)

it.each(['tracking', 'deadline'])('restores the original timezone after a %s readback failure', async (fault) => {
  const { test, requests, profile } = fixture('goal-behind', 1, fault)
  await expect(seedOfferFixture(test, today)).rejects.toThrow('Offer goal tracking readback failed.')
  expect(profile.timeZone).toBe('America/Sao_Paulo')
  expect(requests.at(-1)).toMatchObject({ path: 'profile', method: 'GET' })
  expect(test.vars.offerRequireReadback).toBeUndefined()
})

it('restores the original timezone when the provider attempt throws', async () => {
  const { test, profile, requests } = fixture('goal-behind', 1)
  await seedOfferFixture(test, today)
  const provider = new AstraHttpProvider({ config: {} })
  provider.attempt = async () => { throw new Error('Attempt failed.') }
  await expect(provider.callApi('', { vars: test.vars })).rejects.toThrow('Attempt failed.')
  expect(profile.timeZone).toBe('America/Sao_Paulo')
  expect(requests.at(-1)).toMatchObject({ path: 'profile', method: 'GET' })
})

it('fails the attempt when restoring the timezone does not persist', async () => {
  const { test } = fixture('goal-behind', 1, 'restore')
  await seedOfferFixture(test, today)
  const provider = new AstraHttpProvider({ config: {} })
  provider.attempt = async () => ({ output: 'completed' })
  await expect(provider.callApi('', { vars: test.vars })).rejects.toThrow('Profile timezone readback did not match the requested timezone.')
})

it.each([0, 1, 2])('seeds reminder and equivalent-goal exclusions %s', async (variant) => {
  const reminders = fixture('reminder-gap', variant)
  await seedOfferFixture(reminders.test, today)
  expect(reminders.test.vars.offerBaseline.habits.every((habit) => habit.reminderEnabled === (variant === 1))).toBe(true)
  for (const habit of reminders.test.vars.offerBaseline.habits) {
    expect(habit).toMatchObject({ dueDate: '2031-06-04', startDate: '2031-06-02', reminderTimes: variant === 1 ? [30] : [] })
  }
  expect(reminders.requests.filter(({ method }) => method === 'PUT').every(({ body }) => !Object.hasOwn(body, 'startDate'))).toBe(true)
  expect(reminders.test.vars.offerExclusion).toEqual(variant === 1 ? ['reminder'] : undefined)
  const goals = fixture('goal-gap', variant)
  await seedOfferFixture(goals.test, today)
  expect(goals.test.vars.offerExclusion).toEqual(variant === 1 ? ['aim'] : undefined)
  expect(goals.requests.some(({ path, method }) => path === 'goals' && method === 'POST')).toBe(variant === 1)
})

it.each(['dueDate', 'reminderEnabled', 'reminderTimes'])('rejects reminder readback that did not persist %s', async (fault) => {
  const { test } = fixture('reminder-gap', 0, fault)
  await expect(seedOfferFixture(test, today)).rejects.toThrow('Offer fixture habit field readback failed.')
})

it.each([0, 1, 2])('uses actual disconnected, connected and locked calendar evidence %s', async (variant) => {
  const { test } = fixture('calendar-gap', variant)
  await seedOfferFixture(test, today)
  expect(test.vars.offerExclusion).toEqual(variant === 0 ? undefined : ['calendar'])
})

it.each(['resolved', 'stored', 'goal-link', 'empty'])('establishes the %s family state with public requests', async (family) => {
  const { test, requests, state } = fixture(family)
  if (family === 'empty') { state.habits = []; state.goals = [] }
  await seedOfferFixture(test, today)
  expect(test.vars.offerRequireReadback).toBe(true)
  const lastExport = requests.findLastIndex(({ path }) => path === 'profile/export')
  expect(requests.slice(lastExport + 1).map(({ path, method }) => ({ path, method })))
    .toEqual(state.habits.map((habit) => ({ path: `habits/${habit.id}`, method: 'GET' })))
  if (family === 'stored') expect(test.vars.offerBaseline.habits[0]).toMatchObject({ emoji: '💧', reminderEnabled: true, checklistItems: [{ text: 'Prepare water', isChecked: true }] })
  if (family === 'resolved') expect(test.vars.offerBaseline.habits[1]).toMatchObject({ isBadHabit: true, dueDate: '2031-06-11' })
  if (family === 'goal-link') expect(test.vars.offerBaseline.goals[0].title).toBe('Daily mobility')
})

it.each([['goal-behind', 'tracking'], ['goal-behind', 'goal-items'], ['goal-behind', 'goal-pages'], ['stored', 'fields'], ['resolved', 'skip'], ['empty', 'collections']])(
  'rejects unproved %s setup with %s response', async (family, fault) => {
    const { test } = fixture(family, 0, fault)
    await expect(seedOfferFixture(test, today)).rejects.toThrow(['goal-items', 'goal-pages'].includes(fault)
      ? 'complete goal list' : /readback|collections/u)
  },
)

it.each([0, 1])('caches the requested weekly retrospective against account week start %s', async (weekStart) => {
  const from = weekStart === 0 ? '2031-06-08' : '2031-06-09'
  const payload = { period: 'week', dateFrom: from, dateTo: today, fromCache: true,
    narrative: { highlights: 'A saved week.', missed: '', trends: '', suggestion: '' } }
  const paths = []
  const api = async (_method, path) => { paths.push(path); return { payload } }
  await expect(seedStaleRetrospective(api, today, 'en', 'week', weekStart)).resolves.toEqual(payload)
  expect(paths).toEqual(['habits/retrospective?period=week&language=en', 'habits/retrospective?period=week&language=en'])
  await expect(seedStaleRetrospective(api, today, 'en', 'week', 2)).rejects.toThrow('Stale fixture')
  await expect(seedStaleRetrospective(api, today, 'en', 'week', undefined)).rejects.toThrow('week start')
})

it('compares persisted reminder settings while excluding the computed delivery clock', async () => {
  let reads = 0
  let reminderTimes = [30]
  const exported = { habits: [{ id: ids[0], title: 'Water' }], goals: [], tags: [], checklistTemplates: [] }
  const api = async (_method, path) => path === 'profile/export' ? { payload: exported } : { payload: {
    id: ids[0], title: 'Water', reminderEnabled: true, reminderTimes,
    nextReminderAtUtc: `2031-06-10T${String(8 + reads++).padStart(2, '0')}:00:00Z`,
    children: [{ id: ids[1], title: 'Refill', reminderEnabled: false, nextReminderAtUtc: `2031-06-10T${String(8 + reads).padStart(2, '0')}:00:00Z` }],
  } }
  const original = await readOfferState(api)
  expect(await readOfferState(api)).toEqual(original)
  expect(original.habits[0]).not.toHaveProperty('nextReminderAtUtc')
  expect(original.habits[0].children[0]).not.toHaveProperty('nextReminderAtUtc')
  reminderTimes = [60]
  expect(await readOfferState(api)).not.toEqual(original)
})
