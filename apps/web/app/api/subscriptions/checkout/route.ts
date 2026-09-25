import { NextResponse, type NextRequest } from 'next/server'
import { getAccountIdFromToken, resolveServerSession } from '@/lib/auth-api'
import { ACCOUNT_CHANGED_ERROR_CODE } from '@/app/actions/action-result'
import {
  buildForwardedClientHeaders,
  sanitizeClientTimeZone,
} from '@/app/api/_utils/forwarded-client-context'
import { buildSessionRefreshHeaders } from '@/lib/session-refresh'

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
  refreshFailed = false,
): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
      'Content-Type': contentType,
      ...buildSessionRefreshHeaders(refreshFailed),
    },
  })
}

async function toNoStoreResponse(
  source: Response,
  refreshFailed = false,
): Promise<NextResponse> {
  const data = await source.text()
  return buildNoStoreJsonResponse(
    data,
    source.status,
    source.headers.get('Content-Type') ?? 'application/json',
    refreshFailed,
  )
}

export async function POST(request: NextRequest) {
  const session = await resolveServerSession()
  if (!session.token) {
    return buildNoStoreJsonResponse(
      JSON.stringify({ error: 'Unauthorized' }),
      401,
      'application/json',
      session.refreshFailed,
    )
  }

  const heldAccountId = request.headers.get('x-orbit-held-account-id')
  const cookieAccountId = getAccountIdFromToken(session.token)
  if (heldAccountId && cookieAccountId && cookieAccountId !== heldAccountId) {
    return buildNoStoreJsonResponse(
      JSON.stringify({ error: 'Account changed', errorCode: ACCOUNT_CHANGED_ERROR_CODE }),
      409,
    )
  }

  const forwardedClientHeaders = resolveForwardedClientHeaders(request)
  const body = await request.text()

  const response = await proxyCheckout(body, session.token, forwardedClientHeaders)

  if (response.status === 401) {
    const refreshedSession = await resolveServerSession({ forceRefresh: true })
    if (refreshedSession.token) {
      const refreshedAccountId = getAccountIdFromToken(refreshedSession.token)
      if (heldAccountId && refreshedAccountId && refreshedAccountId !== heldAccountId) {
        return buildNoStoreJsonResponse(
          JSON.stringify({ error: 'Account changed', errorCode: ACCOUNT_CHANGED_ERROR_CODE }),
          409,
        )
      }
      const retryResponse = await proxyCheckout(body, refreshedSession.token, forwardedClientHeaders)
      return toNoStoreResponse(retryResponse)
    }
    return toNoStoreResponse(response, refreshedSession.refreshFailed)
  }

  return toNoStoreResponse(response)
}
