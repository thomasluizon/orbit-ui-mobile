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

const CONTENT_SECURITY_POLICY = 'Content-Security-Policy'
const STATIC_IMAGE_PATH = /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/

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
    `connect-src 'self' ${apiOrigin}${uploadBucketOrigin ? ` ${uploadBucketOrigin}` : ''}`,
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
    requestHost.toLowerCase() !== siteUrl.host
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
    STATIC_IMAGE_PATH.test(pathname)
  ) {
    return secureResponse(
      NextResponse.next({ request: { headers: requestHeaders } }),
      contentSecurityPolicy,
    )
  }

  const isPublic = isPublicPath(pathname)
  const shouldResolveSession = pathname === '/login' || !isPublic
  const session = shouldResolveSession
    ? await resolveProxySession(request)
    : { token: null, refreshedTokens: null }

  const accountId = session.token ? getAccountIdFromToken(session.token) : null
  if (accountId) requestHeaders.set(ACCOUNT_ID_HEADER, accountId)

  if (!session.token && !isPublic) {
    const url = new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
    url.search = request.nextUrl.search
    if (pathname.startsWith('/') && !pathname.startsWith('//')) {
      url.searchParams.set('returnUrl', pathname)
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
    await applyRefreshedSession(
      NextResponse.next({ request: { headers: requestHeaders } }),
      session.refreshedTokens,
    ),
    contentSecurityPolicy,
  )
}

export const config = {
  matcher: ['/((?!api/health$).*)'],
}
