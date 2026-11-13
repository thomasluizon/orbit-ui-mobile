import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { BrowserClient, defaultStackParser, makeFetchTransport } from '@sentry/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/monitoring/route'
import { AUTH_COOKIE, REFRESH_COOKIE } from '@/lib/auth-api'
import { SENTRY_TUNNEL_ROUTE } from '@/lib/public-paths'

const BROWSER_DSN = 'https://publickey@o123.ingest.us.sentry.io/456'
const INGEST_ENDPOINT = 'https://o123.ingest.us.sentry.io/api/456/envelope/?sentry_version=7&sentry_key=publickey'
const SENTRY_UPSTREAM_TIME_LIMIT_MS = 2000
const fetchUpstream = vi.fn<typeof fetch>()

function envelopeFor(header: string): string {
  return `${header}\n{"type":"event"}\n{"event_id":"9ec79c33ec9942ab8353589fcb2e04dc","message":"boom"}`
}

function sdkEnvelope(dsn: string): string {
  return envelopeFor(JSON.stringify({
    event_id: '9ec79c33ec9942ab8353589fcb2e04dc',
    sent_at: '2026-11-12T12:00:00.000Z',
    sdk: { name: 'sentry.javascript.nextjs', version: '10.76.2' },
    dsn,
  }))
}

function tunnelRequest(body: string, headers: Record<string, string> = {}, search = '?o=123&p=456&r=us') {
  return new Request(`https://app.example.test${SENTRY_TUNNEL_ROUTE}${search}`, {
    method: 'POST', body, headers: { 'content-type': 'text/plain;charset=UTF-8', ...headers },
  })
}

function browserSdk(tunnel: string | undefined) {
  const requestedUrls: string[] = []
  const routeStatuses: number[] = []
  const client = new BrowserClient({
    dsn: BROWSER_DSN,
    tunnel,
    integrations: [],
    sendClientReports: false,
    stackParser: defaultStackParser,
    transport: (options) => makeFetchTransport(options, async (_url, init) => {
      requestedUrls.push(options.url)
      const answer = await POST(new Request(`https://app.example.test${SENTRY_TUNNEL_ROUTE}`, init))
      routeStatuses.push(answer.status)
      return answer
    }),
  })
  return { client, requestedUrls, routeStatuses }
}

