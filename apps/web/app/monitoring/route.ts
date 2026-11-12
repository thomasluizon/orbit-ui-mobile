import { z } from 'zod'

const ENVELOPE_HEADER_END = 0x0a
const SENTRY_RESPONSE_HEADERS = ['content-type', 'retry-after', 'x-sentry-rate-limits']
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
  const upstream = await fetch(destination, {
    method: 'POST',
    headers: { 'content-type': 'application/x-sentry-envelope' },
    body: envelope,
    redirect: 'manual',
    cache: 'no-store',
  })
  const headers = new Headers()
  for (const name of SENTRY_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers })
}

export { forwardSentryEnvelope as POST }
