import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/auth-callback', '/r/', '/privacy']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (publicPath) =>
      pathname === publicPath || pathname.startsWith(publicPath + '/')
  )
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('auth_token')?.value

  // Allow API routes and static assets to pass through
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
    return NextResponse.next()
  }

  const isPublic = isPublicPath(pathname)

  // Unauthenticated user on protected route: redirect to /login with returnUrl
  if (!token && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Only set returnUrl for paths that start with / and not //
    if (pathname.startsWith('/') && !pathname.startsWith('//')) {
      url.searchParams.set('returnUrl', pathname)
    }
    return NextResponse.redirect(url)
  }

  // Authenticated user on /login: redirect to /
  if (token && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icons, images
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
