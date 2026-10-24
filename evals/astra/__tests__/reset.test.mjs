import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fixtureFetch } from './fixtures/public-api.mjs'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { beforeEach as prepareAttempt } from '../hooks.mjs'
import { resetFixture, runReset } from '../fixtures/reset.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'

const corpus = ['scenarios.yaml', 'composition-scenarios.yaml'].flatMap((file) => parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')))
let habits, goals, tags, templates, requests, pro, exhausted, capacity, email
beforeEach(() => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'pro-access')
  vi.stubEnv('ORBIT_EVAL_FREE_TOKEN', 'free-access')
  vi.stubEnv('ORBIT_EVAL_BUDGET_TOKEN', 'budget-access')
  habits = []; goals = []; tags = []; templates = []; requests = []; pro = true; exhausted = false; capacity = 100; email = 'thomaslrgregorio+orbit-eval-pro@gmail.com'
  vi.stubGlobal('fetch', fixtureFetch(() => ({ habits, goals, tags, templates, requests, pro, exhausted, capacity, email })))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const scenario = (fixture) => structuredClone(corpus.find((entry) => entry.metadata.fixture === fixture))
it.each([...new Set(corpus.map((entry) => entry.metadata.fixture))])('establishes %s exclusively through intercepted public routes', async (fixture) => {
  const test = scenario(fixture)
  pro = fixture !== 'free-at-limit'
  exhausted = fixture === 'budget-exhausted'
  await resetFixture(test)
  expect(requests.some(({ path }) => path.startsWith('chat') || path.startsWith('admin') || path === 'profile/reset')).toBe(false)
  const active = habits.filter((habit) => !habit.deleted)
  if (['empty', 'medical', 'budget-exhausted'].includes(fixture)) expect(active).toHaveLength(0)
  else if (fixture === 'composition-partial') expect(active).toHaveLength(51)
  else if (fixture === 'free-at-limit') expect(active).toHaveLength(capacity)
  else if (fixture === 'malicious-title') expect(active).toHaveLength(3)
  else expect(active).toHaveLength(2)
  if (fixture === 'existing-parents') expect(active.map((habit) => habit.title)).toEqual(['Post Lunch', 'Before Bed'])
  if (fixture === 'duplicate-titles') expect(active.map((habit) => habit.title)).toEqual(['Caminhada', 'Caminhada'])
  if (fixture.startsWith('composition')) { expect(goals).toHaveLength(1); expect(tags).toHaveLength(1); expect(templates).toHaveLength(1) }
  if (fixture === 'composition-logged') expect(active[0].logs.some((log) => log.date === '2026-10-24')).toBe(true)
  expect(requests.find(({ path }) => path === 'profile/language').body.language).toBe(test.metadata.locale)
})
it('preserves registered IDs across completion, skip, empty and restoration resets', async () => {
  await runReset('composition-writes-outcomes-en')
  const original = JSON.parse(readFileSync(process.env.ORBIT_EVAL_CREDENTIALS_FILE, 'utf8')).ORBIT_EVAL_TOKEN
  await resetFixture(scenario('skipped'))
  await resetFixture(scenario('empty'))
  await resetFixture(scenario('pro'))
  const restored = habits.filter((habit) => !habit.deleted)
  expect(restored.map((habit) => habit.id)).toEqual([original.habitId, original.secondHabitId])
  expect(restored.every((habit) => habit.logs.length === 0 && habit.dueDate === '2026-10-24')).toBe(true)
  expect(requests.filter(({ path, method }) => path === 'habits' && method === 'POST')).toHaveLength(2)
  expect(requests.some(({ path }) => path.endsWith('/restore'))).toBe(true)
})
it('does not cycle capacity roots or reset counters on repeated free attempts', async () => {
  pro = false; capacity = 7
  await resetFixture(scenario('free-at-limit'))
  const count = requests.length
  await resetFixture(scenario('free-at-limit'))
  expect(habits.filter((habit) => !habit.deleted)).toHaveLength(7)
  expect(requests.slice(count).some(({ method }) => method === 'DELETE')).toBe(false)
})
it('rejects a nonexhausted budget fixture without spending a chat message', async () => {
  await expect(resetFixture(scenario('budget-exhausted'))).rejects.toThrow('not exhausted')
  expect(requests).toHaveLength(3)
})
it('keeps old positive history and IDs intact when public undo cannot restore zero history', async () => {
  await resetFixture(scenario('pro'))
  habits[0].logs.push({ date: '2026-10-01', value: 1, note: null, createdAtUtc: '2026-10-01T00:00:00Z' })
  await expect(resetFixture(scenario('zero-history'))).rejects.toThrow('public undo window')
  expect(habits).toHaveLength(2)
})
it('stops after a failed public write', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ error: 'private', errorCode: 'NO_PERMISSION' }, { status: 403 }))
  await expect(resetFixture(scenario('pro'))).rejects.toThrow('HTTP 403')
})
it('rejects an unknown case before refreshing or writing anything', async () => {
  await expect(runReset('not-a-case')).rejects.toThrow('Unknown corpus')
  expect(requests).toEqual([])
})

