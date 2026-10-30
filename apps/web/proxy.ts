import { resolveRequestLanguage } from '@/lib/resolve-request-language'
import { NextResponse, type NextRequest } from 'next/server'
import {
  ACCOUNT_ID_HEADER,
  AUTH_COOKIE,
  REFRESH_COOKIE,
  getAccountIdFromToken,
  resolveSessionTokens,
  setSessionCookies,
  type SessionTokens,
} from '@/lib/auth-api'
import { accountEventApiBase } from '@/lib/account-event-api-base'
import { isPublicPath } from '@/lib/public-paths'
import { z } from 'zod'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'
import { desktopAttemptSchema } from '@/lib/desktop-auth'
import { mightBeServerReferenceId } from 'next/dist/shared/lib/server-reference-info'

const CONTENT_SECURITY_POLICY = 'Content-Security-Policy'
const STATIC_IMAGE_PATH = /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/
const PUBLIC_ROOT_FILES = new Set(['/sw.js', '/robots.txt'])
const desktopCallbackAttemptSchema = z.object({
  state: z.string().min(1),
  desktop: desktopAttemptSchema,
})

function redirectDesktopCallback(request: NextRequest): NextResponse | null {
  const params = request.nextUrl.searchParams
  if (request.nextUrl.pathname !== '/auth-callback' || params.get('provider') === 'apple') return null

  let stored: unknown = null
  try {
    stored = JSON.parse(request.cookies.get(GOOGLE_OAUTH_COOKIE)?.value ?? 'null')
  } catch { stored = null }
  const pending = desktopCallbackAttemptSchema.safeParse(stored)
  if (!pending.success || params.getAll('state').length !== 1 || params.get('state') !== pending.data.state) return null

  const query = new URLSearchParams()
  for (const key of ['code', 'state', 'error']) {
    const values = params.getAll(key)
    if (values.length === 1) query.set(key, values[0]!)
  }
  return NextResponse.redirect(new URL(`/api/auth/desktop/callback?${query}`, request.url), {
    status: 307,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })
}

async function resolveProxySession(request: NextRequest): Promise<{
  token: string | null
  refreshedTokens: SessionTokens | null
}> {
  const authToken = request.cookies.get(AUTH_COOKIE)?.value ?? null
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value ?? null
  let refreshedTokens: SessionTokens | null = null

  const session = await resolveSessionTokens({
    authToken,
    refreshToken,
    language: resolveRequestLanguage(request.cookies.get('i18n_locale')?.value, request.headers.get('accept-language')),
    persistSession: (tokens) => {
      refreshedTokens = tokens
    },
  })

  return {
    token: session.token,
    refreshedTokens,
  }
}

async function applyRefreshedSession(
  response: NextResponse,
  refreshedTokens: SessionTokens | null,
): Promise<NextResponse> {
  if (refreshedTokens) {
    await setSessionCookies(
      refreshedTokens.token,
      refreshedTokens.refreshToken,
      response.cookies,
    )
  }

  return response
}

function createContentSecurityPolicy(nonce: string): string {
  const uploadBucketOrigin = process.env.NEXT_PUBLIC_UPLOAD_BUCKET_ORIGIN
    ? new URL(process.env.NEXT_PUBLIC_UPLOAD_BUCKET_ORIGIN).origin
    : null
  const apiOrigin = new URL(accountEventApiBase()).origin
  const developmentScriptSource =
    process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScriptSource}`,
    "style-src 'self' 'unsafe-inline'",
    "frame-src https://challenges.cloudflare.com",
    `img-src 'self' blob: data: ${apiOrigin}${uploadBucketOrigin ? ` ${uploadBucketOrigin}` : ''}`,
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin}${uploadBucketOrigin ? ` ${uploadBucketOrigin}` : ''} blob:`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

function secureResponse(response: NextResponse, contentSecurityPolicy: string) {
  response.headers.set(CONTENT_SECURITY_POLICY, contentSecurityPolicy)
  return response
}

