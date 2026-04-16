import { NextResponse, type NextRequest } from 'next/server'
import { setSessionCookies } from '@/lib/auth-api'
import {
  buildAuthErrorPayload,
  buildRequestIdResponseHeaders,
  extractErrorMessage,
  isRecord,
  ORBIT_REQUEST_ID_HEADER,
  resolveRequestId,
  resolveResponseRequestId,
} from '@/lib/auth-proxy'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'

/**
 * BFF: POST /api/auth/google
 * Proxies Supabase OAuth token to .NET backend, sets httpOnly cookies,
 * then returns user data without the token.
 */
export async function POST(request: NextRequest) {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'
  const requestId = resolveRequestId(request.headers.get(ORBIT_REQUEST_ID_HEADER))
  const responseHeaders = buildRequestIdResponseHeaders(requestId)

  try {
    const body = await request.json() as unknown
    const bodyRecord = isRecord(body) ? body : {}

    const response = await fetch(`${apiBase}/api/auth/google`, {
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
      const errorPayload = buildAuthErrorPayload(data, backendRequestId)
      console.error('[auth/google] backend exchange failed', {
        requestId: backendRequestId,
        status: response.status,
        error: extractErrorMessage(data) ?? 'Authentication failed',
        language: typeof bodyRecord.language === 'string' ? bodyRecord.language : undefined,
        hasAccessToken: typeof bodyRecord.accessToken === 'string' && bodyRecord.accessToken.length > 0,
        hasGoogleAccessToken: typeof bodyRecord.googleAccessToken === 'string' && bodyRecord.googleAccessToken.length > 0,
        hasGoogleRefreshToken: typeof bodyRecord.googleRefreshToken === 'string' && bodyRecord.googleRefreshToken.length > 0,
        hasReferralCode: typeof bodyRecord.referralCode === 'string' && bodyRecord.referralCode.length > 0,
      })

      return NextResponse.json(errorPayload, {
        status: response.status,
        headers: responseHeaders,
      })
    }

    const loginResponse = data as BackendLoginResponse

    // Set httpOnly cookies server-side
    await setSessionCookies(loginResponse.token, loginResponse.refreshToken)

    // Strip tokens from response
    const { token: _token, refreshToken: _refreshToken, ...safeResponse } = loginResponse
    return NextResponse.json(safeResponse, {
      headers: responseHeaders,
    })
  } catch (error: unknown) {
    console.error('[auth/google] unexpected error', {
      requestId,
      error,
    })

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
