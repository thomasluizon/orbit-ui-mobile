import './auth-preload.mjs'
import { appendFileSync } from 'node:fs'
import { chatResponse } from './producer.mjs'

const fixtureFetch = globalThis.fetch
globalThis.fetch = async (url, options) => {
  if (new URL(url).pathname !== '/api/chat') return fixtureFetch(url, options)
  const request = new Request(url, options)
  const form = await request.formData()
  const input = form.get('message')
  if (process.env.ASTRA_TEST_REQUEST_LOG) appendFileSync(process.env.ASTRA_TEST_REQUEST_LOG, `${input}\n`)
  const requestId = input === 'wrong-request' ? 'unrelated-request' : request.headers.get('x-orbit-request-id')
  const status = ({ unauthorized: 401, healthy: 200, throttled: 429, 'server-error': 500, 'not-found': 404, 'not-json': 502 })[input] ?? 403
  if (input === 'not-json') return new Response('Gateway unavailable', { status })
  return Response.json(status === 200 ? chatResponse(requestId, []) : {
    error: 'Daily AI message limit reached.', errorCode: input === 'unrelated-refusal' ? 'NO_PERMISSION' : 'PAY_GATE',
  }, { status, headers: { 'X-Orbit-Request-Id': requestId } })
}
