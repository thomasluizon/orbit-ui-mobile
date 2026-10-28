import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fixtureFetch, retrospectiveResponse } from './fixtures/public-api.mjs'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { beforeAll as preflight, beforeEach as prepareAttempt } from '../hooks.mjs'
import { resetFixture, runReset } from '../fixtures/reset.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { CHAT_BLOCK_KINDS } from '../../../packages/shared/src/chat/block-kinds.ts'
import { summarize } from '../report.mjs'
import { behavior } from '../assertions.mjs'
import { toolCall } from './fixtures/producer.mjs'

const corpus = ['scenarios.yaml', 'composition-scenarios.yaml'].flatMap((file) => parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')))
let habits, goals, tags, templates, requests, pro, exhausted, capacity, email, unmetered
beforeEach(() => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'pro-access')
  vi.stubEnv('ORBIT_EVAL_FREE_TOKEN', 'free-access')
  vi.stubEnv('ORBIT_EVAL_BUDGET_TOKEN', 'budget-access')
  habits = []; goals = []; tags = []; templates = []; requests = []; pro = true; exhausted = false; capacity = 100; email = 'thomaslrgregorio+orbit-eval-pro@gmail.com'
  unmetered = true
  vi.stubGlobal('fetch', fixtureFetch(() => ({ habits, goals, tags, templates, requests, pro, exhausted, capacity, email, unmetered })))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const scenario = (fixture) => structuredClone(corpus.find((entry) => entry.metadata.fixture === fixture))
it.each(['en', 'pt-BR'])('seeds and reads back existing checked checklist items in %s', async (locale) => {
  const test = scenario('pro')
  test.metadata.fixture = 'starting-step-checklist'
  test.metadata.locale = locale
  await resetFixture(test)
  const active = habits.filter((habit) => !habit.deleted)
  expect(active[0].checklistItems).toEqual([
    { text: locale === 'en' ? 'Get a glass' : 'Pegar um copo', isChecked: true },
    { text: locale === 'en' ? 'Fill the glass' : 'Encher o copo', isChecked: false },
  ])
  expect(requests.at(-1).path).toBe('profile/export')
})
it.each(['en', 'pt-BR'])('seeds and independently verifies a cached retrospective before the stale %s attempt', async (locale) => {
  const source = structuredClone(corpus.find((entry) => entry.metadata.id === `composition-stale-${locale}`))
  const { test } = await prepareAttempt({ test: source })
  expect(test.vars).not.toHaveProperty('preconditionFailure')
  expect(requests.slice(-2).map(({ method, path }) => ({ method, path }))).toEqual([
    { method: 'GET', path: 'habits/retrospective' }, { method: 'GET', path: 'habits/retrospective' },
  ])
  expect(test.vars.composition.blocks).toEqual([{ kind: 'periodInsight', completeness: 'stale', recovery: 'refresh' }])
  expect(test.vars.expectations.required[0]).toMatchObject({ name: 'get_retrospective', result: { payload: retrospectiveResponse(true) } })
})
it.each(['uncached', 'missing-flag', 'empty-narrative', 'wrong-period', 'wrong-from', 'wrong-to', 'http-failure'])(
  'makes unverifiable stale setup incomplete and skips the case chat: %s', async (mode) => {
    const intercepted = globalThis.fetch
    let reads = 0
    vi.stubGlobal('fetch', async (url, options) => {
      if (new URL(url).pathname !== '/api/habits/retrospective') return intercepted(url, options)
      reads++
      const payload = retrospectiveResponse(true)
      if (mode === 'uncached') payload.fromCache = false
      if (mode === 'missing-flag') delete payload.fromCache
      if (mode === 'empty-narrative') payload.narrative.highlights = ''
      if (mode === 'wrong-period') payload.period = 'week'
      if (mode === 'wrong-from') payload.dateFrom = '2026-01-01'
      if (mode === 'wrong-to') payload.dateTo = '2026-01-31'
      return Response.json(payload, { status: mode === 'http-failure' ? 503 : 200 })
    })
    const { test } = await prepareAttempt({ test: scenario('composition-stale') })
    expect(reads).toBeGreaterThan(0)
    expect(test.vars.preconditionFailure).toMatch(/retrospective|HTTP 503/)
    const provider = new AstraHttpProvider({ config: { url: `${process.env.ORBIT_EVAL_BASE_URL}/api/chat` } })
    const response = await provider.callApi(test.vars.input, { vars: test.vars })
    expect(response.metadata.astraPreconditionFailure).toBe(true)
    const attempts = Array.from({ length: 3 }, () => ({ testCase: test, response, error: response.error, success: false }))
    expect(summarize(attempts, [test.metadata]).cases[0]).toMatchObject({ pass3: 'incomplete', unavailable: 3 })
    expect(requests.some(({ path }) => path === 'chat')).toBe(false)
  },
)
it('negotiates client-supported kinds and explicit starting-step API contract cases', async () => {
  const contexts = [...new Map(corpus.filter((entry) => entry.metadata.category === 'composition')
    .map((entry) => [JSON.stringify(entry.vars.clientContext), entry])).values()]
  for (const entry of contexts) {
    const source = scenario('composition')
    source.vars.clientContext = structuredClone(entry.vars.clientContext)
    source.metadata.locale = entry.vars.clientContext.locale
    const { test } = await prepareAttempt({ test: source })
    expect(test.vars).not.toHaveProperty('preconditionFailure')
    const client = JSON.parse(test.vars.clientContextJson)
    expect(client.partKinds.filter((kind) => !CHAT_BLOCK_KINDS.includes(kind))).toEqual([])
    if (entry.vars.clientContext.supportsParts && !entry.vars.clientContext.partKinds) {
      expect(client.partKinds).toEqual([...CHAT_BLOCK_KINDS])
    } else {
      expect(client.partKinds).toEqual(entry.vars.clientContext.partKinds)
    }
    expect(client.locale).toBe(entry.vars.clientContext.locale)
    expect(client.currentAppArea).toBe(entry.vars.clientContext.currentAppArea)
  }
})
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
  if (fixture === 'existing-parents') expect(active.map((habit) => habit.title)).toEqual(test.metadata.locale === 'pt-BR' ? ['Depois do almoço', 'Antes de dormir'] : ['Post Lunch', 'Before Bed'])
  if (fixture === 'duplicate-titles') expect(active.map((habit) => habit.title)).toEqual(['Caminhada', 'Caminhada'])
  if (fixture.startsWith('composition')) { expect(goals).toHaveLength(1); expect(tags).toHaveLength(1); expect(templates).toHaveLength(1) }
  if (fixture === 'composition-logged') expect(active[0].logs.some((log) => log.date === '2026-10-24')).toBe(true)
  expect(requests.find(({ path }) => path === 'profile/language').body.language).toBe(test.metadata.locale)
})
it.each([...new Set(corpus.map((entry) => entry.metadata.fixture))].flatMap((fixture) => ['en', 'pt-BR'].map((locale) => [fixture, locale])))(
  'advertises only habit titles the %s reset leaves in the %s account', async (fixture, locale) => {
    const source = scenario(fixture)
    source.metadata.locale = locale
    pro = fixture !== 'free-at-limit'
    exhausted = fixture === 'budget-exhausted'
    const { test } = await prepareAttempt({ test: source })
    const stored = habits.filter((habit) => !habit.deleted).map((habit) => habit.title)
    const unmatched = [...stored]
    for (const title of test.vars.fixtureHabitTitles) {
      expect(unmatched).toContain(title)
      unmatched.splice(unmatched.indexOf(title), 1)
    }
    if (['empty', 'medical', 'budget-exhausted'].includes(fixture)) expect(test.vars.fixtureHabitTitles).toEqual([])
  },
)
it('preserves registered IDs across completion, skip, empty and restoration resets', async () => {
  await runReset('composition-writes-outcomes-en')
  expect(requests.slice(0, 2).map(({ path }) => path)).toEqual(['health', 'auth/refresh'])
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
  expect(requests.slice(count).some(({ method, path }) => method === 'DELETE' && path.startsWith('habits/'))).toBe(false)
})
it('rejects budget setup beyond five ordinary requests without spending a chat message', async () => {
  await expect(resetFixture(scenario('budget-exhausted'))).rejects.toThrow('more than five')
  expect(requests.map(({ path }) => path)).toEqual(['eval/pending-operations', 'eval/pending-operations', 'profile', 'profile/timezone', 'profile/language'])
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
  expect(requests.slice(0, 2).map(({ path }) => path)).toEqual(['health', 'auth/refresh'])
  expect(requests.at(-1).path).toBe('profile/export')
  const account = JSON.parse(readFileSync(process.env.ORBIT_EVAL_CREDENTIALS_FILE, 'utf8')).ORBIT_EVAL_TOKEN
  expect(test.vars.input).toContain(account.habitId)
  expect(test.vars.expectations.required[0].arguments.habit_id).toBe(account.habitId)
  expect(test.vars.evalRequestId).toMatch(/^[0-9a-f-]{36}$/)
  expect(process.env.ORBIT_EVAL_TOKEN).toBe('pro-access')
})

