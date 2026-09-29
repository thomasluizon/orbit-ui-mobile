import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE, REFRESH_COOKIE, getAccountIdFromToken } from '@/lib/auth-api'

export const GOOGLE_OAUTH_COOKIE = 'orbit_google_oauth'

export function getGoogleOAuthSessionOwner(request: NextRequest): string {
  const authToken = request.cookies.get(AUTH_COOKIE)?.value
  const accountId = authToken ? getAccountIdFromToken(authToken) : null
  if (accountId) return `account:${accountId}`
  const credentials = [
    authToken ?? null,
    request.cookies.get(REFRESH_COOKIE)?.value ?? null,
  ]
  return `credentials:${createHash('sha256').update(JSON.stringify(credentials)).digest('hex')}`
}
