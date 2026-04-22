import { NextResponse, type NextRequest } from 'next/server'
import {
  AUTH_COOKIE,
  REFRESH_COOKIE,
  clearRefreshCookie,
  resolveSessionTokens,
  setSessionCookies,
  type SessionTokens,
} from '@/lib/auth-api'

const PUBLIC_PATHS = [
  '/login',
  '/auth-callback',
  '/r/',
  '/privacy',
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow API routes and static assets to pass through
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/app-ads.txt'
  ) {
    return NextResponse.next()
  }

  const isPublic = isPublicPath(pathname)
  const shouldResolveSession = pathname === '/login' || !isPublic
  const session = shouldResolveSession
    ? await resolveProxySession(request)
    : { token: null, refreshedTokens: null, refreshCookieCleared: false }

  // Unauthenticated user on protected route: redirect to /login with returnUrl
  if (!session.token && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Only set returnUrl for paths that start with / and not //
    if (pathname.startsWith('/') && !pathname.startsWith('//')) {
      url.searchParams.set('returnUrl', pathname)
    }
    return NextResponse.redirect(url)
  }

  // Authenticated user on /login: redirect to /
  if (session.token && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return applyRefreshedSession(
      NextResponse.redirect(url),
      session.refreshedTokens,
      session.refreshCookieCleared,
    )
  }

  return applyRefreshedSession(
    NextResponse.next(),
    session.refreshedTokens,
    session.refreshCookieCleared,
  )
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icons, images
     */
    '/((?!_next/static|_next/image|favicon.ico|app-ads\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
