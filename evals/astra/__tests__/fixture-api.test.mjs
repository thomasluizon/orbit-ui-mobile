import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { publicApi } from '../fixtures/api.mjs'

const success = () => new Response(null, { status: 204 })
// Producer: DistributedRateLimitFilter.OnActionExecutionAsync rejects before the controller.
const limited = (retryAfter = '15') => new Response(null, {
  status: 429, headers: retryAfter === null ? {} : { 'Retry-After': retryAfter },
})
const outcome = (promise) => promise.then((value) => ({ value }), (error) => ({ error: error.message }))
const api = (...args) => publicApi('ORBIT_EVAL_TOKEN')(...args)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://fixture.invalid')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'fixture-token')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it.each(['GET', 'DELETE', 'POST', 'PUT', 'PATCH'])('waits for 429 then repeats the same %s request', async (method) => {
  const request = vi.fn().mockResolvedValueOnce(limited()).mockImplementation(success)
  vi.stubGlobal('fetch', request)
  const body = ['GET', 'DELETE'].includes(method) ? undefined : { title: 'Fixture' }
  const pending = outcome(api(method, 'eval/pending-operations', body))
  await vi.advanceTimersByTimeAsync(14999)
  expect(request).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(await pending).toEqual({ value: { status: 204, payload: null } })
  expect(request).toHaveBeenCalledTimes(2)
  const [url, options] = request.mock.calls[0]
  const [retryUrl, retryOptions] = request.mock.calls[1]
  expect(url).toBe('https://fixture.invalid/api/eval/pending-operations')
  expect(retryUrl).toBe(url)
  expect(options).toMatchObject({ method, redirect: 'error', headers: {
    Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json', 'api-version': '2.0',
  } })
  expect(retryOptions).toEqual({ ...options, signal: retryOptions.signal })
  expect(retryOptions.signal).not.toBe(options.signal)
  expect(options.body).toBe(body === undefined ? undefined : JSON.stringify(body))
})

it.each([
  ['0', 0], ['1', 1000], ['65', 65000], ['66', 65000], ['9999999999999999999999', 65000],
  [null, 60000], ['', 60000], ['invalid', 60000], ['-1', 60000], ['1.5', 60000],
  ['Wed, 21 Oct 2015 07:28:00 GMT', 60000],
])('uses a bounded whole-second delay for Retry-After %s', async (header, milliseconds) => {
  const request = vi.fn().mockResolvedValueOnce(limited(header)).mockImplementation(success)
  vi.stubGlobal('fetch', request)
  const pending = outcome(api('DELETE', 'eval/pending-operations'))
  if (milliseconds > 0) {
    await vi.advanceTimersByTimeAsync(milliseconds - 1)
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
  } else await vi.runAllTimersAsync()
  expect(await pending).toEqual({ value: { status: 204, payload: null } })
  expect(request).toHaveBeenCalledTimes(2)
})

it.each([true, false])('allows at most three 429 waits, recovery: %s', async (recover) => {
  const request = vi.fn().mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited())
    .mockResolvedValueOnce(limited()).mockImplementation(() => recover ? success() : limited())
  vi.stubGlobal('fetch', request)
  const pending = outcome(api('DELETE', 'eval/pending-operations'))
  await vi.advanceTimersByTimeAsync(44999)
  expect(request).toHaveBeenCalledTimes(3)
  await vi.advanceTimersByTimeAsync(1)
  expect(await pending).toEqual(recover ? { value: { status: 204, payload: null } }
    : { error: 'Fixture API DELETE failed with HTTP 429.' })
  await vi.runAllTimersAsync()
  expect(request).toHaveBeenCalledTimes(4)
})

it('reuses multipart input after a rejected write without setting a JSON content type', async () => {
  const request = vi.fn().mockResolvedValueOnce(limited()).mockImplementation(success)
  vi.stubGlobal('fetch', request)
  const body = new FormData()
  body.append('title', 'Fixture')
  const pending = outcome(api('POST', 'habits', body))
  await vi.runAllTimersAsync()
  expect(await pending).toEqual({ value: { status: 204, payload: null } })
  for (const [, options] of request.mock.calls) {
    expect(options.body).toBe(body)
    expect(options.headers).not.toHaveProperty('Content-Type')
  }
})

const hang = (_url, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), { once: true })
})
const hangUntilAborted = () => vi.fn().mockImplementation(hang)
const fakeTimeouts = () => vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
  const controller = new AbortController()
  setTimeout(() => controller.abort(new DOMException('Private timeout details', 'TimeoutError')), milliseconds)
  return controller.signal
})

