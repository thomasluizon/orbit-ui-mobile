import { API_VERSION_HEADERS } from '@/lib/api-version'
import { resolveSystemLocale } from '@orbit/shared/utils'
import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIE, REFRESH_COOKIE, resolveSessionTokens, setSessionCookies, type SessionTokens } from '@/lib/auth-api'
import { buildBffForwardingHeaders } from '@/app/api/_utils/bff-forwarding'
import {
  buildAuthErrorPayload,
  buildRequestIdResponseHeaders,
  ORBIT_REQUEST_ID_HEADER,
  resolveRequestId,
  resolveResponseRequestId,
} from '@/lib/auth-proxy'
import { verifyCodeRequestSchema, type BackendLoginResponse } from '@orbit/shared/types/auth'

function isCancelled(request: NextRequest): boolean { return request.signal.aborted }

async function preserveExistingSession(request: NextRequest): Promise<NextResponse | null> {
  const authToken = request.cookies.get(AUTH_COOKIE)?.value ?? null
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value ?? null
  if (!authToken && !refreshToken) return null
  const refreshed: { tokens: SessionTokens | null } = { tokens: null }
  const session = await resolveSessionTokens({
    authToken, refreshToken,
    persistSession: (tokens) => { refreshed.tokens = tokens },
  })
  if (!session.token) return null
  const result = NextResponse.json({ error: 'Authentication session changed' }, { status: 409 })
  if (refreshed.tokens) await setSessionCookies(refreshed.tokens.token, refreshed.tokens.refreshToken, result.cookies)
  return result
}

/**
 * BFF: POST /api/auth/verify-code
 * Proxies to .NET backend, sets httpOnly auth + refresh cookies,
 * then returns user data without the token.
 */
export async function POST(request: NextRequest) {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'
  const requestId = resolveRequestId(request.headers.get(ORBIT_REQUEST_ID_HEADER))
  const responseHeaders = buildRequestIdResponseHeaders(requestId)

  try {
    const parsed = verifyCodeRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', requestId },
        { status: 400, headers: responseHeaders },
      )
    }
    const body = parsed.data
    const existingSession = await preserveExistingSession(request)
    if (existingSession || isCancelled(request)) return existingSession ?? new NextResponse(null, { status: 409 })

    const response = await fetch(`${apiBase}/api/auth/verify-code`, {
      method: 'POST',
      headers: {
        ...buildBffForwardingHeaders(request),
        'Content-Type': 'application/json', 'Accept-Language': resolveSystemLocale(body.language),
        [ORBIT_REQUEST_ID_HEADER]: requestId,
        ...API_VERSION_HEADERS,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    })

    const data: unknown = await response.json().catch(() => null)
    const backendRequestId = resolveResponseRequestId(response, requestId)
    responseHeaders.set(ORBIT_REQUEST_ID_HEADER, backendRequestId)

    if (!response.ok) {
      return NextResponse.json(buildAuthErrorPayload(data, backendRequestId), {
        status: response.status,
        headers: responseHeaders,
      })
    }

    const loginResponse = data as BackendLoginResponse

    if (isCancelled(request)) return new NextResponse(null, { status: 409 })
    const { token: _token, refreshToken: _refreshToken, ...safeResponse } = loginResponse
    const result = NextResponse.json(safeResponse, { headers: responseHeaders })
    await setSessionCookies(loginResponse.token, loginResponse.refreshToken, result.cookies)
    return isCancelled(request) ? new NextResponse(null, { status: 409 }) : result
  } catch {
    return NextResponse.json(
      {
        error: 'Authentication failed',
        requestId,
      },
      {
        status: 500,
        headers: responseHeaders,
      },
    )
  }
}
