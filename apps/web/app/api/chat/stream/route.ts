import { type NextRequest } from 'next/server'
import { getAccountIdFromToken, resolveServerSession } from '@/lib/auth-api'
import { ACCOUNT_CHANGED_ERROR_CODE } from '@/app/actions/action-result'
import { buildForwardedClientHeaders } from '@/app/api/_utils/forwarded-client-context'
import { buildSessionRefreshHeaders } from '@/lib/session-refresh'

/**
 * BFF: streaming proxy for the chat SSE endpoint. The catch-all proxy buffers
 * response bodies, which would defeat token streaming, so the streamed leg
 * pipes the upstream body straight through. Auth mirrors the catch-all: cookie
 * session token plus a single refresh-token rotation on upstream 401.
 */

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

async function forwardStream(
  request: NextRequest,
  formData: FormData,
  token: string,
): Promise<Response> {
  return fetch(`${API_BASE}/api/chat/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...buildForwardedClientHeaders(request),
    },
    body: formData,
    cache: 'no-store',
    signal: request.signal,
  })
}

function unauthorizedResponse(refreshFailed: boolean): Response {
  return Response.json(
    { error: 'Unauthorized' },
    { status: 401, headers: buildSessionRefreshHeaders(refreshFailed) },
  )
}

function accountChangedResponse(): Response {
  return Response.json(
    { error: 'Account changed', errorCode: ACCOUNT_CHANGED_ERROR_CODE },
    { status: 409, headers: { 'cache-control': 'private, no-store, max-age=0' } },
  )
}

export async function POST(request: NextRequest) {
  const session = await resolveServerSession()
  if (!session.token) {
    return unauthorizedResponse(session.refreshFailed)
  }
  const heldAccountId = request.headers.get('x-orbit-held-account-id')
  if (!heldAccountId || getAccountIdFromToken(session.token) !== heldAccountId) {
    return accountChangedResponse()
  }

  const formData = await request.formData()
  let upstream = await forwardStream(request, formData, session.token)

  if (upstream.status === 401) {
    const refreshedSession = await resolveServerSession({ forceRefresh: true })
    if (!refreshedSession.token) {
      return unauthorizedResponse(refreshedSession.refreshFailed)
    }
    if (getAccountIdFromToken(refreshedSession.token) !== heldAccountId) {
      return accountChangedResponse()
    }
    upstream = await forwardStream(request, formData, refreshedSession.token)
  }

  if (!upstream.ok || !upstream.body) {
    const errorBody = await upstream.text()
    return new Response(errorBody, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'private, no-store, max-age=0',
      },
    })
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-store',
      'x-accel-buffering': 'no',
    },
  })
}
