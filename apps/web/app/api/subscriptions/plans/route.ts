import { NextResponse, type NextRequest } from 'next/server'
import { getAuthToken, tryRefreshSession } from '@/lib/auth-api'
import { buildForwardedClientHeaders } from '@/app/api/_utils/forwarded-client-context'

const NO_STORE_CACHE_CONTROL = 'private, no-store, max-age=0'

/**
 * BFF: GET /api/subscriptions/plans
 * Dedicated route that proxies plan pricing to the .NET backend.
 * Forwards the client's real IP via X-Forwarded-For for geolocation-based pricing.
 *
 * This takes precedence over the catch-all proxy because Next.js resolves
 * specific routes before [...path]. The catch-all does NOT forward X-Forwarded-For,
 * which breaks geolocation-based pricing on the backend.
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

export async function GET(request: NextRequest) {
  const token = await getAuthToken()
  const forwardedClientHeaders = buildForwardedClientHeaders(request)

  const response = await proxyPlans(token, forwardedClientHeaders)

  if (response.status === 401) {
    const newToken = await tryRefreshSession()
    if (newToken) {
      const retryResponse = await proxyPlans(newToken, forwardedClientHeaders)
      const retryData = await retryResponse.text()
      return new NextResponse(retryData, {
        status: retryResponse.status,
        headers: {
          'Cache-Control': NO_STORE_CACHE_CONTROL,
          'Content-Type': retryResponse.headers.get('Content-Type') ?? 'application/json',
        },
      })
    }
  }

  const data = await response.text()
  return new NextResponse(data, {
    status: response.status,
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
    },
  })
}