it.each(['GET', 'DELETE', 'PUT'])('retries %s once after transport failure or timeout with a fresh deadline', async (method) => {
  const timeout = fakeTimeouts()
  const request = vi.fn().mockImplementationOnce(hang).mockImplementation(success)
  vi.stubGlobal('fetch', request)
  const body = method === 'PUT' ? { title: 'Fixture', startDate: '2026-01-01' } : undefined
  const pending = outcome(api(method, 'habits/22222222-2222-4222-8222-222222222222', body))
  await vi.advanceTimersByTimeAsync(14999)
  expect(request).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(await pending).toEqual({ value: { status: 204, payload: null } })
  expect(request).toHaveBeenCalledTimes(2)
  expect(timeout.mock.calls).toEqual([[15000], [15000]])
  expect(request.mock.calls[1][1].signal.aborted).toBe(false)
  expect(request.mock.calls[1][0]).toBe(request.mock.calls[0][0])
  expect(request.mock.calls[1][1]).toEqual({ ...request.mock.calls[0][1], signal: request.mock.calls[1][1].signal })
})

it.each(['GET', 'DELETE', 'PUT'])('names the %s timeout after its one retry', async (method) => {
  const timeout = fakeTimeouts()
  const request = hangUntilAborted()
  vi.stubGlobal('fetch', request)
  const pending = outcome(api(method, 'habits/22222222-2222-4222-8222-222222222222'))
  await vi.runAllTimersAsync()
  expect(await pending).toEqual({ error: `Fixture API ${method} habits/{id} failed: timeout.` })
  expect(request).toHaveBeenCalledTimes(2)
  expect(timeout.mock.calls).toEqual([[15000], [15000]])
})

it.each([
  ['habits/22222222-2222-4222-8222-222222222222', { title: 'Fixture' }],
  ['habits/22222222-2222-4222-8222-222222222222/checklist', { checklistItems: [] }],
  ['tags/22222222-2222-4222-8222-222222222222/assign', { tagIds: [] }],
  ['calendar/selected-calendars', { calendarIds: [] }],
  ['calendar/auto-sync', { enabled: false }],
])('retries the replacement PUT %s once after a network failure', async (path, body) => {
  const request = vi.fn().mockRejectedValueOnce(new TypeError('Private details')).mockImplementation(success)
  vi.stubGlobal('fetch', request)
  expect(await api('PUT', path, body)).toEqual({ status: 204, payload: null })
  expect(request).toHaveBeenCalledTimes(2)
  expect(request.mock.calls[1][0]).toBe(request.mock.calls[0][0])
  expect(request.mock.calls[1][1].body).toBe(JSON.stringify(body))
})

it.each([
  'profile/timezone', 'profile/language', 'profile/name',
  'habits/reorder', 'habits/not-a-guid',
  'habits/22222222-2222-4222-8222-222222222222/checklist/append',
  'tags/22222222-2222-4222-8222-222222222222/assign/extra',
  'calendar/auto-sync/run', 'calendar/selected-calendars/extra',
])('does not retry an unverified or incrementing PUT %s after a timeout', async (path) => {
  const timeout = fakeTimeouts()
  const request = vi.fn().mockImplementationOnce(hang).mockImplementation(success)
  vi.stubGlobal('fetch', request)
  const pending = outcome(api('PUT', path, {}))
  await vi.runAllTimersAsync()
  expect(await pending).toHaveProperty('error', expect.stringContaining('failed: timeout.'))
  expect(request).toHaveBeenCalledTimes(1)
  expect(timeout.mock.calls).toEqual([[15000]])
})

it.each(['POST', 'PATCH'])('reports a single %s timeout at the existing deadline', async (method) => {
  const timeout = fakeTimeouts()
  const request = hangUntilAborted()
  vi.stubGlobal('fetch', request)
  const pending = outcome(api(method, 'habits/22222222-2222-4222-8222-222222222222/log', { title: 'Private body' }))
  await vi.advanceTimersByTimeAsync(14999)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0][1].signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await vi.runAllTimersAsync()
  expect(await pending).toEqual({ error: `Fixture API ${method} habits/{id}/log failed: timeout.` })
  expect(request).toHaveBeenCalledTimes(1)
  expect(timeout.mock.calls).toEqual([[15000]])
})

it.each(['GET', 'DELETE'])('bounds %s transport retries and names the final failure without private details', async (method) => {
  const request = vi.fn().mockRejectedValue(new TypeError('Private URL, token and network details'))
  vi.stubGlobal('fetch', request)
  expect(await outcome(api(method, 'goals/33333333-3333-4333-8333-333333333333?token=private-query'))).toEqual({
    error: `Fixture API ${method} goals/{id} failed: network.`,
  })
  expect(request).toHaveBeenCalledTimes(2)
})

