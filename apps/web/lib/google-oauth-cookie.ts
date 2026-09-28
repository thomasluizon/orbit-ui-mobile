import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE, REFRESH_COOKIE } from '@/lib/auth-api'

export const GOOGLE_OAUTH_COOKIE = 'orbit_google_oauth'

export function getGoogleOAuthSessionOwner(request: NextRequest): string {
  const credentials = [
    request.cookies.get(AUTH_COOKIE)?.value ?? null,
    request.cookies.get(REFRESH_COOKIE)?.value ?? null,
  ]
  return createHash('sha256').update(JSON.stringify(credentials)).digest('hex')
}
