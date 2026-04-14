import { NextResponse, type NextRequest } from 'next/server'
import { setSessionCookies } from '@/lib/auth-api'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { buildForwardedClientHeaders } from '../../_utils/forwarded-client-context'

/**
 * BFF: POST /api/auth/google
 * Proxies Supabase OAuth token to .NET backend, sets httpOnly cookies,
 * then returns user data without the token.
 * Forwards client IP and geo headers so backend rate-limit partitions per user, not per Next.js server.
 */
export async function POST(request: NextRequest) {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'

  try {
    const body = await request.json()

    const response = await fetch(`${apiBase}/api/auth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildForwardedClientHeaders(request),
      },
      body: JSON.stringify(body),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(data ?? { error: 'Authentication failed' }, {
        status: response.status,
      })
    }

    const loginResponse = data as BackendLoginResponse

    // Set httpOnly cookies server-side
    await setSessionCookies(loginResponse.token, loginResponse.refreshToken)

    // Strip tokens from response
    const { token: _token, refreshToken: _refreshToken, ...safeResponse } = loginResponse
    return NextResponse.json(safeResponse)
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
