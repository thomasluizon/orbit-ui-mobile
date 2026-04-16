import { NextResponse, type NextRequest } from 'next/server'
import { setSessionCookies } from '@/lib/auth-api'
import {
  buildAuthErrorPayload,
  buildEmailLogContext,
  buildRequestIdResponseHeaders,
  extractErrorMessage,
  isRecord,
  ORBIT_REQUEST_ID_HEADER,
  resolveRequestId,
  resolveResponseRequestId,
} from '@/lib/auth-proxy'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'

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
    const body = await request.json() as unknown
    const bodyRecord = isRecord(body) ? body : {}

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
      console.error('[auth/verify-code] backend request failed', {
        requestId: backendRequestId,
        status: response.status,
        error: extractErrorMessage(data) ?? 'Authentication failed',
        language: typeof bodyRecord.language === 'string' ? bodyRecord.language : undefined,
        codeLength: typeof bodyRecord.code === 'string' ? bodyRecord.code.length : undefined,
        hasReferralCode: typeof bodyRecord.referralCode === 'string' && bodyRecord.referralCode.length > 0,
        ...buildEmailLogContext(bodyRecord.email),
      })

      return NextResponse.json(buildAuthErrorPayload(data, backendRequestId), {
        status: response.status,
        headers: responseHeaders,
      })
    }

    const loginResponse = data as BackendLoginResponse

    // Set httpOnly cookies server-side
    await setSessionCookies(loginResponse.token, loginResponse.refreshToken)

    // Strip tokens from response -- client must never see them
    const { token: _token, refreshToken: _refreshToken, ...safeResponse } = loginResponse
    return NextResponse.json(safeResponse, {
      headers: responseHeaders,
    })
  } catch (error: unknown) {
    console.error('[auth/verify-code] unexpected error', {
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
