import { resolveSystemLocale } from '@orbit/shared/utils'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { setSessionCookies } from '@/lib/auth-api'
import { buildAuthErrorPayload, buildRequestIdResponseHeaders, ORBIT_REQUEST_ID_HEADER, resolveRequestId, resolveResponseRequestId } from '@/lib/auth-proxy'
import { googleCodeAuthRequestSchema, googleCodeAuthResponseSchema } from '@orbit/shared/types/auth'
import { getGoogleOAuthSessionOwner, GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  language: z.string(),
  referralCode: z.string().optional(),
})

export function DELETE(request: NextRequest) {
  const response = NextResponse.json({})
  const state = new URL(request.url).searchParams.get('state')
  const pendingRaw = request.cookies.get(GOOGLE_OAUTH_COOKIE)?.value
  if (state && pendingRaw) {
    try {
      const pending: unknown = JSON.parse(pendingRaw)
      if (z.object({ state: z.string() }).safeParse(pending).data?.state === state) {
        response.cookies.delete(GOOGLE_OAUTH_COOKIE)
      }
    } catch { return response }
  }
  return response
}

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(ORBIT_REQUEST_ID_HEADER))
  const headers = buildRequestIdResponseHeaders(requestId)
  const finish = (response: NextResponse) => {
    response.cookies.delete(GOOGLE_OAUTH_COOKIE)
    return response
  }
  const pendingRaw = request.cookies.get(GOOGLE_OAUTH_COOKIE)?.value
  let pendingValue: unknown = null
  try { pendingValue = pendingRaw ? JSON.parse(pendingRaw) : null } catch { pendingValue = null }
  const pending = z.object({
    verifier: z.string(), state: z.string(), redirectUri: z.string(), sessionOwner: z.string(),
  }).safeParse(pendingValue)
  const callback = callbackSchema.safeParse(await request.json().catch(() => null))
  if (!pending.success || !callback.success || pending.data.state !== callback.data.state) {
    return NextResponse.json({ error: 'Invalid OAuth state', requestId }, { status: 400, headers })
  }
  if (pending.data.sessionOwner !== getGoogleOAuthSessionOwner(request)) {
    return finish(NextResponse.json({ error: 'Authentication session changed', requestId }, { status: 400, headers }))
  }

  const body = googleCodeAuthRequestSchema.parse({
    code: callback.data.code,
    codeVerifier: pending.data.verifier,
    redirectUri: pending.data.redirectUri,
    language: callback.data.language,
    ...(callback.data.referralCode ? { referralCode: callback.data.referralCode } : {}),
  })
  try {
    const response = await fetch(`${process.env.API_BASE ?? 'http://localhost:5000'}/api/auth/google/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': resolveSystemLocale(body.language), [ORBIT_REQUEST_ID_HEADER]: requestId },
      body: JSON.stringify(body),
    })
    const data: unknown = await response.json().catch(() => null)
    const backendRequestId = resolveResponseRequestId(response, requestId)
    headers.set(ORBIT_REQUEST_ID_HEADER, backendRequestId)
    if (!response.ok) return finish(NextResponse.json(buildAuthErrorPayload(data, backendRequestId), { status: response.status, headers }))
    const loginResponse = googleCodeAuthResponseSchema.parse(data)
    await setSessionCookies(loginResponse.token, loginResponse.refreshToken)
    const { token: _token, refreshToken: _refreshToken, ...safeResponse } = loginResponse
    return finish(NextResponse.json(safeResponse, { headers }))
  } catch {
    return finish(NextResponse.json({ error: 'Authentication failed', requestId }, { status: 500, headers }))
  }
}