function isStaleServerAction(request: NextRequest) {
  const clientDeploymentId = request.headers.get('x-deployment-id')
  const deploymentId = process.env.NEXT_PUBLIC_WEB_COMMIT_SHA
  return request.method === 'POST' && request.headers.has('next-action') &&
    deploymentId && clientDeploymentId && clientDeploymentId !== deploymentId
}

async function isMalformedServerAction(request: NextRequest): Promise<boolean> {
  if (request.method !== 'POST') return false
  const actionId = request.headers.get('next-action')
  if (actionId === null) return false
  if (!mightBeServerReferenceId(actionId)) return true
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.startsWith('multipart/form-data')) return false
  try {
    await request.clone().formData()
    return false
  } catch {
    return true
  }
}

async function rejectServerAction(request: NextRequest, contentSecurityPolicy: string): Promise<Response | null> {
  if (await isMalformedServerAction(request)) {
    return new Response(null, {
      status: 400,
      headers: { 'Cache-Control': 'no-store', [CONTENT_SECURITY_POLICY]: contentSecurityPolicy },
    })
  }

  if (isStaleServerAction(request)) {
    return new Response(null, {
      status: 409,
      headers: {
        'x-nextjs-action-not-found': '1',
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
        [CONTENT_SECURITY_POLICY]: contentSecurityPolicy,
      },
    })
  }

  return null
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const contentSecurityPolicy = createContentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set(CONTENT_SECURITY_POLICY, contentSecurityPolicy)
  requestHeaders.delete(ACCOUNT_ID_HEADER)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : null
  const requestHost = request.headers.get('host')
  if (
    pathname !== '/api/health' &&
    siteUrl &&
    siteUrl.hostname !== 'localhost' &&
    requestHost &&
    requestHost.toLowerCase() !== siteUrl.host &&
    request.headers.get('x-forwarded-host')?.toLowerCase() !== siteUrl.host
  ) {
    const redirectUrl = new URL(siteUrl.origin)
    redirectUrl.pathname = pathname
    redirectUrl.search = request.nextUrl.search
    return secureResponse(
      NextResponse.redirect(redirectUrl, 308),
      contentSecurityPolicy,
    )
  }

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    STATIC_IMAGE_PATH.test(pathname) ||
    PUBLIC_ROOT_FILES.has(pathname)
  ) {
    return secureResponse(
      NextResponse.next({ request: { headers: requestHeaders } }),
      contentSecurityPolicy,
    )
  }

  const actionRejection = await rejectServerAction(request, contentSecurityPolicy)
  if (actionRejection) return actionRejection

  const isPublic = isPublicPath(pathname)
  const shouldResolveSession = pathname === '/login' || !isPublic
  const session = shouldResolveSession
    ? await resolveProxySession(request)
    : { token: null, refreshedTokens: null }

  const accountId = session.token ? getAccountIdFromToken(session.token) : null
  if (accountId) requestHeaders.set(ACCOUNT_ID_HEADER, accountId)

  if (!session.token && !isPublic) {
    const url = new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
    if (pathname.startsWith('/') && !pathname.startsWith('//')) {
      url.searchParams.set('returnUrl', pathname + request.nextUrl.search)
    }
    return secureResponse(NextResponse.redirect(url), contentSecurityPolicy)
  }

  if (session.token && pathname === '/login' && request.nextUrl.searchParams.get('googleError') !== '1') {
    const url = new URL('/', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
    return secureResponse(
      await applyRefreshedSession(
        NextResponse.redirect(url),
        session.refreshedTokens,
      ),
      contentSecurityPolicy,
    )
  }

  return secureResponse(
    redirectDesktopCallback(request) ?? await applyRefreshedSession(
      NextResponse.next({ request: { headers: requestHeaders } }),
      session.refreshedTokens,
    ),
    contentSecurityPolicy,
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api/health$|manifest\\.webmanifest$|pwa-(?:192x192|512x512|maskable-512x512)\\.png$).*)'],
}
