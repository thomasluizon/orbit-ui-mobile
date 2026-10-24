import { createHash, randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { buildGoogleAuthorizeUrl } from '@orbit/shared/utils'
import { getGoogleOAuthSessionOwner, GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'
import { desktopAttemptSchema, desktopRedirectUri } from '@/lib/desktop-auth'

export function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams
  const purpose = params.get('purpose')
  if (purpose !== 'signin' && purpose !== 'calendar') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'Google sign-in unavailable' }, { status: 500 })

  const desktop = params.has('desktopState') || params.has('codeChallenge')
    ? desktopAttemptSchema.safeParse({ state: params.get('desktopState'),
      codeChallenge: params.get('codeChallenge'), redirectUri: desktopRedirectUri() })
    : null
  if (desktop && (!desktop.success || purpose !== 'signin')) {
    return NextResponse.json({ error: 'Invalid desktop request' }, { status: 400 })
  }

  const verifier = randomBytes(32).toString('hex')
  const state = randomBytes(32).toString('hex')
  const redirectUri = new URL('/auth-callback', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').toString()
  const codeChallenge = createHash('sha256').update(verifier).digest('base64url')
  const authorizeUrl = buildGoogleAuthorizeUrl({
    clientId, redirectUri, state, codeChallenge, purpose,
  })
  const response = NextResponse.redirect(authorizeUrl)
  response.cookies.set(GOOGLE_OAUTH_COOKIE, JSON.stringify({
    verifier, state, redirectUri, sessionOwner: getGoogleOAuthSessionOwner(request),
    ...(desktop?.success ? { desktop: desktop.data } : {}),
  }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return response
}
