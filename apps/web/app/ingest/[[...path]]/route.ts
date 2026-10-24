import { Duplex } from 'node:stream'
import { createBrotliCompress, createDeflate, createGzip } from 'node:zlib'

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

async function forwardPostHog(request: Request): Promise<Response> {
  const url = new URL(request.url)
  url.pathname = url.pathname.replace(/^\/ingest/, '') || '/'
  url.protocol = 'https:'
  url.hostname = url.pathname.startsWith('/static/') || url.pathname.startsWith('/array/')
    ? 'us-assets.i.posthog.com'
    : 'us.i.posthog.com'
  url.port = ''
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
  const upstream = await fetch(url, options)
  return new Response(restoreFetchContentEncoding(upstream), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: endToEndHeaders(upstream.headers),
  })
}

export { forwardPostHog as GET, forwardPostHog as POST, forwardPostHog as HEAD, forwardPostHog as OPTIONS }
