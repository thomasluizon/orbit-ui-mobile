import { NextResponse, type NextRequest } from 'next/server'
import { setSessionCookies } from '@/lib/auth-api'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'

/**
 * BFF: POST /api/auth/verify-code
 * Proxies to .NET backend, sets httpOnly auth + refresh cookies,
 * then returns user data without the token.
 */
export async function POST(request: NextRequest) {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'

  try {
    const body = await request.json()

    const response = await fetch(`${apiBase}/api/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    // Strip tokens from response -- client must never see them
    const { token: _token, refreshToken: _refreshToken, ...safeResponse } = loginResponse
    return NextResponse.json(safeResponse)
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