it('rejects a partial HTTP-successful bulk and an ignored reset write', async () => {
  pro = false
  const intercepted = globalThis.fetch
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname === '/api/habits/bulk') return Response.json({ results: [{ index: 0, status: 'Failed', habitId: null, title: 'Capacity', error: 'Invalid', field: 'title', errorCode: 'VALIDATION_ERROR' }], applied_count: 0, total_matched: 1, skipped_count: 1, partial: true }, { status: 201 })
    return intercepted(url, options)
  })
  await expect(resetFixture(scenario('free-at-limit'))).rejects.toThrow('partial or malformed')
  pro = true
  vi.stubGlobal('fetch', intercepted)
  await resetFixture(scenario('pro'))
  habits[0].title = 'Wrong title'
  vi.stubGlobal('fetch', async (url, options) => options.method === 'PUT' && new URL(url).pathname.includes('/habits/')
    ? new Response(null, { status: 204 }) : intercepted(url, options))
  await expect(resetFixture(scenario('pro'))).rejects.toThrow('title readback')
})

it('drives refresh, default reset, independent readback and ID substitution through the real hook', async () => {
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'expired-access')
  const source = structuredClone(corpus.find((entry) => entry.metadata.id === 'single-log-en'))
  const { test } = await prepareAttempt({ test: source })
  expect(requests[0].path).toBe('auth/refresh')
  expect(requests.at(-1).path).toBe('profile/export')
  const account = JSON.parse(readFileSync(process.env.ORBIT_EVAL_CREDENTIALS_FILE, 'utf8')).ORBIT_EVAL_TOKEN
  expect(test.vars.input).toContain(account.habitId)
  expect(test.vars.expectations.required[0].arguments.habit_id).toBe(account.habitId)
  expect(test.vars.evalRequestId).toMatch(/^[0-9a-f-]{36}$/)
  expect(process.env.ORBIT_EVAL_TOKEN).toBe('pro-access')
})

it.each(['skipped', 'composition', 'composition-logged'])('restores occurrence cursors for repeated %s attempts', async (fixture) => {
  await resetFixture(scenario(fixture))
  const ids = habits.map((habit) => habit.id)
  await resetFixture(scenario(fixture))
  expect(habits.map((habit) => habit.id)).toEqual(ids)
  expect(habits.map((habit) => habit.dueDate)).toEqual([fixture === 'composition-logged' ? '2026-10-25' : '2026-10-24', fixture === 'skipped' ? '2026-10-25' : '2026-10-24'])
})
it('prepares composition again across a UTC day boundary without replacing IDs', async () => {
  await resetFixture(scenario('composition'))
  const ids = habits.map((habit) => habit.id)
  vi.setSystemTime(new Date('2026-10-25T00:01:00Z'))
  await resetFixture(scenario('composition'))
  expect(habits.map((habit) => habit.id)).toEqual(ids)
  expect(habits.map((habit) => habit.dueDate)).toEqual(['2026-10-25', '2026-10-25'])
  expect(habits[0].logs.map((log) => log.date).sort()).toEqual(['2026-10-19', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'])
})
it.each(['origin', 'email'])('refuses every reset write for an unsafe %s', async (unsafe) => {
  await resetFixture(scenario('pro'))
  requests.length = 0
  if (unsafe === 'origin') vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://api.useorbit.org')
  else email = 'thomaslrgregorio@gmail.com'
  await expect(resetFixture(scenario('empty'))).rejects.toThrow(/disposable|staging/)
  expect(requests.every((request) => request.method === 'GET')).toBe(true)
})
it('rejects an ignored occurrence cursor update on independent readback', async () => {
  await resetFixture(scenario('pro'))
  habits[0].dueDate = '2026-10-25'
  const intercepted = globalThis.fetch
  vi.stubGlobal('fetch', async (url, options) => options.method === 'PUT' && new URL(url).pathname.includes('/habits/')
    ? new Response(null, { status: 204 }) : intercepted(url, options))
  await expect(resetFixture(scenario('pro'))).rejects.toThrow(/occurrence/)
})
