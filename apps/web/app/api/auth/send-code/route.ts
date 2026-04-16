import { NextResponse, type NextRequest } from 'next/server'
import {
  buildAuthErrorPayload,
  buildEmailLogContext,
  buildRequestIdResponseHeaders,
  extractErrorMessage,
  isRecord,
  ORBIT_REQUEST_ID_HEADER,
  resolveRequestId,
  resolveResponseRequestId,
} from '@/lib/auth-proxy'

/**
 * BFF: POST /api/auth/send-code
 * Proxies to .NET backend. Rate limiting is enforced by the backend.
 */
export async function POST(request: NextRequest) {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'
  const requestId = resolveRequestId(request.headers.get(ORBIT_REQUEST_ID_HEADER))
  const responseHeaders = buildRequestIdResponseHeaders(requestId)

  try {
    const body = await request.json() as unknown
    const bodyRecord = isRecord(body) ? body : {}

    const url = `${apiBase}/api/auth/send-code`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [ORBIT_REQUEST_ID_HEADER]: requestId,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json().catch(() => null)
    const backendRequestId = resolveResponseRequestId(response, requestId)
    responseHeaders.set(ORBIT_REQUEST_ID_HEADER, backendRequestId)

    if (!response.ok) {
      console.error('[auth/send-code] backend request failed', {
        requestId: backendRequestId,
        status: response.status,
        error: extractErrorMessage(data) ?? 'Authentication failed',
        language: typeof bodyRecord.language === 'string' ? bodyRecord.language : undefined,
        ...buildEmailLogContext(bodyRecord.email),
      })

      return NextResponse.json(buildAuthErrorPayload(data, backendRequestId), {
        status: response.status,
        headers: responseHeaders,
      })
    }

    return NextResponse.json(data, {
      headers: responseHeaders,
    })
  } catch (error: unknown) {
    console.error('[auth/send-code] unexpected error', {
      requestId,
      error,
    })

    return NextResponse.json(
      {
        error: 'Authentication failed',
        requestId,
      },
      {
        status: 500,
        headers: responseHeaders,
      },
    )
  }
}
