import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib'
import { pipeToNodeResponse } from 'next/dist/server/pipe-readable'
import { createRequestResponseMocks } from 'next/dist/server/lib/mock-request'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, HEAD, OPTIONS, POST } from '@/app/ingest/[[...path]]/route'

const fetchUpstream = vi.fn<typeof fetch>()
const encoder = new TextEncoder()

beforeEach(() => vi.stubGlobal('fetch', fetchUpstream.mockReset()))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('PostHog streaming proxy', () => {
  it.each([
    ['/ingest/static/array.js?v=1', 'https://us-assets.i.posthog.com/static/array.js?v=1'],
    ['/ingest/static/1.434.15/surveys.js', 'https://us-assets.i.posthog.com/static/1.434.15/surveys.js'],
    ['/ingest/array/project-token/config', 'https://us-assets.i.posthog.com/array/project-token/config'],
    ['/ingest/array/project-token/config.js', 'https://us-assets.i.posthog.com/array/project-token/config.js'],
    ['/ingest/e/?ip=1', 'https://us.i.posthog.com/e/?ip=1'],
    ['/ingest/flags/?v=2', 'https://us.i.posthog.com/flags/?v=2'],
    ['/ingest/s/', 'https://us.i.posthog.com/s/'],
    ['/ingest/i/v0/e/', 'https://us.i.posthog.com/i/v0/e/'],
    ['/ingest/i/v1/logs?token=project-token', 'https://us.i.posthog.com/i/v1/logs?token=project-token'],
    ['/ingest/i/v1/metrics?token=project-token', 'https://us.i.posthog.com/i/v1/metrics?token=project-token'],
    ['/ingest/api/surveys/?token=project-token', 'https://us.i.posthog.com/api/surveys/?token=project-token'],
    ['/ingest/api/early_access_features/?token=project-token', 'https://us.i.posthog.com/api/early_access_features/?token=project-token'],
    ['/ingest/api/product_tours/?token=project-token', 'https://us.i.posthog.com/api/product_tours/?token=project-token'],
    ['/ingest/api/web_experiments/?token=project-token', 'https://us.i.posthog.com/api/web_experiments/?token=project-token'],
    ['/ingest/api/conversations/v1/widget/message', 'https://us.i.posthog.com/api/conversations/v1/widget/message'],
    ['/ingest/api/conversations/v1/widget/messages/ticket-id?token=project-token', 'https://us.i.posthog.com/api/conversations/v1/widget/messages/ticket-id?token=project-token'],
    ['/ingest/api/conversations/v1/widget/messages/ticket-id/read', 'https://us.i.posthog.com/api/conversations/v1/widget/messages/ticket-id/read'],
    ['/ingest/api/conversations/v1/widget/tickets?token=project-token', 'https://us.i.posthog.com/api/conversations/v1/widget/tickets?token=project-token'],
    ['/ingest/api/conversations/v1/widget/restore', 'https://us.i.posthog.com/api/conversations/v1/widget/restore'],
    ['/ingest/api/conversations/v1/widget/restore/request', 'https://us.i.posthog.com/api/conversations/v1/widget/restore/request'],
  ])('forwards %s to %s without dropping the response body', async (path, destination) => {
    fetchUpstream.mockResolvedValue(new Response('upstream payload', {
      status: 202, statusText: 'Accepted',
      headers: { 'content-type': 'application/javascript', 'cache-control': 'public, max-age=60' },
    }))

    const response = await GET(new Request(`https://app.example.test${path}`))

    expect(fetchUpstream).toHaveBeenCalledTimes(1)
    expect(fetchUpstream.mock.calls[0]![0]).toEqual(new URL(destination))
    expect(response.status).toBe(202)
    expect(response.statusText).toBe('Accepted')
    expect(response.headers.get('content-type')).toBe('application/javascript')
    expect(response.headers.get('cache-control')).toBe('public, max-age=60')
    expect(await response.text()).toBe('upstream payload')
  })

  it.each([
    '/ingest/api/users/@me/', '/ingest/api/projects/', '/ingest/api/',
    '/ingest', '/ingest/', '/ingest/staticity/', '/ingest/array-like/',
    '/ingest/events/', '/ingest/flagship/', '/ingest/batch/', '/ingest/decide/?v=3',
    '/ingest/e', '/ingest/flags', '/ingest/static', '/ingest/api/surveys',
    '/ingest/api/surveys-admin/', '/ingest/api/conversations/v1/widget-admin/',
    '/ingest/e/..%2F..%2Fapi/users/@me/', '/ingest/static/..%5capi/users/@me/',
    '/ingest/e/%252e%252e%252fapi/users/@me/',
    '/ingest/static/%2e%2e/api/users/@me/', '/ingest/e/../api/users/@me/',
    '/ingest//api/users/@me/', '/ingest//other.example.test/e/',
    '/ingesthttps://other.example.test/e/', '/ingestion/e/',
  ])('rejects %s without contacting PostHog', async path => {
    fetchUpstream.mockResolvedValue(new Response('PostHog body'))

    const response = await GET(new Request(`https://app.example.test${path}`))

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it.each([
    ['/e/', 'https://us.i.posthog.com'],
    ['/static/array.js', 'https://us-assets.i.posthog.com'],
    ['/static/a%20b%23%3f.js', 'https://us-assets.i.posthog.com'],
    ['/array/project-token/config', 'https://us-assets.i.posthog.com'],
  ])('preserves query encoding and the fixed origin for %s', async (path, origin) => {
    fetchUpstream.mockResolvedValue(new Response('ok'))
    const search = '?token=a%2Fb&value=one+two&value=%20&next=https://other.example.test/%25'

    await GET(new Request(`http://app.example.test:8080/ingest${path}${search}`))

    expect(fetchUpstream.mock.calls[0]![0]).toEqual(new URL(`${origin}${path}${search}`))
  })

  it.each([
    ['/ingest//evil.example/e/', null],
    ['/ingest/e/@evil.example', 'https://us.i.posthog.com/e/@evil.example'],
    ['/ingest/static/@evil.example', 'https://us-assets.i.posthog.com/static/@evil.example'],
    ['/ingest/array/@evil.example', 'https://us-assets.i.posthog.com/array/@evil.example'],
  ])('keeps the destination host fixed for %s', async (path, destination) => {
    fetchUpstream.mockResolvedValue(new Response('ok'))

    const response = await GET(new Request(`https://app.example.test${path}`))

    if (destination === null) {
      expect(response.status).toBe(404)
      expect(fetchUpstream).not.toHaveBeenCalled()
    } else {
      expect(response.status).toBe(200)
      expect(fetchUpstream).toHaveBeenCalledTimes(1)
      expect(fetchUpstream.mock.calls[0]![0]).toEqual(new URL(destination))
    }
  })

  it.each([
    '/e/?compression=gzip-js', '/s/', '/i/v1/logs', '/flags/?v=2',
    '/api/surveys/', '/api/early_access_features/', '/api/product_tours/',
    '/api/web_experiments/', '/api/conversations/v1/widget/message',
    '/static/array.js', '/array/project-token/config',
  ])('forwards a streamed body and client context for %s without application credentials', async path => {
    fetchUpstream.mockResolvedValue(new Response('ok'))
    const request = new Request(`https://app.example.test/ingest${path}`, {
      method: 'POST', body: 'event payload',
      headers: { cookie: 'auth=private', authorization: 'Bearer private', host: 'app.example.test',
        'content-type': 'text/plain', 'content-encoding': 'gzip', origin: 'https://app.example.test',
        'user-agent': 'sdk-agent', connection: 'keep-alive, x-private-hop', 'x-private-hop': 'private',
        'x-forwarded-for': '192.0.2.1', 'content-length': '13' },
    })

    await POST(request)

    const options = fetchUpstream.mock.calls[0]![1]!
    const headers = new Headers(options.headers)
    expect(options).toMatchObject({ method: 'POST', redirect: 'manual', cache: 'no-store', duplex: 'half' })
    expect(options.signal).toBe(request.signal)
    expect(options.body).toBe(request.body)
    expect(await new Response(options.body).text()).toBe('event payload')
    const hostname = path.startsWith('/static/') || path.startsWith('/array/')
      ? 'us-assets.i.posthog.com'
      : 'us.i.posthog.com'
    expect(fetchUpstream.mock.calls[0]![0]).toEqual(new URL(`https://${hostname}${path}`))
    expect(headers.get('host')).toBe(hostname)
    expect(headers.get('content-type')).toBe('text/plain')
    expect(headers.get('content-encoding')).toBe('gzip')
    expect(headers.get('origin')).toBe('https://app.example.test')
    expect(headers.get('user-agent')).toBe('sdk-agent')
    expect(headers.get('x-forwarded-for')).toBe('192.0.2.1')
    expect(headers.get('accept-encoding')).toBe('gzip, deflate, br')
    for (const header of ['cookie', 'authorization', 'connection', 'content-length', 'x-private-hop']) {
      expect(headers.has(header)).toBe(false)
    }
  })

  it.each([400, 429, 503])('preserves upstream status %i and error body', async status => {
    fetchUpstream.mockResolvedValue(new Response('upstream error', { status, headers: { 'retry-after': '5' } }))
    const response = await POST(new Request('https://app.example.test/ingest/e/', { method: 'POST', body: 'event' }))
    expect(response.status).toBe(status)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(await response.text()).toBe('upstream error')
  })

  it.each([['HEAD', HEAD, 200], ['OPTIONS', OPTIONS, 204]] as const)('preserves bodyless %s responses', async (method, handler, status) => {
    fetchUpstream.mockResolvedValue(new Response(null, { status, headers: { 'content-type': 'application/json' } }))
    const response = await handler(new Request('https://app.example.test/ingest/e/', { method }))
    expect(fetchUpstream.mock.calls[0]![1]!.method).toBe(method)
    expect(response.status).toBe(status)
    expect(response.body).toBeNull()
  })

  it.each([
    ['gzip', gunzipSync], ['x-gzip', gunzipSync], ['deflate', inflateSync], ['br', brotliDecompressSync],
  ] as const)('restores the %s encoding that fetch decoded', async (encoding, decode) => {
    fetchUpstream.mockResolvedValue(new Response('decoded upstream body', {
      headers: { 'content-encoding': encoding, 'content-length': '999', 'content-type': 'text/javascript',
        connection: 'keep-alive, x-upstream-hop', 'x-upstream-hop': 'private' },
    }))
    const response = await GET(new Request('https://app.example.test/ingest/static/array.js'))
    expect(response.headers.get('content-encoding')).toBe(encoding)
    expect(response.headers.get('content-type')).toBe('text/javascript')
    for (const header of ['connection', 'content-length', 'x-upstream-hop']) expect(response.headers.has(header)).toBe(false)
    expect(decode(Buffer.from(await response.arrayBuffer())).toString()).toBe('decoded upstream body')
  })

  it('streams chunks before upstream completion with two close listeners even under backpressure', async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>
    fetchUpstream.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(controller) { upstream = controller } })))
    const response = await GET(new Request('https://app.example.test/ingest/static/array.js'))
    const { res } = createRequestResponseMocks({ url: '/ingest/static/array.js', method: 'GET' })
    const chunks: Uint8Array[] = []
    vi.spyOn(res, 'write').mockImplementation(chunk => {
      chunks.push(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      queueMicrotask(() => res.emit('drain'))
      return false
    })
    const piping = pipeToNodeResponse(response.body!, res as unknown as Parameters<typeof pipeToNodeResponse>[1])
    for (let chunk = 0; chunk < 50; chunk += 1) {
      upstream.enqueue(encoder.encode(`chunk ${chunk}\n`))
      await vi.waitFor(() => expect(chunks).toHaveLength(chunk + 1))
      expect(res.listenerCount('close')).toBe(2)
    }
    upstream.close()
    await piping
    await vi.waitFor(() => expect(res.listenerCount('close')).toBe(0))
    expect(Buffer.concat(chunks).toString()).toBe(Array.from({ length: 50 }, (_, chunk) => `chunk ${chunk}\n`).join(''))
  })

  it('ends quietly when the client disconnects before PostHog answers', async () => {
    const client = new AbortController()
    fetchUpstream.mockImplementation((_destination, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('ResponseAborted')))
    }))
    const pending = POST(new Request('https://app.example.test/ingest/flags/?v=2', {
      method: 'POST', body: '{}', signal: client.signal,
    }))
    client.abort(new Error('ResponseAborted'))
    const response = await pending
    expect(response.status).toBe(499)
    expect(response.body).toBeNull()
  })

  it('reports an upstream failure while the client is still connected', async () => {
    fetchUpstream.mockRejectedValue(new TypeError('fetch failed'))
    await expect(GET(new Request('https://app.example.test/ingest/static/array.js'))).rejects.toThrow('fetch failed')
  })

  it('cancels upstream when the downstream stream is canceled', async () => {
    const cancel = vi.fn()
    fetchUpstream.mockResolvedValue(new Response(new ReadableStream({ cancel })))
    const response = await GET(new Request('https://app.example.test/ingest/static/array.js'))
    await response.body!.cancel()
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
