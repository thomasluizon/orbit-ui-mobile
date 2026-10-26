import { Duplex } from 'node:stream'
import { createBrotliCompress, createDeflate, createGzip } from 'node:zlib'

const CLIENT_CLOSED_REQUEST = 499
const POSTHOG_ORIGIN = 'https://us.i.posthog.com'
const POSTHOG_ASSET_ORIGIN = 'https://us-assets.i.posthog.com'
const POSTHOG_PATH_PREFIXES = [
  '/e/', '/s/', '/i/', '/flags/', '/static/', '/array/',
  '/api/surveys/', '/api/early_access_features/', '/api/product_tours/',
  '/api/web_experiments/', '/api/conversations/v1/widget/',
]

const CONTENT_ENCODERS: Record<string, (() => Duplex) | undefined> = {
  gzip: createGzip,
  'x-gzip': createGzip,
  deflate: createDeflate,
  br: createBrotliCompress,
}

function endToEndHeaders(original: Headers): Headers {
  const headers = new Headers(original)
  const connectionHeaders = headers.get('connection')?.split(',').map(header => header.trim()) ?? []
  for (const header of [...connectionHeaders, 'connection', 'keep-alive', 'proxy-authenticate',
    'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length']) {
    headers.delete(header)
  }
  return headers
}

function restoreFetchContentEncoding(upstream: Response): ReadableStream<Uint8Array> | null {
  let body: ReadableStream<Uint8Array> | null = upstream.body
  const encoding = upstream.headers.get('content-encoding')
  if (!body || !encoding) return body
  const encoders = encoding.toLowerCase().split(',').map(coding => CONTENT_ENCODERS[coding.trim()])
  if (encoders.some(encoder => !encoder)) return body
  for (const encoder of encoders) {
    if (encoder) {
      body = body.pipeThrough(Duplex.toWeb(encoder()) as ReadableWritablePair<Uint8Array, Uint8Array>)
    }
  }
  return body
}

function postHogDestination(requestUrl: string): URL | null {
  const { pathname, search } = new URL(requestUrl)
  if (!pathname.startsWith('/ingest/')) return null
  const path = pathname.slice('/ingest'.length)
  if (!POSTHOG_PATH_PREFIXES.some(prefix => path.startsWith(prefix)) || /%(?:2f|5c|25)/i.test(path)) return null
  const origin = path.startsWith('/static/') || path.startsWith('/array/')
    ? POSTHOG_ASSET_ORIGIN
    : POSTHOG_ORIGIN
  return new URL(path + search, origin)
}

async function forwardPostHog(request: Request): Promise<Response> {
  const url = postHogDestination(request.url)
  if (!url) return new Response(null, { status: 404 })
  const headers = endToEndHeaders(request.headers)
  headers.set('host', url.hostname)
  headers.set('accept-encoding', 'gzip, deflate, br')
  headers.delete('cookie')
  headers.delete('authorization')
  const options: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers,
    body: request.body,
    signal: request.signal,
    redirect: 'manual',
    cache: 'no-store',
    duplex: 'half',
  }
  let upstream: Response
  try {
    upstream = await fetch(url, options)
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: CLIENT_CLOSED_REQUEST })
    throw error
  }
  return new Response(restoreFetchContentEncoding(upstream), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: endToEndHeaders(upstream.headers),
  })
}

export { forwardPostHog as GET, forwardPostHog as POST, forwardPostHog as HEAD, forwardPostHog as OPTIONS }