it('lets an exhausted exempt ordinary fixture reach chat after one preflight config read', async () => {
  exhausted = true
  vi.stubEnv('ORBIT_EVAL_GRADER', 'offline')
  const source = scenario('pro')
  const intercepted = globalThis.fetch
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname !== '/api/chat') return intercepted(url, options)
    requests.push({ path: 'chat', method: options.method })
    return Response.json({ aiMessage: 'Hello.' })
  })
  await preflight({ suite: { tests: [source] } })
  const provider = new AstraHttpProvider({ config: {
    url: `${process.env.ORBIT_EVAL_BASE_URL}/api/chat`, method: 'POST', body: { message: '{{prompt}}' },
  } })
  for (let attempt = 0; attempt < 2; attempt++) {
    const { test } = await prepareAttempt({ test: structuredClone(source) })
    expect(test.vars).not.toHaveProperty('preconditionFailure')
    const response = await provider.callApi(`Hello ${attempt}.`, { vars: test.vars })
    expect(response.error).toBeUndefined()
  }
  expect(requests.filter(({ path }) => path === 'config')).toHaveLength(1)
  expect(requests.filter(({ path }) => path === 'chat')).toHaveLength(2)
})

it('keeps the exhausted-allowance refusal for a metered ordinary fixture', async () => {
  exhausted = true
  await expect(resetFixture(scenario('pro'), undefined, false)).rejects.toThrow('Fixture daily allowance is exhausted')
  expect(requests.some(({ path }) => path === 'chat')).toBe(false)
})

