import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { publicApi } from '../fixtures/api.mjs'

const transportFailure = 'Fixture API transport or JSON response failed.'
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

it.each(['GET', 'DELETE'])('retries %s once after transport failure or timeout with a fresh deadline', async (method) => {
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('Fixture timeout', 'TimeoutError')), milliseconds)
    return controller.signal
  })
  const request = vi.fn().mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })).mockImplementation(success)
  vi.stubGlobal('fetch', request)
  const pending = outcome(api(method, 'eval/pending-operations'))
  await vi.advanceTimersByTimeAsync(14999)
  expect(request).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(await pending).toEqual({ value: { status: 204, payload: null } })
  expect(request).toHaveBeenCalledTimes(2)
  expect(timeout.mock.calls).toEqual([[15000], [15000]])
  expect(request.mock.calls[1][1].signal.aborted).toBe(false)
})

it.each(['GET', 'DELETE'])('bounds %s transport retries and preserves the final error', async (method) => {
  const request = vi.fn().mockRejectedValue(new Error('Private transport details'))
  vi.stubGlobal('fetch', request)
  expect(await outcome(api(method, 'eval/pending-operations'))).toEqual({ error: transportFailure })
  expect(request).toHaveBeenCalledTimes(2)
})

it.each(['POST', 'PUT', 'PATCH'])('never retries a %s transport failure, even following a 429', async (method) => {
  const request = vi.fn().mockResolvedValueOnce(limited()).mockRejectedValue(new TypeError('Private transport details'))
  vi.stubGlobal('fetch', request)
  const pending = outcome(api(method, 'habits', { title: 'Fixture' }))
  await vi.runAllTimersAsync()
  expect(await pending).toEqual({ error: transportFailure })
  expect(request).toHaveBeenCalledTimes(2)
})

it('keeps independent 429 and transport budgets across a single call', async () => {
  const request = vi.fn().mockRejectedValueOnce(new TypeError('Cold start'))
    .mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited())
    .mockRejectedValue(new TypeError('Still unavailable'))
  vi.stubGlobal('fetch', request)
  const pending = outcome(api('GET', 'eval/pending-operations'))
  await vi.runAllTimersAsync()
  expect(await pending).toEqual({ error: transportFailure })
  expect(request).toHaveBeenCalledTimes(5)
})

it('retries a safe response body transport failure', async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(new ReadableStream({
    start(controller) { controller.error(new TypeError('Connection closed')) },
  }))).mockImplementation(success)
  vi.stubGlobal('fetch', request)
  expect(await outcome(api('GET', 'profile/export'))).toEqual({ value: { status: 204, payload: null } })
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

it('does not retry malformed JSON as a transport failure', async () => {
  const request = vi.fn().mockImplementation(() => new Response('Private malformed response'))
  vi.stubGlobal('fetch', request)
  expect(await outcome(api('GET', 'profile'))).toEqual({ error: transportFailure })
  expect(request).toHaveBeenCalledTimes(1)
})
