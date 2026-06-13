import { NextResponse } from 'next/server'
import { resolveServerSession } from '@/lib/auth-api'
import { logAuthRouteFailure, resolveRequestId } from '@/lib/auth-proxy'

/**
 * BFF: GET /api/auth/session
 * Resolves the current session, silently refreshing when needed,
 * and returns { expiresAt } for the active access token.
 */
export async function GET() {
  try {
    const session = await resolveServerSession()
    if (!session.token || !session.expiresAt) {
      return NextResponse.json({ expiresAt: null }, { status: 401 })
    }

    return NextResponse.json({ expiresAt: session.expiresAt })
  } catch (error) {
    logAuthRouteFailure('session', resolveRequestId(null), error)
    return NextResponse.json({ expiresAt: null }, { status: 500 })
  }
}