it('still requires profile and usage evidence for an exempt account', async () => {
  const intercepted = globalThis.fetch
  vi.stubGlobal('fetch', async (url, options) => new URL(url).pathname === '/api/profile'
    ? Response.json({ email, hasProAccess: true, aiMessagesUsed: null, aiMessagesLimit: 50 })
    : intercepted(url, options))
  await expect(resetFixture(scenario('pro'), undefined, true)).rejects.toThrow('lacks access or allowance evidence')
  expect(requests.map(({ path }) => path)).toEqual(['eval/pending-operations', 'eval/pending-operations'])
})

it('the standalone reset also reads the exemption before resetting an exhausted ordinary fixture', async () => {
  exhausted = true
  await runReset('single-read-en')
  expect(requests.slice(0, 3).map(({ path }) => path)).toEqual(['health', 'auth/refresh', 'config'])
  expect(requests.at(-1).path).toBe('profile/export')
})

it.each(['free-at-limit', 'budget-exhausted'])('keeps the metered %s fixture path after preflight', async (fixture) => {
  unmetered = false
  pro = fixture !== 'free-at-limit'
  exhausted = fixture === 'budget-exhausted'
  capacity = 7
  vi.stubEnv('ORBIT_EVAL_GRADER', 'offline')
  const source = scenario(fixture)
  await preflight({ suite: { tests: [source] } })
  const { test } = await prepareAttempt({ test: source })
  expect(test.vars).not.toHaveProperty('preconditionFailure')
  expect(requests.filter(({ path }) => path === 'config')).toHaveLength(1)
  if (fixture === 'free-at-limit') {
    expect(habits.filter((habit) => !habit.deleted)).toHaveLength(capacity)
    expect(requests.some(({ path, body }) => path === 'habits/bulk' && body.habits.length > capacity)).toBe(true)
  } else {
    expect(requests.filter(({ path }) => path === 'profile')).toHaveLength(1)
    expect(requests.some(({ path }) => path === 'chat')).toBe(false)
  }
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
it.each(['origin', 'email'])('refuses fixture writes for an unsafe %s', async (unsafe) => {
  await resetFixture(scenario('pro'))
  requests.length = 0
  if (unsafe === 'origin') vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://api.useorbit.org')
  else email = 'thomaslrgregorio@gmail.com'
  await expect(resetFixture(scenario('empty'))).rejects.toThrow(/disposable|staging/)
  expect(requests.every((request) => request.method === 'GET' || request.path === 'eval/pending-operations')).toBe(true)
})
it('rejects an ignored occurrence cursor update on independent readback', async () => {
  await resetFixture(scenario('pro'))
  habits[0].dueDate = '2026-10-25'
  const intercepted = globalThis.fetch
  vi.stubGlobal('fetch', async (url, options) => options.method === 'PUT' && new URL(url).pathname.includes('/habits/')
    ? new Response(null, { status: 204 }) : intercepted(url, options))
  await expect(resetFixture(scenario('pro'))).rejects.toThrow(/occurrence/)
})


it('restores Portuguese personal fixture text without changing stable identities', async () => {
  const english = scenario('composition-partial')
  english.metadata.locale = 'en'
  await resetFixture(english)
  const ids = habits.slice(0, 2).map((habit) => habit.id)
  const portuguese = structuredClone(english)
  portuguese.metadata.locale = 'pt-BR'
  await resetFixture(portuguese)
  const active = habits.filter((habit) => !habit.deleted)
  expect(active.slice(0, 2).map((habit) => habit.id)).toEqual(ids)
  expect(active.slice(0, 3).map((habit) => habit.title)).toEqual(['Beber água', 'Caminhada', 'Hábito adicional 1'])
  expect(tags[0].name).toBe('Saúde')
  expect(templates[0]).toMatchObject({ name: 'Manhã', items: ['Preparar água', 'Calçar os tênis'] })
  expect(goals[0]).toMatchObject({ title: 'Hidratação constante', unit: 'sessões' })
  await resetFixture(english)
  expect(habits.filter((habit) => !habit.deleted).slice(0, 2).map((habit) => habit.title)).toEqual(['Water', 'Walk'])
})
it.each(['en', 'pt-BR'])('clears the other locale notification history before seeding %s', async (locale) => {
  const test = scenario('composition')
  test.metadata.locale = locale
  await resetFixture(test)
  const language = requests.findIndex(({ path }) => path === 'profile/language')
  const cleared = requests.findIndex(({ path, method }) => path === 'notifications/all' && method === 'DELETE')
  const seeded = requests.findIndex(({ path }) => path.endsWith('/log'))
  expect(cleared).toBeGreaterThan(language)
  expect(cleared).toBeLessThan(seeded)
})
it('establishes allowance exhaustion through ordinary bounded requests and independently reads it back', async () => {
  let used = 2
  const intercepted = globalThis.fetch
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/api/profile') {
      requests.push({ path: 'profile', method: 'GET' })
      return Response.json({ email, hasProAccess: false, hasGoogleConnection: false, aiMessagesUsed: used, aiMessagesLimit: 5 })
    }
    if (path === '/api/chat') {
      requests.push({ path: 'chat', method: options.method, body: options.body })
      expect(options.body).toBeInstanceOf(FormData)
      expect(options.body.get('message')).toBe('Hello.')
      expect(options.headers).not.toHaveProperty('X-Orbit-Eval-Trace')
      used++
      return used === 4 ? Response.json({ error: 'Daily safety budget exhausted.', errorCode: 'AI_DAILY_BUDGET_EXCEEDED' }, { status: 400 }) : Response.json({ aiMessage: 'Hello.' })
    }
    return intercepted(url, options)
  })
  await resetFixture(scenario('budget-exhausted'))
  expect(used).toBe(5)
  expect(requests.filter(({ path }) => path === 'chat')).toHaveLength(3)
  expect(requests.at(-1).path).toBe('profile')
  expect(requests.some(({ path }) => /admin|reset/.test(path))).toBe(false)
})

