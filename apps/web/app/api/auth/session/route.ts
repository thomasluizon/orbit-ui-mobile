import { NextResponse } from 'next/server'
import { getAccountIdFromToken, resolveServerSession } from '@/lib/auth-api'

/**
 * BFF: GET /api/auth/session
 * Resolves the current session, silently refreshing when needed,
 * and reports whether a failed refresh ended the session.
 */
export async function GET() {
  try {
    const session = await resolveServerSession()
    if (!session.token || !session.expiresAt) {
      return NextResponse.json(
        { expiresAt: null, userId: null, refreshFailed: session.refreshFailed === true },
        { status: 401 },
      )
    }

    return NextResponse.json({
      expiresAt: session.expiresAt,
      userId: getAccountIdFromToken(session.token),
      refreshFailed: false,
    })
  } catch {
    return NextResponse.json(
      { expiresAt: null, userId: null, refreshFailed: false },
      { status: 500 },
    )
  }
}
