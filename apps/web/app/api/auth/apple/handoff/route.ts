import { NextResponse, type NextRequest } from 'next/server'
import { API } from '@orbit/shared/api'
import { appleHandoffRequestSchema, backendLoginResponseSchema } from '@orbit/shared/types/auth'
import { API_VERSION_HEADERS } from '@/lib/api-version'
import { setSessionCookies } from '@/lib/auth-api'
import { buildBffForwardingHeaders } from '@/app/api/_utils/bff-forwarding'
import { getGoogleOAuthSessionOwner } from '@/lib/google-oauth-cookie'
import { APPLE_OAUTH_COOKIE, appleOAuthAttemptSchema } from '@/lib/apple-oauth-cookie'
import { buildAuthErrorPayload, buildRequestIdResponseHeaders, ORBIT_REQUEST_ID_HEADER, resolveRequestId, resolveResponseRequestId } from '@/lib/auth-proxy'

function isCancelled(request: NextRequest): boolean { return request.signal.aborted }

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(ORBIT_REQUEST_ID_HEADER))
  const headers = buildRequestIdResponseHeaders(requestId)
  headers.set('Cache-Control', 'no-store')
  let stored: unknown = null
  try { stored = JSON.parse(request.cookies.get(APPLE_OAUTH_COOKIE)?.value ?? 'null') } catch { stored = null }
  const pending = appleOAuthAttemptSchema.safeParse(stored)
  const handoff = appleHandoffRequestSchema.safeParse(await request.json().catch(() => null))
  if (!pending.success || !handoff.success || pending.data.state !== handoff.data.state) {
    return NextResponse.json({ error: 'Invalid OAuth state', requestId }, { status: 400, headers })
  }
  const finish = (response: NextResponse) => { response.cookies.delete(APPLE_OAUTH_COOKIE); return response }
  if (pending.data.sessionOwner !== getGoogleOAuthSessionOwner(request) || isCancelled(request)) {
    return finish(NextResponse.json({ error: 'Authentication session changed', requestId }, { status: 409, headers }))
  }
  try {
    const upstream = await fetch(`${process.env.API_BASE ?? 'http://localhost:5000'}${API.auth.appleHandoff}`, {
      method: 'POST', headers: { ...API_VERSION_HEADERS, ...buildBffForwardingHeaders(request),
        'Content-Type': 'application/json', [ORBIT_REQUEST_ID_HEADER]: requestId },
      body: JSON.stringify(handoff.data), cache: 'no-store', signal: request.signal,
    })
    const payload: unknown = await upstream.json().catch(() => null)
    const upstreamRequestId = resolveResponseRequestId(upstream, requestId)
    headers.set(ORBIT_REQUEST_ID_HEADER, upstreamRequestId)
    if (!upstream.ok) return finish(NextResponse.json(buildAuthErrorPayload(payload, upstreamRequestId), { status: upstream.status, headers }))
    const { token, refreshToken, ...profile } = backendLoginResponseSchema.parse(payload)
    if (isCancelled(request)) return finish(new NextResponse(null, { status: 409 }))
    const result = finish(NextResponse.json(profile, { headers }))
    await setSessionCookies(token, refreshToken, result.cookies)
    return result
  } catch {
    return finish(NextResponse.json({ error: 'Authentication failed', requestId }, { status: 500, headers }))
  }
}
