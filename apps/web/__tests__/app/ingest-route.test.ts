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
    ['/ingest/array/project-token/config.js', 'https://us-assets.i.posthog.com/array/project-token/config.js'],
    ['/ingest/e/?ip=1', 'https://us.i.posthog.com/e/?ip=1'],
    ['/ingest/batch/', 'https://us.i.posthog.com/batch/'],
    ['/ingest/flags/?v=2', 'https://us.i.posthog.com/flags/?v=2'],
    ['/ingest/decide/?v=3', 'https://us.i.posthog.com/decide/?v=3'],
    ['/ingest/s/', 'https://us.i.posthog.com/s/'],
    ['/ingest/i/v0/e/', 'https://us.i.posthog.com/i/v0/e/'],
    ['/ingest/staticity/', 'https://us.i.posthog.com/staticity/'],
    ['/ingest', 'https://us.i.posthog.com/'],
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

  it('forwards a streamed event body and client context without application credentials', async () => {
    fetchUpstream.mockResolvedValue(new Response('ok'))
    const request = new Request('https://app.example.test/ingest/e/?compression=gzip-js', {
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
    expect(headers.get('host')).toBe('us.i.posthog.com')
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

  it('cancels upstream when the downstream stream is canceled', async () => {
    const cancel = vi.fn()
    fetchUpstream.mockResolvedValue(new Response(new ReadableStream({ cancel })))
    const response = await GET(new Request('https://app.example.test/ingest/static/array.js'))
    await response.body!.cancel()
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
