import { afterEach, expect, it, vi } from 'vitest'
import { resetFixture } from '../fixtures/reset.mjs'
import { fixtureFetch } from './fixtures/public-api.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each([undefined, '2031-06-07'])('restores overdue start and occurrence without replacing stable ids: %s', async (configured) => {
  offlineCredentials()
  vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2031-06-10T12:00:00Z'))
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://api.useorbit.org')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'pro-access')
  vi.stubEnv('ORBIT_EVAL_OVERDUE_DATE', configured)
  const state = { habits: [], goals: [], tags: [], templates: [], requests: [], pro: true,
    exhausted: false, capacity: 100, email: 'thomaslrgregorio+orbit-eval-pro@gmail.com' }
  vi.stubGlobal('fetch', fixtureFetch(() => state))
  const test = { metadata: { id: 'edge-overdue-en', locale: 'en', fixture: 'overdue' }, vars: { credentialKey: 'ORBIT_EVAL_TOKEN' } }
  await resetFixture(test, '2031-06-10')
  const ids = state.habits.map((habit) => habit.id)
  await resetFixture(test, '2031-06-10')
  expect(state.habits.map((habit) => habit.id)).toEqual(ids)
  expect(state.habits.map(({ startDate, dueDate }) => ({ startDate, dueDate })))
    .toEqual(ids.map(() => ({ startDate: configured ?? '2031-06-09', dueDate: configured ?? '2031-06-09' })))
  expect(state.requests.filter(({ path, method, body }) => method === 'PUT' && path.startsWith('habits/') && body.startDate)
    .every(({ body }) => body.startDate === (configured ?? '2031-06-09'))).toBe(true)
  expect(state.requests.some(({ path }) => path === 'chat')).toBe(false)
})
