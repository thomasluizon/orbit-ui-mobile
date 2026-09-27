import { createHash, randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { buildGoogleAuthorizeUrl } from '@orbit/shared/utils'

export const GOOGLE_OAUTH_COOKIE = 'orbit_google_oauth'

export function GET(request: NextRequest) {
  const purpose = new URL(request.url).searchParams.get('purpose')
  if (purpose !== 'signin' && purpose !== 'calendar') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'Google sign-in unavailable' }, { status: 500 })

  const verifier = randomBytes(32).toString('hex')
  const state = randomBytes(32).toString('hex')
  const redirectUri = `${new URL(request.url).origin}/auth-callback`
  const codeChallenge = createHash('sha256').update(verifier).digest('base64url')
  const authorizeUrl = buildGoogleAuthorizeUrl({
    clientId, redirectUri, state, codeChallenge, purpose,
  })
  const response = NextResponse.redirect(authorizeUrl)
  response.cookies.set(GOOGLE_OAUTH_COOKIE, JSON.stringify({ verifier, state, redirectUri }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return response
}
