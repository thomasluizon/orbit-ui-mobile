import { NextResponse, type NextRequest } from 'next/server'

/**
 * BFF: POST /api/auth/send-code
 * Proxies to .NET backend. Rate limiting is enforced by the backend.
 */
export async function POST(request: NextRequest) {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'

  try {
    const body = await request.json()

    const url = `${apiBase}/api/auth/send-code`
    console.log('[send-code] POST', url)

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    console.log('[send-code] response status:', response.status)

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      console.log('[send-code] error data:', JSON.stringify(data))
      return NextResponse.json(data ?? { error: 'Authentication failed' }, {
        status: response.status,
      })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error('[send-code] fetch failed:', err)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
