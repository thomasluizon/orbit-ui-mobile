import { NextResponse, type NextRequest } from 'next/server'
import { getAuthToken, tryRefreshSession } from '@/lib/auth-api'

/**
 * BFF: Catch-all proxy for API routes.
 * Forwards requests to the .NET backend with the auth token from cookie.
 * On 401, tries a single refresh-token rotation before failing.
 */

const ALLOWED_PREFIXES = [
  'auth/',
  'profile/',
  'chat/',
  'user-facts/',
  'support/',
  'tags/',
  'notifications/',
  'subscriptions/',
  'config/',
  'calendar/',
  'goals/',
  'referrals/',
  'gamification/',
  'api-keys/',
  'checklist-templates/',
  'sync/',
  'habits/',
]

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some(
    (prefix) => path.startsWith(prefix) || path === prefix.slice(0, -1)
  )
}

function validatePath(path: string | undefined): string | null {
  if (!path) return null
  if (path.includes('..') || decodeURIComponent(path).includes('..')) return null
  if (!isAllowedPath(path)) return null
  return path
}

function buildCleanQuery(url: URL): string {
  const params = new URLSearchParams()
  url.searchParams.forEach((value, key) => {
    if (value !== undefined && value !== null) {
      params.append(key, value)
    }
  })
  return params.toString()
}

async function proxyRequest(
  request: NextRequest,
  apiPath: string,
  token: string | null,
): Promise<Response> {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'
  const queryString = buildCleanQuery(new URL(request.url))
  const targetUrl = queryString
    ? `${apiBase}/api/${apiPath}?${queryString}`
    : `${apiBase}/api/${apiPath}`

  const method = request.method
  const headers: Record<string, string> = {}

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Forward client IP for rate limiting and geolocation
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  if (forwarded) {
    headers['X-Forwarded-For'] = forwarded
  } else if (realIp) {
    headers['X-Forwarded-For'] = realIp
  }

  const hasBody =
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE'

  let body: BodyInit | undefined
  if (hasBody) {
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      // Forward multipart form data as-is
      body = await request.formData()
    } else {
      const rawBody = await request.text().catch(() => '')
      if (rawBody) {
        headers['Content-Type'] = 'application/json'
        body = rawBody
      }
    }
  }

  return fetch(targetUrl, { method, headers, body })
}

async function handleProxy(request: NextRequest, path: string) {
  const token = await getAuthToken()

  const response = await proxyRequest(request, path, token)

  if (response.status === 401) {
    // Try refresh-token rotation
    const newToken = await tryRefreshSession()
    if (newToken) {
      const retryResponse = await proxyRequest(request, path, newToken)
      const retryData = await retryResponse.text()
      const retryHeaders = new Headers()
      const forwardHeaders = ['content-type', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-total-count', 'x-total-pages', 'retry-after']
      for (const name of forwardHeaders) {
        const value = retryResponse.headers.get(name)
        if (value) retryHeaders.set(name, value)
      }
      if (!retryHeaders.has('content-type')) {
        retryHeaders.set('content-type', 'application/json')
      }
      return new NextResponse(retryData, {
        status: retryResponse.status,
        headers: retryHeaders,
      })
    }
  }

  const data = await response.text()
  const responseHeaders = new Headers()
  // Forward safe response headers from backend
  const forwardHeaders = ['content-type', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-total-count', 'x-total-pages', 'retry-after']
  for (const name of forwardHeaders) {
    const value = response.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', 'application/json')
  }

  return new NextResponse(data, {
    status: response.status,
    headers: responseHeaders,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params
  const path = segments.join('/')
  const validated = validatePath(path)
  if (!validated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return handleProxy(request, validated)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params
  const path = segments.join('/')
  const validated = validatePath(path)
  if (!validated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return handleProxy(request, validated)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params
  const path = segments.join('/')
  const validated = validatePath(path)
  if (!validated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return handleProxy(request, validated)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params
  const path = segments.join('/')
  const validated = validatePath(path)
  if (!validated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return handleProxy(request, validated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params
  const path = segments.join('/')
  const validated = validatePath(path)
  if (!validated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return handleProxy(request, validated)
}
