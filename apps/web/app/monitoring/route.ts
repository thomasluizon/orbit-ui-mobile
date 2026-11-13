import { z } from 'zod'

const ENVELOPE_HEADER_END = 0x0a
const SENTRY_RESPONSE_HEADERS = ['content-type', 'retry-after', 'x-sentry-rate-limits']
// WHY: 2000 ms matches the socket timeout in transports/http.ts of https://github.com/getsentry/sentry-javascript/tree/master/packages/node-core (the browser transport sets none); the route never reports its own upstream failure to Sentry, because the report would go to the endpoint that just failed.
const SENTRY_UPSTREAM_TIME_LIMIT_MS = 2000
const envelopeHeaderSchema = z.object({ dsn: z.string() })

function sentryEnvelopeEndpoint(dsn: string | null | undefined): string | null {
  if (!dsn || !URL.canParse(dsn)) return null
  const { protocol, username, host, pathname } = new URL(dsn)
  const pathSegments = pathname.split('/')
  const projectId = pathSegments.pop()
  if (!username || !projectId || !/^\d+$/.test(projectId)) return null
  const endpoint = new URL(`${protocol}//${host}${pathSegments.join('/')}/api/${projectId}/envelope/`)
  endpoint.search = new URLSearchParams({ sentry_version: '7', sentry_key: username }).toString()
  return endpoint.href
}

function envelopeDsn(envelope: Uint8Array): string | null {
  const headerEnd = envelope.indexOf(ENVELOPE_HEADER_END)
  const header = new TextDecoder().decode(headerEnd === -1 ? envelope : envelope.subarray(0, headerEnd))
  try {
    return envelopeHeaderSchema.parse(JSON.parse(header)).dsn
  } catch {
    return null
  }
}

async function forwardSentryEnvelope(request: Request): Promise<Response> {
  const destination = sentryEnvelopeEndpoint(process.env.NEXT_PUBLIC_SENTRY_DSN)
  if (!destination) return new Response(null, { status: 404 })
  const envelope = new Uint8Array(await request.arrayBuffer())
  if (sentryEnvelopeEndpoint(envelopeDsn(envelope)) !== destination) return new Response(null, { status: 403 })
  try {
    const upstream = await fetch(destination, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body: envelope,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(SENTRY_UPSTREAM_TIME_LIMIT_MS),
    })
    const body = upstream.body ? await upstream.arrayBuffer() : null
    const headers = new Headers()
    for (const name of SENTRY_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers })
  } catch {
    return new Response(null, { status: 502 })
  }
}

export { forwardSentryEnvelope as POST }