it.each(['no-progress', 'unexpected-refusal', 'ignored-language-clear'])('stops unsafe or unverifiable setup: %s', async (mode) => {
  const intercepted = globalThis.fetch
  let chatRequests = 0
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/api/profile' && mode !== 'ignored-language-clear') return Response.json({ email,
      hasProAccess: false, hasGoogleConnection: false, aiMessagesUsed: 2, aiMessagesLimit: 5 })
    if (path === '/api/chat') {
      chatRequests++
      return Response.json({ error: 'Unavailable', errorCode: mode === 'no-progress' ? 'AI_DAILY_BUDGET_EXCEEDED' : 'UNRELATED_ERROR' }, { status: 400 })
    }
    if (path === '/api/notifications/all' && mode === 'ignored-language-clear') return Response.json({ error: 'Unavailable' }, { status: 403 })
    return intercepted(url, options)
  })
  const fixture = mode === 'ignored-language-clear' ? 'composition' : 'budget-exhausted'
  await expect(resetFixture(scenario(fixture))).rejects.toThrow(mode === 'no-progress'
    ? 'Daily safety budget prevented message allowance exhaustion. Setup cannot reset counters, rotate accounts or raise limits.' : 'HTTP')
  expect(chatRequests).toBe(mode === 'ignored-language-clear' ? 0 : 1)
})


