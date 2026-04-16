import { NextResponse, type NextRequest } from 'next/server'
import { setSessionCookies } from '@/lib/auth-api'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function extractErrorMessage(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined
  if (typeof data.error === 'string' && data.error.trim().length > 0) return data.error
  if (typeof data.message === 'string' && data.message.trim().length > 0) return data.message
  return undefined
}

function buildErrorPayload(data: unknown, requestId: string): Record<string, unknown> {
  const fallbackError = extractErrorMessage(data) ?? 'Authentication failed'

  if (isRecord(data)) {
    return {
      ...data,
      error: fallbackError,
      requestId,
    }
  }

  return {
    error: fallbackError,
    requestId,
  }
}

/**
 * BFF: POST /api/auth/google
 * Proxies Supabase OAuth token to .NET backend, sets httpOnly cookies,
 * then returns user data without the token.
 */
export async function POST(request: NextRequest) {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'
  const requestId = request.headers.get('x-orbit-request-id')?.trim() || crypto.randomUUID()
  const responseHeaders = new Headers({
    'X-Orbit-Request-Id': requestId,
  })

  try {
    const body = await request.json() as unknown
    const bodyRecord = isRecord(body) ? body : {}

    const response = await fetch(`${apiBase}/api/auth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Orbit-Request-Id': requestId,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const errorPayload = buildErrorPayload(data, requestId)
      console.error('[auth/google] backend exchange failed', {
        requestId,
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
    return NextResponse.json(safeResponse)
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