function forwardedEnvelopeHeader(): unknown {
  const envelope = new TextDecoder().decode(fetchUpstream.mock.calls[0]![1]!.body as Uint8Array)
  return JSON.parse(envelope.slice(0, envelope.indexOf('\n')))
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchUpstream.mockReset())
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', BROWSER_DSN)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Sentry tunnel route', () => {
  it('lives at the tunnel path the browser SDK posts to and the proxy treats as public', () => {
    expect(existsSync(resolve(__dirname, '../../app', `.${SENTRY_TUNNEL_ROUTE}`, 'route.ts'))).toBe(true)
  })

  it.each([
    ['a signed-in', {
      cookie: `${AUTH_COOKIE}=signed-in-access; ${REFRESH_COOKIE}=signed-in-refresh; i18n_locale=en`,
      authorization: 'Bearer signed-in-access',
    }, '?o=123&p=456&r=us'],
    ['a signed-out', {}, ''],
  ])('forwards %s envelope to the configured project with no credentials or proxy headers', async (_session, credentials, search) => {
    fetchUpstream.mockResolvedValue(new Response('{"id":"9ec79c33ec9942ab8353589fcb2e04dc"}', {
      status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'sentry=upstream' },
    }))
    const envelope = sdkEnvelope(BROWSER_DSN)

    const response = await POST(tunnelRequest(envelope, {
      ...credentials,
      'x-nonce': 'cHJveHktbm9uY2U=',
      'content-security-policy': "script-src 'nonce-cHJveHktbm9uY2U='",
      'x-forwarded-for': '192.0.2.1',
      origin: 'https://app.example.test',
      'user-agent': 'browser-agent',
    }, search))

    expect(fetchUpstream).toHaveBeenCalledTimes(1)
    const [destination, options] = fetchUpstream.mock.calls[0]!
    expect(destination).toBe(INGEST_ENDPOINT)
    expect(options).toMatchObject({ method: 'POST', redirect: 'manual', cache: 'no-store' })
    expect([...new Headers(options!.headers).entries()]).toEqual([['content-type', 'application/x-sentry-envelope']])
    expect(new TextDecoder().decode(options!.body as Uint8Array)).toBe(envelope)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(await response.text()).toBe('{"id":"9ec79c33ec9942ab8353589fcb2e04dc"}')
  })

  it('returns the Sentry rate limit answer the SDK backs off from', async () => {
    fetchUpstream.mockResolvedValue(new Response(null, {
      status: 429, headers: { 'retry-after': '60', 'x-sentry-rate-limits': '60:error:organization' },
    }))

    const response = await POST(tunnelRequest(sdkEnvelope(BROWSER_DSN)))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(response.headers.get('x-sentry-rate-limits')).toBe('60:error:organization')
  })

  it.each([
    ['another organisation', sdkEnvelope('https://publickey@o999.ingest.us.sentry.io/456')],
    ['another project', sdkEnvelope('https://publickey@o123.ingest.us.sentry.io/789')],
    ['another public key', sdkEnvelope('https://otherkey@o123.ingest.us.sentry.io/456')],
    ['another host', sdkEnvelope('https://publickey@collector.example.test/456')],
    ['another path prefix', sdkEnvelope('https://publickey@o123.ingest.us.sentry.io/relay/456')],
    ['no DSN', envelopeFor('{"event_id":"9ec79c33ec9942ab8353589fcb2e04dc"}')],
    ['a DSN that is not a string', envelopeFor(`{"dsn":["${BROWSER_DSN}"]}`)],
    ['a header that is not JSON', envelopeFor(`dsn=${BROWSER_DSN}`)],
    ['an empty body', ''],
  ])('refuses an envelope with %s without contacting Sentry', async (_case, envelope) => {
    const response = await POST(tunnelRequest(envelope))

    expect(response.status).toBe(403)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it.each([
    ['a timed out connection', Object.assign(new TypeError('fetch failed'), { cause: new Error('connect ETIMEDOUT 34.160.81.0:443') })],
    ['an unreachable network', Object.assign(new TypeError('fetch failed'), { cause: new Error('connect ENETUNREACH 2600:1901:0:5e8a:::443') })],
  ])('answers 502 with an empty body and does not throw when Sentry fails with %s', async (_case, failure) => {
    fetchUpstream.mockRejectedValue(failure)

    const response = await POST(tunnelRequest(sdkEnvelope(BROWSER_DSN)))

    expect(response.status).toBe(502)
    expect(await response.text()).toBe('')
  })

  it('answers 502 with an empty body when the call to Sentry passes the time limit', async () => {
    const timeLimit = new AbortController()
    const createTimeLimit = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeLimit.signal)
    const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    fetchUpstream.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error(String(init!.signal!.reason))))
      timeLimit.abort(timeoutError)
    }))

    const response = await POST(tunnelRequest(sdkEnvelope(BROWSER_DSN)))

    expect(createTimeLimit).toHaveBeenCalledExactlyOnceWith(SENTRY_UPSTREAM_TIME_LIMIT_MS)
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('')
    createTimeLimit.mockRestore()
  })

  it.each([undefined, '', 'not a dsn', 'https://o123.ingest.us.sentry.io/456'])(
    'answers 404 without contacting Sentry when the browser DSN is %j',
    async (configuredDsn) => {
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', configuredDsn)

      const response = await POST(tunnelRequest(sdkEnvelope(BROWSER_DSN)))

      expect(response.status).toBe(404)
      expect(fetchUpstream).not.toHaveBeenCalled()
    },
  )
})

describe('Sentry tunnel route with the real browser SDK', () => {
  it('forwards the error envelope the SDK posts to the tunnel by the dsn the SDK writes into its header', async () => {
    fetchUpstream.mockResolvedValue(new Response('{}', { status: 200 }))
    const sdk = browserSdk(SENTRY_TUNNEL_ROUTE)

    sdk.client.captureException(new Error('boom'))
    await sdk.client.flush(1000)

    expect(sdk.requestedUrls).toEqual([SENTRY_TUNNEL_ROUTE])
    expect(sdk.routeStatuses).toEqual([200])
    expect(fetchUpstream).toHaveBeenCalledExactlyOnceWith(INGEST_ENDPOINT, expect.anything())
    expect(forwardedEnvelopeHeader()).toMatchObject({ dsn: BROWSER_DSN })
  })

  it('refuses the envelope the SDK builds without a tunnel, which it sends straight to the same ingest endpoint', async () => {
    fetchUpstream.mockResolvedValue(new Response('{}', { status: 200 }))
    const sdk = browserSdk(undefined)

    sdk.client.captureException(new Error('boom'))
    await sdk.client.flush(1000)

    const directEndpoint = new URL(sdk.requestedUrls[0]!)
    directEndpoint.searchParams.delete('sentry_client')
    expect(directEndpoint.href).toBe(INGEST_ENDPOINT)
    expect(sdk.routeStatuses).toEqual([403])
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it('returns the Sentry rate limit header that makes the SDK hold the next error', async () => {
    fetchUpstream.mockImplementation(async () => new Response('{}', {
      status: 200, headers: { 'x-sentry-rate-limits': '60:error:organization' },
    }))
    const sdk = browserSdk(SENTRY_TUNNEL_ROUTE)

    sdk.client.captureException(new Error('first'))
    await sdk.client.flush(1000)
    sdk.client.captureException(new Error('second'))
    await sdk.client.flush(1000)

    expect(sdk.routeStatuses).toEqual([200])
    expect(fetchUpstream).toHaveBeenCalledTimes(1)
  })
})