it('rejects an HTTP-successful notification clear that leaves the other locale inbox intact', async () => {
  const intercepted = globalThis.fetch
  vi.stubGlobal('fetch', async (url, options) => new URL(url).pathname === '/api/notifications' && options.method === 'GET'
    ? Response.json({ items: [{ id: '11111111-1111-4111-8111-111111111111', title: 'You reached level 12', body: 'Level up',
      url: null, habitId: null, isRead: false, createdAtUtc: '2026-10-24T12:00:00Z' }], unreadCount: 1, totalCount: 1, sourceRevision: 'previous' })
    : intercepted(url, options))
  await expect(resetFixture(scenario('composition'))).rejects.toThrow('Notification fixture clear failed independent readback.')
  expect(requests.some(({ path }) => path.endsWith('/log'))).toBe(false)
})
it('adopts roots in the other locale before registering stable IDs', async () => {
  const english = scenario('pro')
  english.metadata.locale = 'en'
  await resetFixture(english)
  const ids = habits.map((habit) => habit.id)
  const { updateCredentials } = await import('../credentials.mjs')
  await updateCredentials((credentials) => {
    delete credentials.ORBIT_EVAL_TOKEN.habitId
    delete credentials.ORBIT_EVAL_TOKEN.secondHabitId
  })
  const portuguese = structuredClone(english)
  portuguese.metadata.locale = 'pt-BR'
  await resetFixture(portuguese)
  expect(habits.map((habit) => habit.id)).toEqual(ids)
  expect(habits.map((habit) => habit.title)).toEqual(['Beber água', 'Caminhada'])
})

it.each(['en', 'pt-BR'])('grades only the independently verified stale retrospective result in %s', async (locale) => {
  const source = structuredClone(corpus.find((entry) => entry.metadata.id === `composition-stale-${locale}`))
  const { test } = await prepareAttempt({ test: source })
  const supplied = { period: 'month', date_from: test.vars.expectations.required[0].result.payload.dateFrom,
    date_to: test.vars.accountDate, language: locale }
  const grade = (payload, argumentsOverride = {}) => {
    const { status, ...call } = toolCall('get_retrospective', { ...supplied, ...argumentsOverride })
    call.result.payload = payload
    return behavior({ trace: { state: 'available', requestId: test.vars.evalRequestId,
      responseRequestId: test.vars.evalRequestId, calls: [{ ...call, resultStatus: status }] } }, { vars: test.vars })
  }
  expect(grade(retrospectiveResponse(true)).pass).toBe(true)
  expect(grade(retrospectiveResponse(true), { date_from: '2026-01-01' }).pass).toBe(false)
  expect(grade(retrospectiveResponse(true), { date_to: '2026-01-31' }).pass).toBe(false)
  for (const patch of [{ fromCache: false }, { dateFrom: '2026-01-01' }, { dateTo: '2026-01-31' },
    { narrative: { highlights: 'Invented narrative', missed: '', trends: '', suggestion: '' } }]) {
    expect(grade({ ...retrospectiveResponse(true), ...patch }).pass).toBe(false)
  }
})
it('marks the Free capacity case incomplete before chat when its daily window is already used', async () => {
  pro = false; unmetered = false
  vi.stubEnv('ORBIT_EVAL_GRADER', 'offline')
  await preflight({ suite: { tests: [scenario('free-at-limit')] } })
  const intercepted = globalThis.fetch
  vi.stubGlobal('fetch', async (url, options) => new URL(url).pathname === '/api/profile'
    ? Response.json({ email, hasProAccess: false, hasGoogleConnection: false, aiMessagesUsed: 1, aiMessagesLimit: 50 })
    : intercepted(url, options))
  const { test } = await prepareAttempt({ test: scenario('free-at-limit') })
  expect(test.vars.preconditionFailure).toContain('fresh Free daily window')
  const response = await new AstraHttpProvider({ config: { url: `${process.env.ORBIT_EVAL_BASE_URL}/api/chat` } })
    .callApi(test.vars.input, { vars: test.vars })
  expect(response.metadata.astraPreconditionFailure).toBe(true)
  expect(summarize([{ testCase: test, response, error: response.error, success: false }], [test.metadata]).cases[0])
    .toMatchObject({ pass3: 'incomplete', unavailable: 1 })
  expect(requests.some(({ path }) => path === 'chat')).toBe(false)
})

