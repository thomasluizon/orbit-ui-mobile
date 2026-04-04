import { NextResponse } from 'next/server'
import { getRefreshToken, clearSessionCookies } from '@/lib/auth-api'

/**
 * BFF: POST /api/auth/logout
 * Revokes the refresh session on the .NET backend and clears both cookies.
 */
export async function POST() {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'
  const refreshToken = await getRefreshToken()

  // Always clear cookies, even if backend call fails
  await clearSessionCookies()

  if (refreshToken) {
    try {
      await fetch(`${apiBase}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: AbortSignal.timeout(5000),
      })
    } catch {
      // Best-effort: session will expire naturally if revocation fails
    }
  }

  return NextResponse.json({ success: true })
}
