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
  'ai/',
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

const IP_PATTERN = /^[\d.:a-fA-F]+$/

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some(
    (prefix) => path.startsWith(prefix) || path === prefix.slice(0, -1)
  )
}

function safeDecodePath(path: string): string | null {
  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}

function validatePath(path: string | undefined): string | null {
  if (!path) return null
  const decoded = safeDecodePath(path)
  if (!decoded) return null
  if (
    path.includes('..') ||
    decoded.includes('..') ||
    path.includes('//') ||
    decoded.includes('//') ||
    path.includes('\\') ||
    decoded.includes('\\')
  ) {
    return null
  }
  if (!isAllowedPath(path)) return null
  return path
}

function sanitizeClientIp(headerValue: string | null): string {
  const candidate = headerValue?.split(',')[0]?.trim() ?? ''
  return IP_PATTERN.test(candidate) ? candidate : ''
}

function getForwardedClientIp(request: NextRequest): string {
  const forwarded = sanitizeClientIp(request.headers.get('x-forwarded-for'))
  if (forwarded) {
    return forwarded
  }

  return sanitizeClientIp(request.headers.get('x-real-ip'))
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
  const clientIp = getForwardedClientIp(request)
  if (clientIp) {
    headers['X-Forwarded-For'] = clientIp
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

const SAFE_FORWARD_HEADERS = [
  'content-type',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-total-count',
  'x-total-pages',
  'retry-after',
]

function buildResponseHeaders(source: Response): Headers {
  const result = new Headers()
  for (const name of SAFE_FORWARD_HEADERS) {
    const value = source.headers.get(name)
    if (value) result.set(name, value)
  }
  if (!result.has('content-type')) {
    result.set('content-type', 'application/json')
  }
  return result
}

async function toNextResponse(source: Response): Promise<NextResponse> {
  const body = await source.text()
  return new NextResponse(body, {
    status: source.status,
    headers: buildResponseHeaders(source),
  })
}

async function handleProxy(request: NextRequest, path: string) {
  const token = await getAuthToken()
  const response = await proxyRequest(request, path, token)

  if (response.status === 401) {
    const newToken = await tryRefreshSession()
    if (newToken) {
      const retryResponse = await proxyRequest(request, path, newToken)
      return toNextResponse(retryResponse)
    }
  }

  return toNextResponse(response)
}

/** Single handler for all HTTP methods -- eliminates S4144 duplicate functions */
async function handler(
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

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
}