it.each(['en', 'pt-BR'])('keeps the stated medical date before account today in a later year in %s', async (locale) => {
  vi.setSystemTime(new Date('2031-10-27T12:00:00Z'))
  const source = structuredClone(corpus.find((entry) => entry.metadata.id === `composition-medical-batch-${locale}`))
  const { test } = await prepareAttempt({ test: source })
  expect(test.vars).not.toHaveProperty('preconditionFailure')
  expect(test.vars.accountDate).toBe('2031-10-27')
  expect(test.vars.expectations.required[0].arguments.habits[0].due_date).toBe('2031-10-26')
  expect(test.vars.rubric).toContain('2031-10-26, even when it is before today')
  expect(test.vars.rubric).toContain('The account date is 2031-10-27')
})

it('preserves weekday positions when comparing the seeded cached metrics', async () => {
  const intercepted = globalThis.fetch
  const saved = retrospectiveResponse(true)
  saved.metrics.weeklyConsistency = [0, 25, 50, 75, 100, 0, 0]
  vi.stubGlobal('fetch', async (url, options) => new URL(url).pathname === '/api/habits/retrospective'
    ? Response.json(saved) : intercepted(url, options))
  const { test } = await prepareAttempt({ test: scenario('composition-stale') })
  const { status, ...call } = toolCall('get_retrospective', { period: 'month', date_from: saved.dateFrom, date_to: saved.dateTo })
  call.result.payload = structuredClone(saved)
  const output = { trace: { state: 'available', requestId: test.vars.evalRequestId,
    responseRequestId: test.vars.evalRequestId, calls: [{ ...call, resultStatus: status }] } }
  expect(behavior(output, { vars: test.vars }).pass).toBe(true)
  call.result.payload.metrics.weeklyConsistency.reverse()
  expect(behavior(output, { vars: test.vars }).pass).toBe(false)
})

it('requires a fresh Free window once and permits the case to consume its three attempts', async () => {
  pro = false; unmetered = false
  vi.stubEnv('ORBIT_EVAL_GRADER', 'offline')
  const source = scenario('free-at-limit')
  await preflight({ suite: { tests: [source] } })
  const intercepted = globalThis.fetch
  let used = 0
  vi.stubGlobal('fetch', async (url, options) => new URL(url).pathname === '/api/profile'
    ? Response.json({ email, hasProAccess: false, hasGoogleConnection: false, aiMessagesUsed: used, aiMessagesLimit: 3 })
    : intercepted(url, options))
  for (; used < 3; used++) {
    const { test } = await prepareAttempt({ test: structuredClone(source) })
    expect(test.vars.preconditionFailure).toBeUndefined()
  }
  const { test } = await prepareAttempt({ test: structuredClone(source) })
  expect(test.vars.preconditionFailure).toContain('fresh Free daily window')
})


it('isolates every repeat before fixture writes and restores completed and skipped occurrences', async () => {
  const source = structuredClone(corpus.find((entry) => entry.metadata.id === 'single-read-en'))
  const intercepted = globalThis.fetch
  let pending = 2
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname !== '/api/eval/pending-operations') return intercepted(url, options)
    requests.push({ path: 'eval/pending-operations', method: options.method })
    expect(options.headers.Authorization).toBe('Bearer pro-access')
    expect(options.headers['api-version']).toBe('2.0')
    expect(options.body).toBeUndefined()
    if (options.method === 'GET') return Response.json({ pendingCount: pending })
    const cancelledCount = pending
    pending = 0
    return Response.json({ cancelledCount })
  })
  for (let repeat = 0; repeat < 3; repeat++) {
    const start = requests.length
    const { test } = await prepareAttempt({ test: structuredClone(source) })
    expect(test.vars.preconditionFailure).toBeUndefined()
    const attemptRequests = requests.slice(start).filter(({ path }) => !['health', 'auth/refresh'].includes(path))
    expect(attemptRequests.slice(0, 3).map(({ method, path }) => `${method} ${path}`)).toEqual([
      'DELETE eval/pending-operations', 'GET eval/pending-operations', 'GET profile',
    ])
    expect(pending).toBe(0)
    expect(habits.every((habit) => habit.logs.length === 0 && habit.dueDate === test.vars.accountDate)).toBe(true)
    await intercepted(`${process.env.ORBIT_EVAL_BASE_URL}/api/habits/${habits[0].id}/log`, {
      method: 'POST', headers: { Authorization: 'Bearer pro-access', 'api-version': '2.0' }, body: JSON.stringify({ date: test.vars.accountDate }),
    })
    await intercepted(`${process.env.ORBIT_EVAL_BASE_URL}/api/habits/${habits[1].id}/skip`, {
      method: 'POST', headers: { Authorization: 'Bearer pro-access', 'api-version': '2.0' }, body: JSON.stringify({ date: test.vars.accountDate }),
    })
    pending = 3
  }
})