it.each(['POST', 'PATCH'])('reports a single %s network failure without private details', async (method) => {
  const request = vi.fn().mockRejectedValue(new TypeError('Private URL, token and network details'))
  vi.stubGlobal('fetch', request)
  expect(await outcome(api(method, 'goals/33333333-3333-4333-8333-333333333333?token=private-query', { title: 'Private body' }))).toEqual({
    error: `Fixture API ${method} goals/{id} failed: network.`,
  })
  expect(request).toHaveBeenCalledTimes(1)
})

it.each([
  ['ai/pending-operations/11111111-1111-4111-8111-111111111111/confirm?clientContext=private', 'ai/pending-operations/{id}/confirm'],
  ['ai/pending-operations/11111111-1111-4111-8111-111111111111/revise', 'ai/pending-operations/{id}/revise'],
  ['tags/22222222-2222-4222-8222-222222222222/assign', 'tags/{id}/assign'],
  ['habits/retrospective?period=month', 'habits/retrospective'],
  ['habits/bulk', 'habits/bulk'],
  ['profile/export', 'profile/export'],
])('names %s as %s, replacing only the GUID segments', async (path, route) => {
  const request = vi.fn().mockRejectedValue(new TypeError('Private details'))
  vi.stubGlobal('fetch', request)
  expect(await outcome(api('POST', path, { title: 'Private body' }))).toEqual({ error: `Fixture API POST ${route} failed: network.` })
})

it('retries a safe response body transport failure', async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(new ReadableStream({
    start(controller) { controller.error(new TypeError('Connection closed')) },
  }))).mockImplementation(success)
  vi.stubGlobal('fetch', request)
  expect(await outcome(api('GET', 'profile/export'))).toEqual({ value: { status: 204, payload: null } })
  expect(request).toHaveBeenCalledTimes(2)
})

it.each(['TimeoutError', 'TypeError'])('classifies a response body %s failure after the safe retry', async (name) => {
  const request = vi.fn().mockImplementation(() => new Response(new ReadableStream({
    start(controller) { controller.error(new DOMException('Private body details', name)) },
  })))
  vi.stubGlobal('fetch', request)
  expect(await outcome(api('GET', 'profile/export'))).toEqual({
    error: `Fixture API GET profile/export failed: ${name === 'TimeoutError' ? 'timeout' : 'network'}.`,
  })
  expect(request).toHaveBeenCalledTimes(2)
})

it.each(['POST', 'PATCH'])('never retries a %s transport failure, even following a 429', async (method) => {
  const request = vi.fn().mockResolvedValueOnce(limited()).mockRejectedValue(new TypeError('Private details'))
  vi.stubGlobal('fetch', request)
  const pending = outcome(api(method, 'habits', { title: 'Fixture' }))
  await vi.runAllTimersAsync()
  expect(await pending).toEqual({ error: `Fixture API ${method} habits failed: network.` })
  expect(request).toHaveBeenCalledTimes(2)
})

it('keeps independent 429 and transport budgets across a single call', async () => {
  const request = vi.fn().mockRejectedValueOnce(new TypeError('Cold start'))
    .mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited())
    .mockRejectedValue(new TypeError('Still unavailable'))
  vi.stubGlobal('fetch', request)
  const pending = outcome(api('GET', 'eval/pending-operations'))
  await vi.runAllTimersAsync()
  expect(await pending).toEqual({ error: 'Fixture API GET eval/pending-operations failed: network.' })
  expect(request).toHaveBeenCalledTimes(5)
})

it.each([400, 401, 403, 409, 500, 503])('does not retry HTTP %s', async (status) => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status }))
  vi.stubGlobal('fetch', request)
  expect(await outcome(api('GET', 'profile'))).toEqual({ error: `Fixture API GET failed with HTTP ${status}.` })
  expect(request).toHaveBeenCalledTimes(1)
})

it('preserves accepted statuses without retrying them', async () => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status: 409 }))
  vi.stubGlobal('fetch', request)
  expect(await api('DELETE', 'eval/pending-operations', undefined, [], [409])).toEqual({ status: 409, payload: null })
  expect(request).toHaveBeenCalledTimes(1)
})

it.each([200, 401, 502, 503])('reports non-JSON HTTP %s without the response body or identifiers', async (status) => {
  const request = vi.fn().mockImplementation(() => new Response('Private malformed response', { status }))
  vi.stubGlobal('fetch', request)
  expect(await outcome(api('PUT', 'habits/11111111-1111-4111-8111-111111111111'))).toEqual({
    error: `Fixture API PUT habits/{id} failed: non-JSON body (HTTP ${status}).`,
  })
  expect(request).toHaveBeenCalledTimes(1)
})
