import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { API } from '@orbit/shared/api'
import { appleStartResponseSchema } from '@orbit/shared/types/auth'
import { isValidReferralCode, resolveSystemLocale } from '@orbit/shared/utils'
import { API_VERSION_HEADERS } from '@/lib/api-version'
import { buildBffForwardingHeaders } from '@/app/api/_utils/bff-forwarding'
import { getGoogleOAuthSessionOwner } from '@/lib/google-oauth-cookie'
import { APPLE_OAUTH_COOKIE } from '@/lib/apple-oauth-cookie'

function unavailable(request: NextRequest) {
  return NextResponse.redirect(new URL('/login?appleError=1', process.env.NEXT_PUBLIC_SITE_URL ?? request.url), 303)
}

export async function GET(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_APPLE_CLIENT_ID) {
    return unavailable(request)
  }
  const state = randomBytes(32).toString('hex')
  const language = resolveSystemLocale(new URL(request.url).searchParams.get('language'))
  const referralCode = request.cookies.get('referral_code')?.value
  try {
    const upstream = await fetch(`${process.env.API_BASE ?? 'http://localhost:5000'}${API.auth.appleStart}`, {
      method: 'POST',
      headers: { ...API_VERSION_HEADERS, ...buildBffForwardingHeaders(request), 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, language, ...(isValidReferralCode(referralCode) ? { referralCode } : {}) }),
      cache: 'no-store', signal: request.signal,
    })
    if (!upstream.ok) return unavailable(request)
    const { authorizationUrl } = appleStartResponseSchema.parse(await upstream.json())
    const destination = new URL(authorizationUrl)
    if (destination.protocol !== 'https:' || destination.hostname !== 'appleid.apple.com' || destination.pathname !== '/auth/authorize') {
      throw new Error('Invalid authorization URL')
    }
    const response = NextResponse.redirect(destination)
    response.headers.set('Cache-Control', 'no-store')
    response.cookies.set(APPLE_OAUTH_COOKIE, JSON.stringify({ state, sessionOwner: getGoogleOAuthSessionOwner(request) }), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 300,
    })
    return response
  } catch {
    return unavailable(request)
  }
}