it.each(['403', 'nonzero', 'malformed-delete', 'malformed-get', 'transport', 'exhausted-conflicts'])(
  'marks failed isolation unavailable and sends no fixture or case writes: %s', async (mode) => {
    const intercepted = globalThis.fetch
    let cleanupCalls = 0
    vi.stubGlobal('fetch', async (url, options) => {
      if (new URL(url).pathname !== '/api/eval/pending-operations') return intercepted(url, options)
      cleanupCalls++
      if (mode === 'transport') throw new Error('Network unavailable')
      if (mode === '403' || mode === 'exhausted-conflicts') return new Response(null, { status: mode === '403' ? 403 : 409 })
      return Response.json(options.method === 'DELETE'
        ? (mode === 'malformed-delete' ? {} : { cancelledCount: 1 })
        : (mode === 'malformed-get' ? {} : { pendingCount: 1 }))
    })
    const { test } = await prepareAttempt({ test: scenario('pro') })
    expect(test.vars.preconditionFailure).toMatch(mode === '403' ? /403/ : /[Ii]solation|[Pp]ending|409/)
    expect(cleanupCalls).toBeGreaterThan(0)
    expect(cleanupCalls).toBeLessThanOrEqual(3)
    const response = await new AstraHttpProvider({ config: { url: `${process.env.ORBIT_EVAL_BASE_URL}/api/chat` } })
      .callApi('Read my habits', { vars: test.vars })
    expect(response.metadata.astraPreconditionFailure).toBe(true)
    expect(summarize([{ testCase: test, response, error: response.error, success: false }], [test.metadata]).cases[0])
      .toMatchObject({ pass3: 'incomplete', unavailable: 1, passed: 0 })
    expect(requests.every(({ path }) => ['health', 'auth/refresh'].includes(path))).toBe(true)
  },
)

it('retries cleanup conflicts within a bound then independently verifies zero pending operations', async () => {
  const intercepted = globalThis.fetch
  const methods = []
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname !== '/api/eval/pending-operations') return intercepted(url, options)
    methods.push(options.method)
    if (methods.length < 3) return new Response(null, { status: 409 })
    return Response.json(options.method === 'DELETE' ? { cancelledCount: 2 } : { pendingCount: 0 })
  })
  const { test } = await prepareAttempt({ test: scenario('pro') })
  expect(test.vars.preconditionFailure).toBeUndefined()
  expect(methods).toEqual(['DELETE', 'DELETE', 'DELETE', 'GET'])
})

it.each(['https://api.useorbit.org', 'https://orbit-api-staging-uqu2.onrender.com.evil.invalid'])(
  'refuses an attempt on another origin before any request: %s', async (origin) => {
    vi.stubEnv('ORBIT_EVAL_BASE_URL', origin)
    const request = vi.fn(async (url) => new URL(url).pathname === '/health'
      ? Response.json({ status: 'Healthy', commit: null, checks: [] })
      : Response.json({ token: 'pro-access', refreshToken: 'rotated-refresh' }))
    vi.stubGlobal('fetch', request)
    const { test } = await prepareAttempt({ test: scenario('pro') })
    expect(test.vars.preconditionFailure).toMatch(/staging/)
    expect(request).not.toHaveBeenCalled()
    await expect(resetFixture(scenario('pro'))).rejects.toThrow(/staging/)
    expect(request).not.toHaveBeenCalled()
  },
)
