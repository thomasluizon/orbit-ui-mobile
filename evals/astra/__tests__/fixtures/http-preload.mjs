import './auth-preload.mjs'
import { chatResponse } from './producer.mjs'

const fixtureFetch = globalThis.fetch
globalThis.fetch = async (url, options) => {
  if (new URL(url).pathname !== '/api/chat') return fixtureFetch(url, options)
  const request = new Request(url, options)
  const form = await request.formData()
  const input = form.get('message')
  const requestId = input === 'wrong-request' ? 'unrelated-request' : request.headers.get('x-orbit-request-id')
  const status = input === 'unauthorized' ? 401 : input === 'healthy' ? 200 : 403
  return Response.json(status === 200 ? chatResponse(requestId, []) : {
    error: 'Daily AI message limit reached.', errorCode: input === 'unrelated-refusal' ? 'NO_PERMISSION' : 'PAY_GATE',
  }, { status, headers: { 'X-Orbit-Request-Id': requestId } })
}
