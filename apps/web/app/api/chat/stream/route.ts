import { type NextRequest } from 'next/server'
import { resolveServerSession } from '@/lib/auth-api'
import { buildForwardedClientHeaders } from '@/app/api/_utils/forwarded-client-context'

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
  })
}

export async function POST(request: NextRequest) {
  const session = await resolveServerSession()
  if (!session.token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  let upstream = await forwardStream(request, formData, session.token)

  if (upstream.status === 401) {
    const refreshedSession = await resolveServerSession({ forceRefresh: true })
    if (!refreshedSession.token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
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
