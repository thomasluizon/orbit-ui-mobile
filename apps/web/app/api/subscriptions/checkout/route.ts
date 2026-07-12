import { NextResponse, type NextRequest } from 'next/server'
import { resolveServerSession } from '@/lib/auth-api'
import {
  buildForwardedClientHeaders,
  sanitizeClientTimeZone,
} from '@/app/api/_utils/forwarded-client-context'

const NO_STORE_CACHE_CONTROL = 'private, no-store, max-age=0'

/**
 * BFF: POST /api/subscriptions/checkout
 * Dedicated route that proxies checkout session creation to the .NET backend.
 * Forwards the client's real IP via X-Forwarded-For for geolocation-based pricing.
 *
 * This takes precedence over the catch-all proxy because Next.js resolves
 * specific routes before [...path]. The catch-all does NOT forward X-Forwarded-For,
 * which breaks geolocation-based pricing on the backend.
 */

function buildHeaders(
  token: string,
  forwardedClientHeaders: Record<string, string>,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...forwardedClientHeaders,
    Authorization: `Bearer ${token}`,
  }
}

async function proxyCheckout(
  body: string,
  token: string,
  forwardedClientHeaders: Record<string, string>,
): Promise<Response> {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'
  return fetch(`${apiBase}/api/subscriptions/checkout`, {
    method: 'POST',
    headers: buildHeaders(token, forwardedClientHeaders),
    body,
    cache: 'no-store',
  })
}

function resolveForwardedClientHeaders(request: NextRequest): Record<string, string> {
  const forwardedClientHeaders = buildForwardedClientHeaders(request)
  const explicitTimeZone = sanitizeClientTimeZone(request.nextUrl.searchParams.get('timeZone'))
  if (explicitTimeZone) {
    forwardedClientHeaders['X-Orbit-Time-Zone'] = explicitTimeZone
  }
  return forwardedClientHeaders
}

function buildNoStoreJsonResponse(
  body: string,
  status: number,
  contentType = 'application/json',
): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
      'Content-Type': contentType,
    },
  })
}

async function toNoStoreResponse(source: Response): Promise<NextResponse> {
  const data = await source.text()
  return buildNoStoreJsonResponse(
    data,
    source.status,
    source.headers.get('Content-Type') ?? 'application/json',
  )
}

export async function POST(request: NextRequest) {
  const session = await resolveServerSession()
  if (!session.token) {
    return buildNoStoreJsonResponse(JSON.stringify({ error: 'Unauthorized' }), 401)
  }

  const forwardedClientHeaders = resolveForwardedClientHeaders(request)
  const body = await request.text()

  const response = await proxyCheckout(body, session.token, forwardedClientHeaders)

  if (response.status === 401) {
    const refreshedSession = await resolveServerSession({ forceRefresh: true })
    if (refreshedSession.token) {
      const retryResponse = await proxyCheckout(body, refreshedSession.token, forwardedClientHeaders)
      return toNoStoreResponse(retryResponse)
    }
  }

  return toNoStoreResponse(response)
}
