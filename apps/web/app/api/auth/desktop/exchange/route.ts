import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { backendLoginResponseSchema } from '@orbit/shared/types/auth'
import { setSessionCookies } from '@/lib/auth-api'
import { API_VERSION_HEADERS } from '@/lib/api-version'
import { buildBffForwardingHeaders } from '@/app/api/_utils/bff-forwarding'
import { desktopRedirectUri } from '@/lib/desktop-auth'

const exchangeSchema = z.object({
  code: z.string().regex(/^[a-fA-F0-9]{64}$/), state: z.string().regex(/^[a-f0-9]{64}$/),
  codeVerifier: z.string().regex(/^[A-Za-z0-9_.~-]{43,128}$/), redirectUri: z.string(),
})

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  const parsed = exchangeSchema.safeParse(await request.json().catch(() => null))
  const origin = request.headers.get('origin')
  if (!parsed.success || parsed.data.redirectUri !== desktopRedirectUri()
    || (origin && origin !== process.env.NEXT_PUBLIC_SITE_URL)) {
    return NextResponse.json({ error: 'Invalid desktop request' }, { status: 400, headers })
  }
  try {
    const upstream = await fetch(`${process.env.API_BASE ?? 'http://localhost:5000'}/api/auth/desktop/exchange`, {
      method: 'POST', headers: { ...API_VERSION_HEADERS, ...buildBffForwardingHeaders(request), 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data), signal: request.signal,
    })
    if (!upstream.ok) return NextResponse.json({ error: 'Desktop sign-in failed' }, { status: upstream.status, headers })
    const account = backendLoginResponseSchema.parse(await upstream.json())
    if (request.signal.aborted) return new NextResponse(null, { status: 409, headers })
    const response = NextResponse.json({}, { headers })
    await setSessionCookies(account.token, account.refreshToken, response.cookies)
    return response
  } catch {
    return NextResponse.json({ error: 'Desktop sign-in failed' }, { status: 500, headers })
  }
}
