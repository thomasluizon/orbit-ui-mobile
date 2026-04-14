import { NextResponse, type NextRequest } from 'next/server'
import { buildForwardedClientHeaders } from '../../_utils/forwarded-client-context'

/**
 * BFF: POST /api/auth/send-code
 * Proxies to .NET backend. Rate limiting is enforced by the backend.
 * Forwards client IP and geo headers so backend rate-limit partitions per user, not per Next.js server.
 */
export async function POST(request: NextRequest) {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'

  try {
    const body = await request.json()

    const url = `${apiBase}/api/auth/send-code`

    const response = await fetch(url, {
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

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
