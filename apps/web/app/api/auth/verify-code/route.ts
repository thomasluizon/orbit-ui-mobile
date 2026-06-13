import { NextResponse, type NextRequest } from 'next/server'
import { setSessionCookies } from '@/lib/auth-api'
import {
  buildAuthErrorPayload,
  buildRequestIdResponseHeaders,
  logAuthRouteFailure,
  ORBIT_REQUEST_ID_HEADER,
  resolveRequestId,
  resolveResponseRequestId,
} from '@/lib/auth-proxy'
import { verifyCodeRequestSchema, type BackendLoginResponse } from '@orbit/shared/types/auth'

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

    const response = await fetch(`${apiBase}/api/auth/verify-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [ORBIT_REQUEST_ID_HEADER]: requestId,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json().catch(() => null)
    const backendRequestId = resolveResponseRequestId(response, requestId)
    responseHeaders.set(ORBIT_REQUEST_ID_HEADER, backendRequestId)

    if (!response.ok) {
      return NextResponse.json(buildAuthErrorPayload(data, backendRequestId), {
        status: response.status,
        headers: responseHeaders,
      })
    }

    const loginResponse = data as BackendLoginResponse

    await setSessionCookies(loginResponse.token, loginResponse.refreshToken)

    const { token: _token, refreshToken: _refreshToken, ...safeResponse } = loginResponse
    return NextResponse.json(safeResponse, {
      headers: responseHeaders,
    })
  } catch (error) {
    logAuthRouteFailure('verify-code', requestId, error)
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
