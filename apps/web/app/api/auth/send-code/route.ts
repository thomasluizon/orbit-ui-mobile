import { NextResponse, type NextRequest } from 'next/server'

/**
 * BFF: POST /api/auth/send-code
 * Proxies to .NET backend. Rate limiting is enforced by the backend.
 */
export async function POST(request: NextRequest) {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'

  try {
    const body = await request.json()

    const response = await fetch(`${apiBase}/api/auth/send-code`, {
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

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
