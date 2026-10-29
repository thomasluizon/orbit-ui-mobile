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

it.each(['GET', 'DELETE', 'POST', 'PUT', 'PATCH'])('reports a single %s timeout at the existing deadline', async (method) => {
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('Private timeout details', 'TimeoutError')), milliseconds)
    return controller.signal
  })
  const request = vi.fn().mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  vi.stubGlobal('fetch', request)
  const pending = outcome(api(method, 'habits/private-habit-id/log', { title: 'Private body' }))
  await vi.advanceTimersByTimeAsync(14999)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0][1].signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await vi.runAllTimersAsync()
  expect(await pending).toEqual({ error: `Fixture API ${method} habits/{id}/log failed: timeout.` })
  expect(request).toHaveBeenCalledTimes(1)
  expect(timeout.mock.calls).toEqual([[15000]])
})

it.each(['GET', 'DELETE', 'POST', 'PUT', 'PATCH'])('reports a single %s network failure without private details', async (method) => {
  const request = vi.fn().mockRejectedValue(new TypeError('Private URL, token and network details'))
  vi.stubGlobal('fetch', request)
  expect(await outcome(api(method, 'goals/private-goal-id?token=private-query'))).toEqual({
    error: `Fixture API ${method} goals/{id} failed: network.`,
  })
  expect(request).toHaveBeenCalledTimes(1)
})

it.each(['TimeoutError', 'TypeError'])('classifies a response body %s failure without retrying', async (name) => {
  const request = vi.fn().mockImplementation(() => new Response(new ReadableStream({
    start(controller) { controller.error(new DOMException('Private body details', name)) },
  })))
  vi.stubGlobal('fetch', request)
  expect(await outcome(api('GET', 'profile/export'))).toEqual({
    error: `Fixture API GET profile/export failed: ${name === 'TimeoutError' ? 'timeout' : 'network'}.`,
  })
  expect(request).toHaveBeenCalledTimes(1)
})

it('retains the 429 wait without retrying the following transport failure', async () => {
  const request = vi.fn().mockResolvedValueOnce(limited()).mockRejectedValue(new TypeError('Private details'))
  vi.stubGlobal('fetch', request)
  const pending = outcome(api('DELETE', 'eval/pending-operations'))
  await vi.runAllTimersAsync()
  expect(await pending).toEqual({ error: 'Fixture API DELETE eval/pending-operations failed: network.' })
  expect(request).toHaveBeenCalledTimes(2)
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
