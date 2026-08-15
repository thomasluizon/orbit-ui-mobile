import { NextResponse, type NextRequest } from 'next/server'
import {
  AUTH_COOKIE,
  REFRESH_COOKIE,
  clearRefreshCookie,
  resolveSessionTokens,
  setSessionCookies,
  type SessionTokens,
} from '@/lib/auth-api'

const CONTENT_SECURITY_POLICY = 'Content-Security-Policy'
const STATIC_IMAGE_PATH = /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/

const PUBLIC_PATHS = [
  '/login',
  '/onboarding',
  '/auth-callback',
  '/r/',
  '/terms',
  '/privacy',
  '/delete-account',
  '/.well-known',
  '/app-ads.txt',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (publicPath) =>
      pathname === publicPath || pathname.startsWith(publicPath + '/')
  )
}

async function resolveProxySession(request: NextRequest): Promise<{
  token: string | null
  refreshedTokens: SessionTokens | null
  refreshCookieCleared: boolean
}> {
  const authToken = request.cookies.get(AUTH_COOKIE)?.value ?? null
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value ?? null
  let refreshedTokens: SessionTokens | null = null
  let refreshCookieCleared = false

  const session = await resolveSessionTokens({
    authToken,
    refreshToken,
    persistSession: (tokens) => {
      refreshedTokens = tokens
    },
    clearRefreshToken: () => {
      refreshCookieCleared = true
    },
  })

  return {
    token: session.token,
    refreshedTokens,
    refreshCookieCleared,
  }
}

async function applyRefreshedSession(
  response: NextResponse,
  refreshedTokens: SessionTokens | null,
  refreshCookieCleared = false,
): Promise<NextResponse> {
  if (refreshedTokens) {
    await setSessionCookies(
      refreshedTokens.token,
      refreshedTokens.refreshToken,
      response.cookies,
    )
  } else if (refreshCookieCleared) {
    await clearRefreshCookie(response.cookies)
  }

  return response
}

function createContentSecurityPolicy(nonce: string): string {
  const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)

  const websocketUrl = new URL(supabaseUrl.origin)
  websocketUrl.protocol = supabaseUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  const developmentScriptSource =
    process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScriptSource}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabaseUrl.origin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseUrl.origin} ${websocketUrl.origin}`,
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

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/app-ads.txt' ||
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
    : { token: null, refreshedTokens: null, refreshCookieCleared: false }

  if (!session.token && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    if (pathname.startsWith('/') && !pathname.startsWith('//')) {
      url.searchParams.set('returnUrl', pathname)
    }
    return secureResponse(NextResponse.redirect(url), contentSecurityPolicy)
  }

  if (session.token && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return secureResponse(
      await applyRefreshedSession(
        NextResponse.redirect(url),
        session.refreshedTokens,
        session.refreshCookieCleared,
      ),
      contentSecurityPolicy,
    )
  }

  return secureResponse(
    await applyRefreshedSession(
      NextResponse.next({ request: { headers: requestHeaders } }),
      session.refreshedTokens,
      session.refreshCookieCleared,
    ),
    contentSecurityPolicy,
  )
}

export const config = {
  matcher: ['/:path*'],
}
