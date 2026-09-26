import { NextResponse, type NextRequest } from 'next/server'
import { resolveServerSession } from '@/lib/auth-api'
import {
  buildForwardedClientHeaders,
  sanitizeClientTimeZone,
} from '@/app/api/_utils/forwarded-client-context'
import { buildSessionRefreshHeaders } from '@/lib/session-refresh'

const NO_STORE_CACHE_CONTROL = 'private, no-store, max-age=0'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * BFF: GET /api/subscriptions/plans Dedicated route that proxies plan pricing to the .NET
 * backend. This takes precedence over the catch-all proxy because Next.js resolves specific
 * routes before [...path].
 */

function buildHeaders(
  token: string | null,
  forwardedClientHeaders: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...forwardedClientHeaders,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function proxyPlans(
  token: string | null,
  forwardedClientHeaders: Record<string, string>,
): Promise<Response> {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'
  return fetch(`${apiBase}/api/subscriptions/plans`, {
    method: 'GET',
    headers: buildHeaders(token, forwardedClientHeaders),
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

async function toNoStoreResponse(
  source: Response,
  refreshFailed = false,
): Promise<NextResponse> {
  const body = await source.text()
  return new NextResponse(body, {
    status: source.status,
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
      'Content-Type': source.headers.get('Content-Type') ?? 'application/json',
      ...buildSessionRefreshHeaders(refreshFailed),
    },
  })
}

export async function GET(request: NextRequest) {
  const session = await resolveServerSession()
  const forwardedClientHeaders = resolveForwardedClientHeaders(request)

  const response = await proxyPlans(session.token, forwardedClientHeaders)

  if (response.status === 401) {
    const refreshedSession = await resolveServerSession({ forceRefresh: true })
    if (refreshedSession.token) {
      const retryResponse = await proxyPlans(refreshedSession.token, forwardedClientHeaders)
      return toNoStoreResponse(retryResponse)
    }
    return toNoStoreResponse(
      response,
      session.refreshFailed || refreshedSession.refreshFailed,
    )
  }

  return toNoStoreResponse(response, session.refreshFailed)
}
