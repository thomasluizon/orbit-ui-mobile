import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { googleCodeAuthResponseSchema } from '@orbit/shared/types/auth'
import { API_VERSION_HEADERS } from '@/lib/api-version'
import { buildBffForwardingHeaders } from '@/app/api/_utils/bff-forwarding'
import { desktopAttemptSchema, desktopRedirectUri } from '@/lib/desktop-auth'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'

const pendingSchema = z.object({
  state: z.string(), verifier: z.string(), redirectUri: z.string(),
  desktop: desktopAttemptSchema,
})

export async function GET(request: NextRequest) {
  let pendingValue: unknown = null
  try { pendingValue = JSON.parse(request.cookies.get(GOOGLE_OAUTH_COOKIE)?.value ?? 'null') } catch { pendingValue = null }
  const pending = pendingSchema.safeParse(pendingValue)
  const params = request.nextUrl.searchParams
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  if (!pending.success || params.get('state') !== pending.data.state
    || pending.data.desktop.redirectUri !== desktopRedirectUri()) {
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400, headers })
  }
  const attempt = pending.data
  const destination = new URL(attempt.desktop.redirectUri)
  destination.searchParams.set('state', attempt.desktop.state)
  try {
    if (params.has('error') || !params.get('code')) {
      throw new Error('Google sign-in cancelled')
    }
    const login = await fetch(`${process.env.API_BASE ?? 'http://localhost:5000'}/api/auth/google/code`, {
      method: 'POST', headers: { ...API_VERSION_HEADERS, ...buildBffForwardingHeaders(request), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: params.get('code'), codeVerifier: attempt.verifier, redirectUri: attempt.redirectUri,
        language: request.cookies.get('i18n_locale')?.value ?? 'en', referralCode: request.cookies.get('referral_code')?.value }),
    })
    if (!login.ok) throw new Error('Google sign-in failed')
    const account = googleCodeAuthResponseSchema.parse(await login.json())
    const handoff = await fetch(`${process.env.API_BASE ?? 'http://localhost:5000'}/api/auth/desktop/handoff`, {
      method: 'POST', headers: { ...API_VERSION_HEADERS, ...buildBffForwardingHeaders(request),
        'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
      body: JSON.stringify({ ...attempt.desktop, codeChallengeMethod: 'S256' }),
    })
    if (!handoff.ok) throw new Error('Desktop handoff failed')
    const grant = z.object({ code: z.string().regex(/^[a-fA-F0-9]{64}$/), expiresIn: z.literal(60) }).parse(await handoff.json())
    destination.searchParams.set('code', grant.code)
  } catch {
    destination.searchParams.set('error', 'authentication_failed')
  }
  const response = NextResponse.redirect(destination, { status: 303, headers })
  response.cookies.delete(GOOGLE_OAUTH_COOKIE)
  return response
}
