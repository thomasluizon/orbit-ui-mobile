import { NextResponse, type NextRequest } from 'next/server'
import { getAuthToken, tryRefreshSession } from '@/lib/auth-api'

/**
 * BFF: GET /api/subscriptions/plans
 * Dedicated route that proxies plan pricing to the .NET backend.
 * Forwards the client's real IP via X-Forwarded-For for geolocation-based pricing.
 *
 * This takes precedence over the catch-all proxy because Next.js resolves
 * specific routes before [...path]. The catch-all does NOT forward X-Forwarded-For,
 * which breaks geolocation-based pricing on the backend.
 */

const IP_PATTERN = /^[\d.:a-fA-F]+$/

function getClientIp(request: NextRequest): string {
  const forwardedRaw = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  const realIpRaw = request.headers.get('x-real-ip') ?? ''
  return [forwardedRaw, realIpRaw].find((ip) => ip && IP_PATTERN.test(ip)) ?? ''
}

function buildHeaders(token: string | null, clientIp: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Forwarded-For': clientIp,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function proxyPlans(
  token: string | null,
  clientIp: string,
): Promise<Response> {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'
  return fetch(`${apiBase}/api/subscriptions/plans`, {
    method: 'GET',
    headers: buildHeaders(token, clientIp),
  })
}

export async function GET(request: NextRequest) {
  const token = await getAuthToken()
  const clientIp = getClientIp(request)

  const response = await proxyPlans(token, clientIp)

  if (response.status === 401) {
    const newToken = await tryRefreshSession()
    if (newToken) {
      const retryResponse = await proxyPlans(newToken, clientIp)
      const retryData = await retryResponse.text()
      return new NextResponse(retryData, {
        status: retryResponse.status,
        headers: {
          'Content-Type': retryResponse.headers.get('Content-Type') ?? 'application/json',
        },
      })
    }
  }

  const data = await response.text()
  return new NextResponse(data, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
    },
  })
}
